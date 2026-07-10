import Dexie, { type EntityTable } from 'dexie'
import { journalId } from '../lib/sync'
import type {
  Block,
  Goal,
  Grade,
  Ranged,
  Ritual,
  Todo,
  Watch,
  WeekItem,
} from '../lib/types'

/*
 * Local-first persistence (IndexedDB via Dexie). No server.
 *
 * Notes are stored as records; the review history lives in a dedicated
 * `ledger` table (one row per review event) rather than embedded in the srs
 * record — the in-memory `hist[]` is reconstructed from it on hydrate.
 *
 * Dates are stored as absolute epoch-days (createdDay / updatedDay / dueDay /
 * ledger.day) so scheduling is anchored in real time.
 *
 * `createdAt` / `updatedAt` are epoch MILLISECONDS and exist for sync only. Day
 * granularity cannot order two edits made on the same day, so a sync would pick
 * a winner by coin-flip. They're optional because rows written before v3 (and
 * rows from an old JSON export) predate them; read through `noteUpdatedAt`.
 */

export interface FolderRow {
  id: string
  name: string
  parentId: string | null
  createdAt?: number
  updatedAt?: number
}

export interface NoteRow {
  id: string
  title: string
  folderId: string
  tags: string[]
  createdDay: number
  updatedDay: number
  createdAt?: number
  updatedAt?: number
  blocks: Block[]
}

/** Current scheduling state for an in-review note. */
export interface SrsRow {
  noteId: string
  ease: number
  ivl: number
  dueDay: number
}

/** One review event — the SRS ledger. */
export interface LedgerRow {
  id?: number
  noteId: string
  day: number
  grade: Grade
  ivl: number
}

export interface JournalRow {
  id?: number
  /**
   * Stable cross-device id, derived from the day (see `journalId`). The `++id`
   * primary key restarts at 1 on every device, so two phones would both call
   * their first entry "1" and sync would treat them as the same thought.
   */
  sid?: string
  /** Last edit, epoch ms — the journal's entry is rewritten as the day goes on. */
  updatedAt?: number
  /** Absolute epoch-day the entry was written (so entries age). */
  day?: number
  /** Legacy relative offset (older rows); read via fallback. */
  off?: number
  /** Plaintext (only when the journal has no passphrase). */
  words?: number
  text?: string
  /** Encrypted payload {text, words} once a passphrase is set. */
  enc?: { iv: string; ct: string }
}

/*
 * Every small collection carries an `updatedAt` in epoch milliseconds so sync
 * can decide which device edited a todo last. Optional because rows written
 * before v3 predate the column; a missing stamp reads as 0, which means "any
 * real edit anywhere beats this".
 */
export type Stamped<T> = T & { updatedAt?: number }

export type TodoRow = Stamped<Todo>
export type GoalRow = Stamped<Goal>
export type WeekRow = Stamped<WeekItem>
export type RitualRow = Stamped<Ritual>
export type RangedRow = Stamped<Ranged>

/** Watch item + a monotonic sort key so newest-first order survives reloads. */
export type WatchRow = Stamped<Watch> & { addedAt: number }

/** A saved past version of a note (coalesced ~one per editing burst). */
export interface RevisionRow {
  id?: number
  noteId: string
  savedAt: number // epoch ms
  title: string
  blocks: Block[]
}

/** A deleted note, kept for recovery (the recycle bin). */
export interface TrashRow extends NoteRow {
  deletedAt: number // epoch ms
  /** SRS scheduling snapshot (absolute), so review state survives a restore. */
  srs?: { ease: number; ivl: number; dueDay: number }
}

/*
 * A deletion, remembered forever.
 *
 * The recycle bin can't serve this purpose: it purges after 30 days, and a note
 * that merely *stops existing* is indistinguishable from a note this device has
 * never seen. Without a tombstone the other device would helpfully sync it back.
 */
export interface TombstoneRow {
  id: string
  deletedAt: number // epoch ms
}

/** Key/value bag for shared bits (tag vocabulary, install marker, …). */
export interface MetaRow {
  key: string
  value: unknown
}

export const db = new Dexie('noto') as Dexie & {
  folders: EntityTable<FolderRow, 'id'>
  notes: EntityTable<NoteRow, 'id'>
  srs: EntityTable<SrsRow, 'noteId'>
  ledger: EntityTable<LedgerRow, 'id'>
  todos: EntityTable<TodoRow, 'id'>
  goals: EntityTable<GoalRow, 'id'>
  week: EntityTable<WeekRow, 'id'>
  rituals: EntityTable<RitualRow, 'id'>
  ranged: EntityTable<RangedRow, 'id'>
  watch: EntityTable<WatchRow, 'id'>
  journal: EntityTable<JournalRow, 'id'>
  meta: EntityTable<MetaRow, 'key'>
  revisions: EntityTable<RevisionRow, 'id'>
  trash: EntityTable<TrashRow, 'id'>
  tombstones: EntityTable<TombstoneRow, 'id'>
}

const DAY_MS = 86_400_000

/** Digits of a legacy id. Pre-v3 uids were `Date.now() * 1000 + seq`. */
const numId = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0

