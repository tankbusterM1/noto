/*
 * The bridge between this device's IndexedDB and the shared vault format.
 *
 * Everything platform-specific lives here. `src/lib/sync.ts` stays pure so the
 * iOS app can share it byte for byte; this file is the desktop half of the
 * translation, and `mobile/src/vault.ts` is its twin.
 *
 * The one rule worth stating: nothing readable leaves this file. A journal entry
 * is pushed only if it is already ciphertext. If the journal has no passphrase,
 * its entries stay on this machine and the caller is told how many were held back.
 */

import { db, folderCreatedAt, noteCreatedAt, noteUpdatedAt, stampOf, syncId, type NoteRow } from './db'
import { toCard, type ByteCard } from '../lib/bytes'
import { DEFAULT_ITERATIONS } from '../lib/crypto'
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown'
import { replayLedger } from '../lib/srs'
import {
  emptyLists,
  journalId,
  LIST_NAMES,
  serializeNote,
  type Cipher,
  type JournalBlob,
  type LedgerEntry,
  type ListName,
  type SyncRow,
  type Vault,
  type VaultCrypto,
} from '../lib/sync'
import type { Grade } from '../lib/types'

const DAY_MS = 86_400_000

/** A name for the commit message. Stable per browser profile. */
export async function deviceName(): Promise<string> {
  const row = await db.meta.get('deviceName')
  if (typeof row?.value === 'string') return row.value
  const ua = navigator.userAgent
  const os = /Windows/.test(ua) ? 'windows' : /Mac/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'desktop'
  const name = `${os}-${syncId('').slice(0, 6)}`
  await db.meta.put({ key: 'deviceName', value: name })
  return name
}

/** The six small collections, in the order the wire format names them. */
const listTable = (name: ListName) => db.table<{ id: string; updatedAt?: number }>(name)

// ── read ──────────────────────────────────────────────────────────────
export interface LocalVault {
  vault: Vault
  /** Journal entries withheld because they are not encrypted. */
  plaintextHeld: number
}

export async function readVault(): Promise<LocalVault> {
  const [noteRows, folderRows, srsRows, ledgerRows, journalRows, tombRows, metaRows, byteRows] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.srs.toArray(),
    db.ledger.toArray(),
    db.journal.toArray(),
    db.tombstones.toArray(),
    db.meta.toArray(),
    db.bytes.toArray(),
  ])

  let plaintextHeld = 0
  const journal: JournalBlob[] = []
  for (const j of journalRows) {
    if (!j.enc) {
      plaintextHeld++ // never upload a journal we can't encrypt
      continue
    }
    const day = j.day ?? 0
    journal.push({
      // A missing sid means this row predates v4; the day is its identity.
      id: j.sid ?? journalId(day),
      day,
      iv: j.enc.iv,
      ct: j.enc.ct,
      createdAt: day * DAY_MS,
      updatedAt: j.updatedAt ?? day * DAY_MS,
    })
  }

  const meta = new Map(metaRows.map((m) => [m.key, m.value]))
  const scratchEnc = meta.get('scratchpadEnc') as Cipher | undefined
  const scratchAt = (meta.get('scratchpadAt') as number | undefined) ?? 0

  // Vaults encrypted before the iteration count was recorded used DEFAULT_ITERATIONS.
  // Publishing it as `undefined` would make the phone derive a different key and
  // decide the passphrase was wrong.
  const stored = meta.get('journalCrypto') as (Omit<VaultCrypto, 'iterations'> & { iterations?: number }) | undefined
  const crypto: VaultCrypto | null = stored ? { ...stored, iterations: stored.iterations ?? DEFAULT_ITERATIONS } : null

  const lists = emptyLists()
  for (const name of LIST_NAMES) {
    const rows = await listTable(name).toArray()
    // Verbatim: every field the app stores rides along, so a device that has
    // never heard of `watch.thumb` can't drop it on the way through. `loading`
    // is the exception — it means "a scrape is in flight on this machine", and
    // syncing it mid-scrape would leave the other device with a permanent spinner.
    lists[name] = rows.map(({ loading: _inFlight, ...r }: { loading?: boolean; id: string; updatedAt?: number }) => ({
      ...r,
      id: r.id,
      updatedAt: stampOf(r),
    }) as SyncRow)
  }

  const vault: Vault = {
    notes: noteRows.map((r) => ({
      id: r.id,
      title: r.title,
      folderId: r.folderId,
      tags: r.tags,
      body: blocksToMarkdown(r.blocks),
      createdAt: noteCreatedAt(r),
      updatedAt: noteUpdatedAt(r),
    })),
    folders: folderRows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      createdAt: folderCreatedAt(r),
      updatedAt: r.updatedAt ?? 0,
    })),
    srs: srsRows.map((r) => ({ noteId: r.noteId, ease: r.ease, ivl: r.ivl, dueDay: r.dueDay })),
    ledger: ledgerRows.map((l) => ({ noteId: l.noteId, day: l.day, grade: l.grade, ivl: l.ivl })),
    journal,
    scratchpad: scratchEnc ? { ...scratchEnc, updatedAt: scratchAt } : null,
    lists,
    bytes: byteRows.map((r) => ({ ...r, id: r.id, updatedAt: stampOf(r) }) as SyncRow),
    tagsPool: (meta.get('tagsPool') as string[] | undefined) ?? [],
    tombstones: tombRows.map((t) => ({ id: t.id, deletedAt: t.deletedAt })),
    crypto,
  }

  return { vault, plaintextHeld }
}