/** When a row was written, in ms — synthesised for rows that predate the column. */
export const noteCreatedAt = (r: NoteRow): number =>
  r.createdAt ?? (numId(r.id) > 1e12 ? Math.floor(numId(r.id) / 1000) : r.createdDay * DAY_MS)

export const noteUpdatedAt = (r: NoteRow): number => r.updatedAt ?? r.updatedDay * DAY_MS

export const folderCreatedAt = (r: FolderRow): number =>
  r.createdAt ?? (numId(r.id) > 1e12 ? Math.floor(numId(r.id) / 1000) : numId(r.id))

db.version(1).stores({
  folders: 'id, parentId',
  notes: 'id, folderId',
  srs: 'noteId',
  ledger: '++id, noteId',
  todos: 'id',
  goals: 'id',
  week: 'id, day',
  rituals: 'id',
  ranged: 'id',
  watch: 'id',
  journal: '++id',
  meta: 'key',
})

// v2 — note version history (drafts) + the recycle bin. Existing tables carry
// forward; Dexie just adds the two new stores on upgrade.
db.version(2).stores({
  revisions: '++id, noteId, savedAt',
  trash: 'id, deletedAt',
})

/** 32 bits of entropy — enough that two devices never mint the same id. */
export function syncId(prefix: string): string {
  const b = new Uint8Array(4)
  crypto.getRandomValues(b)
  return `${prefix}${Date.now().toString(36)}-${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`
}

/*
 * v3 — durable tombstones, so a deletion outlives the 30-day recycle bin and a
 * device that has been offline longer can't resurrect what you threw away.
 *
 * The columns sync needs (ms timestamps, journal ids) are filled by
 * `repairForSync()` rather than an upgrade hook — see the note there.
 */
db.version(3).stores({ tombstones: 'id, deletedAt' })

/** v4 — the journal needs an index on its new cross-device id. */
db.version(4).stores({ journal: '++id, sid' })

/** A list row's edit time. Rows written before the column read as "unknown, so lose". */
export const stampOf = (row: { updatedAt?: number }): number => row.updatedAt ?? 0

const LIST_TABLES = ['todos', 'goals', 'week', 'rituals', 'ranged', 'watch'] as const

/*
 * Fill in the columns sync depends on, wherever they're missing.
 *
 * This is deliberately NOT a Dexie `.upgrade()` hook. Dexie skips upgrade
 * callbacks entirely when it creates a database from scratch, so a freshly
 * seeded vault would start life with no `sid` on its journal and no `updatedAt`
 * on its todos — and the first sync would mint a new id for every entry, every
 * time. An idempotent repair covers the fresh install, the upgraded install and
 * the JSON import with one code path, and costs one scan of some small tables.
 *
 * It only ever writes rows that are actually missing something.
 */
export async function repairForSync(): Promise<void> {
  const journalRows = await db.journal.toArray()
  const taken = new Set(journalRows.map((j) => j.sid).filter(Boolean) as string[])

  for (const j of journalRows) {
    if (j.sid && j.updatedAt !== undefined) continue

    if (!j.sid) {
      // The day is the identity — but a legacy vault can hold two rows for one
      // day, and quietly collapsing them into one would lose an entry.
      let candidate = typeof j.day === 'number' ? journalId(j.day) : syncId('j')
      for (let n = 2; taken.has(candidate); n++) candidate = `${candidate.split('-')[0]}-${n}`
      j.sid = candidate
      taken.add(candidate)
    }
    j.updatedAt ??= (j.day ?? 0) * DAY_MS
    await db.journal.put(j)
  }

  for (const name of LIST_TABLES) {
    const table = db.table<{ id: string; updatedAt?: number }>(name)
    // 0, not now(): we genuinely don't know when this was written, and any real
    // edit on another device should outrank a guess.
    const stale = (await table.toArray()).filter((r) => r.updatedAt === undefined)
    if (stale.length) await table.bulkPut(stale.map((r) => ({ ...r, updatedAt: 0 })))
  }

  const notes = (await db.notes.toArray()).filter((n) => n.createdAt === undefined || n.updatedAt === undefined)
  if (notes.length) {
    await db.notes.bulkPut(notes.map((n) => ({ ...n, createdAt: noteCreatedAt(n), updatedAt: noteUpdatedAt(n) })))
  }

  const folders = (await db.folders.toArray()).filter((f) => f.createdAt === undefined || f.updatedAt === undefined)
  if (folders.length) {
    await db.folders.bulkPut(folders.map((f) => ({ ...f, createdAt: folderCreatedAt(f), updatedAt: f.updatedAt ?? 0 })))
  }

  // Notes already sitting in the bin are deletions that must propagate too.
  const binned = await db.trash.toArray()
  if (binned.length) {
    const known = new Set((await db.tombstones.toArray()).map((t) => t.id))
    const missing = binned.filter((t) => !known.has(t.id))
    if (missing.length) await db.tombstones.bulkPut(missing.map((t) => ({ id: t.id, deletedAt: t.deletedAt })))
  }
}