// ── write ─────────────────────────────────────────────────────────────
export interface ApplyStats {
  notesWritten: number
  notesRemoved: number
  ledgerAdded: number
  journalWritten: number
  listRowsWritten: number
}

/** Fold a merged vault back into IndexedDB. Only what actually differs is touched. */
export async function writeVault(v: Vault): Promise<ApplyStats> {
  const stats: ApplyStats = { notesWritten: 0, notesRemoved: 0, ledgerAdded: 0, journalWritten: 0, listRowsWritten: 0 }
  const tombstoned = new Set(v.tombstones.map((t) => t.id))

  const localNotes = new Map((await db.notes.toArray()).map((r) => [r.id, r]))
  const incoming: NoteRow[] = []

  for (const n of v.notes) {
    const cur = localNotes.get(n.id)
    // Compare on the wire form. Re-parsing markdown we ourselves produced would
    // mint fresh block ids and rewrite the note on every sync for no reason.
    if (
      cur &&
      serializeNote({
        id: cur.id,
        title: cur.title,
        folderId: cur.folderId,
        tags: cur.tags,
        body: blocksToMarkdown(cur.blocks),
        createdAt: noteCreatedAt(cur),
        updatedAt: noteUpdatedAt(cur),
      }) === serializeNote(n)
    ) {
      continue
    }

    incoming.push({
      id: n.id,
      title: n.title,
      folderId: n.folderId,
      tags: n.tags,
      createdDay: Math.floor(n.createdAt / DAY_MS),
      updatedDay: Math.floor(n.updatedAt / DAY_MS),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      blocks: markdownToBlocks(n.body),
    })
  }
  if (incoming.length) await db.notes.bulkPut(incoming)
  stats.notesWritten = incoming.length

  // Notes the merge deleted: gone from `v.notes`, and a tombstone says why.
  const alive = new Set(v.notes.map((n) => n.id))
  const doomed = [...localNotes.keys()].filter((id) => !alive.has(id) && tombstoned.has(id))
  if (doomed.length) {
    await db.notes.bulkDelete(doomed)
    await db.srs.bulkDelete(doomed)
    stats.notesRemoved = doomed.length
  }

  const localFolders = new Map((await db.folders.toArray()).map((f) => [f.id, f]))
  await db.folders.bulkPut(
    v.folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      // Prefer the real local value: a vault written before folders carried
      // `createdAt` sends 0, and adopting that would scramble the sidebar order.
      createdAt: f.createdAt || (localFolders.has(f.id) ? folderCreatedAt(localFolders.get(f.id)!) : 0),
      updatedAt: f.updatedAt,
    })),
  )
  const liveFolders = new Set(v.folders.map((f) => f.id))
  const goneFolders = [...localFolders.keys()].filter((id) => !liveFolders.has(id) && tombstoned.has(id))
  if (goneFolders.length) await db.folders.bulkDelete(goneFolders)

  // The ledger is append-only: add what we don't have, never rewrite.
  const have = new Set((await db.ledger.toArray()).map((l) => `${l.noteId}|${l.day}|${l.grade}|${l.ivl}`))
  const newRows = v.ledger.filter((l) => !have.has(`${l.noteId}|${l.day}|${l.grade}|${l.ivl}`))
  if (newRows.length) {
    await db.ledger.bulkAdd(newRows.map((l) => ({ noteId: l.noteId, day: l.day, grade: l.grade as Grade, ivl: l.ivl })))
    stats.ledgerAdded = newRows.length
  }

  // Rebuild scheduling from the merged history; notes with no history keep the
  // state that travelled with them (that's how "in review, never reviewed" survives).
  const byNote = new Map<string, LedgerEntry[]>()
  for (const l of v.ledger) {
    const arr = byNote.get(l.noteId)
    if (arr) arr.push(l)
    else byNote.set(l.noteId, [l])
  }
  const srsRows = v.srs
    .filter((s) => alive.has(s.noteId))
    .map((s) => replayLedger(byNote.get(s.noteId) ?? []) ?? s)
    .map((s) => ({ noteId: s.noteId, ease: s.ease, ivl: s.ivl, dueDay: s.dueDay }))
  if (srsRows.length) await db.srs.bulkPut(srsRows)

  // Journal: LWW, so an entry rewritten on the phone must overwrite ours, not
  // merely be skipped as "already known".
  const localJournal = await db.journal.toArray()
  const bySid = new Map(localJournal.filter((j) => j.sid).map((j) => [j.sid!, j]))
  for (const blob of v.journal) {
    const cur = bySid.get(blob.id)
    if (cur && (cur.updatedAt ?? 0) >= blob.updatedAt) continue
    await db.journal.put({
      ...(cur?.id !== undefined ? { id: cur.id } : {}),
      sid: blob.id,
      day: blob.day,
      updatedAt: blob.updatedAt,
      enc: { iv: blob.iv, ct: blob.ct },
    })
    stats.journalWritten++
  }
  const goneJournal = localJournal.filter((j) => j.sid && tombstoned.has(j.sid) && !v.journal.some((b) => b.id === j.sid))
  for (const j of goneJournal) if (j.id !== undefined) await db.journal.delete(j.id)

  for (const name of LIST_NAMES) {
    const table = listTable(name)
    const localIds = new Set((await table.toArray()).map((r) => r.id))
    const rows = v.lists[name]
    if (rows.length) {
      await table.bulkPut(rows as { id: string; updatedAt?: number }[])
      stats.listRowsWritten += rows.length
    }
    const live = new Set(rows.map((r) => r.id))
    const removed = [...localIds].filter((id) => !live.has(id) && tombstoned.has(id))
    if (removed.length) await table.bulkDelete(removed)
  }

  // Bytes cards: put what's here (coerced defensively), drop what a tombstone killed.
  {
    const localByteIds = new Set((await db.bytes.toArray()).map((r) => r.id))
    const cards = (v.bytes ?? []).map(toCard).filter((c): c is ByteCard => c !== null)
    if (cards.length) await db.bytes.bulkPut(cards)
    const live = new Set(cards.map((c) => c.id))
    const gone = [...localByteIds].filter((id) => !live.has(id) && tombstoned.has(id))
    if (gone.length) await db.bytes.bulkDelete(gone)
  }

  if (v.tagsPool.length) await db.meta.put({ key: 'tagsPool', value: v.tagsPool })
  if (v.scratchpad) {
    const localAt = ((await db.meta.get('scratchpadAt'))?.value as number | undefined) ?? 0
    if (v.scratchpad.updatedAt > localAt) {
      await db.meta.put({ key: 'scratchpadEnc', value: { iv: v.scratchpad.iv, ct: v.scratchpad.ct } })
      await db.meta.put({ key: 'scratchpadAt', value: v.scratchpad.updatedAt })
    }
  }

  if (v.tombstones.length) await db.tombstones.bulkPut(v.tombstones)
  if (v.crypto) await db.meta.put({ key: 'journalCrypto', value: v.crypto })

  return stats
}
