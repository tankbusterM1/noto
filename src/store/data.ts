import { create } from 'zustand'
import { db, folderCreatedAt, noteCreatedAt, repairForSync, type RevisionRow, type TrashRow } from '../data/db'
import { deviceName, readVault, writeVault } from '../data/vault'
import { toCard, byteId, type ByteCard } from '../lib/bytes'
import { ALL_SEED_BYTES } from '../lib/bytesSeed'
import { journalId, type SyncRow } from '../lib/sync'
import { ensureRepo, explainGitError, repoNameFrom } from '../lib/gitapi'
import { syncVault } from '../lib/vaultSync'
import { seedDatabase } from '../data/seed'
import { todayEpochDay, agoMs } from '../lib/dates'
import { domainOf } from '../lib/format'
import { scrapeLink, type Scraped } from '../lib/scrape'
import { applyGrade, dueNotes } from '../lib/srs'
import { changeChars, shouldSnapshot, draftsToPrune, MIN_GAP_MS } from '../lib/history'
import {
  allHistory,
  calibration,
  initMemory,
  memoryOf,
  replayMemory,
  reviewMemory,
  scheduleInterval,
} from '../lib/adaptive'
import { blockId } from '../lib/types'
import {
  deriveKey,
  makeVerifier,
  checkVerifier,
  encryptJSON,
  decryptJSON,
  randomSalt,
  DEFAULT_ITERATIONS,
  CURRENT_ITERATIONS,
  type Cipher,
} from '../lib/crypto'
import { useUI } from './ui'

interface JournalCrypto {
  salt: string
  verifier: Cipher
  /** PBKDF2 iterations used for this vault (absent = legacy DEFAULT_ITERATIONS). */
  iterations?: number
}
import type {
  Block,
  Folder,
  Goal,
  Grade,
  JournalEntry,
  Note,
  Ranged,
  Ritual,
  SrsState,
  Todo,
  Watch,
  WatchKind,
  WeekItem,
} from '../lib/types'

export interface Session {
  queue: string[]
  idx: number
  log: Grade[]
}

/*
 * Data store — the in-memory working set, hydrated once from Dexie and kept in
 * the prototype's exact shapes (note dates and srs `due`/`hist.d` as day
 * offsets from today). Mutations write through to IndexedDB. Grading + the
 * review session are added in step 4 once the SRS engine (step 3) exists.
 *
 * `extra` (appended editor blocks) and `langO` (code-language overrides) are
 * in-memory only, matching the prototype — real note-body persistence is a
 * flagged stub for now.
 */

interface DataState {
  hydrated: boolean
  folders: Folder[]
  notes: Note[]
  srs: Record<string, SrsState>
  todos: Todo[]
  goals: Goal[]
  week: WeekItem[]
  rituals: Ritual[]
  ranged: Ranged[]
  watch: Watch[]
  journal: JournalEntry[]
  scratchpad: string
  /** Set once a passphrase exists; null = journal is plaintext. */
  journalCrypto: JournalCrypto | null
  /** In-memory AES key while unlocked; null = locked (or no passphrase). */
  journalKey: CryptoKey | null
  tagsPool: string[]
  doneToday: number
  /** Review counts keyed by absolute epoch-day (from the ledger). */
  ledgerByDay: Record<number, number>
  session: Session | null
  /** Non-null if the last hydrate attempt failed (App shows a retry screen). */
  hydrateError: string | null
  /** Deleted notes, most-recent first (the recycle bin). */
  trash: TrashRow[]
  /** Version history for the currently-open note (loaded on demand). */
  revisions: RevisionRow[]

  hydrate: () => Promise<void>
  startSession: (ids?: string[]) => void
  grade: (g: Grade) => void
  endSession: () => void
  toggleTodo: (id: string) => void
  toggleGoal: (id: string) => void
  toggleWeek: (id: string) => void
  toggleRitual: (id: string) => void
  addToReview: (noteId: string) => void
  watchAdd: (url: string) => void
  watchPatch: (id: string, patch: Partial<Watch>) => void
  watchToggle: (id: string) => void
  watchDelete: (id: string) => void
  /** Normalize + register a tag, attach it to a watch item. Returns the tag. */
  watchAddTag: (id: string, rawTag: string) => string
  watchRemoveTag: (id: string, tag: string) => void
  /** Create + open a note (optionally pre-titled, e.g. ⌘K or a [[wikilink]]). */
  newNote: (title?: string) => void
  updateNote: (id: string, patch: Partial<Note>) => void
  appendBlock: (noteId: string, block: Block) => void
  deleteNote: (id: string) => void
  /** Load the open note's draft history into `revisions`. */
  loadRevisions: (noteId: string) => Promise<void>
  /** Restore a past draft (snapshots the current state first, so it's undoable). */
  restoreRevision: (rev: RevisionRow) => void
  /** Recover a deleted note from the recycle bin. */
  restoreNote: (id: string) => Promise<void>
  /** Permanently delete one trashed note. */
  purgeNote: (id: string) => Promise<void>
  /** Permanently delete everything in the recycle bin. */
  emptyTrash: () => Promise<void>
  moveNote: (id: string, folderId: string) => void
  noteAddTag: (id: string, rawTag: string) => string
  noteRemoveTag: (id: string, tag: string) => void
  newFolder: (parentId: string | null) => void
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  addTodo: (raw: string) => void
  deleteTodo: (id: string) => void
  addGoal: (text: string) => void
  deleteGoal: (id: string) => void
  addRitual: (text: string) => void
  deleteRitual: (id: string) => void
  addWeekItem: (day: number, text: string) => void
  deleteWeekItem: (id: string) => void
  addRanged: (text: string, from: number, to: number) => void
  deleteRanged: (id: string) => void
  saveJournalEntry: (text: string) => void
  saveScratchpad: (text: string) => void
  setJournalPassphrase: (pass: string) => Promise<void>
  unlockJournalCrypto: (pass: string) => Promise<boolean>
  lockJournalCrypto: () => void
  exportData: () => Promise<string>
  importData: (json: string) => Promise<boolean>
  resetData: () => Promise<void>
  /** Which private repo this device syncs into. Empty means: don't sync anywhere. */
  githubRepo: string
  /** The saved GitHub token, mirrored from IndexedDB so the UI shows it's still
   *  connected after a reload (it lives in db.meta; sync reads it from there). */
  githubToken: string
  /** Sync automatically in the background after edits settle. */
  autoSyncOn: boolean
  setGithubToken: (token: string) => Promise<void>
  setGithubRepo: (repo: string) => Promise<void>
  setAutoSync: (on: boolean) => Promise<void>
  syncNow: () => Promise<SyncOutcome>
  /** Bytes learning cards, authored here on desktop and synced to the phone. */
  bytes: ByteCard[]
  addByte: (card: Omit<ByteCard, 'id' | 'updatedAt'>) => Promise<void>
  addByteBatch: (cards: ByteCard[]) => Promise<number>
  deleteByte: (id: string) => Promise<void>
  loadStarterPack: () => Promise<number>
}

export interface SyncOutcome {
  ok: boolean
  message: string
  /** Encrypted journal entries are synced; plaintext ones never leave the device. */
  plaintextHeld?: number
  /** The repo's journal uses a different passphrase — auto-sync must stop retrying. */
  conflict?: boolean
}

const TABLE_NAMES = [
  'folders',
  'notes',
  'srs',
  'ledger',
  'todos',
  'goals',
  'week',
  'rituals',
  'ranged',
  'watch',
  'journal',
  'meta',
  'revisions',
  'trash',
]

/** Shared tag normalizer: lowercase, spaces → hyphens. */
const normalizeTag = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, '-')

/** Pull the first #tag out of free text (used when adding todos). */
const extractTag = (raw: string): { text: string; tag?: string } => {
  const m = raw.match(/#([a-z0-9][a-z0-9-]*)/i)
  if (!m) return { text: raw.trim() }
  const tag = normalizeTag(m[1])
  const text = raw.replace(m[0], '').replace(/\s+/g, ' ').trim() || raw.trim()
  return { text, tag }
}

const WATCH_HUES = [358, 215, 165, 262, 32, 205]

/*
 * Globally unique entity id.
 *
 * The old scheme was `Date.now() * 1000 + seq`, with `seq` restarting at 0 every
 * session. Two devices creating their first note in the same millisecond minted
 * the *same id* — and once they sync, one note silently overwrites the other.
 * Thirty-two bits of entropy per id makes that impossible in practice.
 *
 * Creation order now comes from the `createdAt` column, not from parsing the id.
 */
let idSeq = 0
function uid(prefix: string): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}${Date.now().toString(36)}-${(idSeq++ % 1296).toString(36)}-${salt}`
}

/** A deletion the other devices must honour. Outlives the 30-day recycle bin. */
const tombstone = (id: string) => void db.tombstones.put({ id, deletedAt: Date.now() })

// Recycle-bin notes auto-purge this many days after deletion (also surfaced as
// a countdown on each trash card). Shared so the UI and the purge agree.
export const TRASH_TTL_DAYS = 30
const TRASH_TTL_MS = TRASH_TTL_DAYS * 24 * 3_600_000

// ── Note version history (drafts) ─────────────────────────────────────
// Save the about-to-be-overwritten state as a draft, but smartly: only when it
// has meaningfully changed and is spaced out (policy in lib/history), then thin
// old drafts on a logarithmic curve. `snapAt` bounds DB reads to ~one per
// MIN_GAP per note, so the common autosave case does zero I/O.
const snapAt = new Map<string, number>()

function snapshotNote(note: Note, force = false): void {
  const now = Date.now()
  if (!force && now - (snapAt.get(note.id) ?? 0) < MIN_GAP_MS) return
  snapAt.set(note.id, now)
  void (async () => {
    const revs = await db.revisions.where('noteId').equals(note.id).sortBy('savedAt')
    const newest = revs.length ? revs[revs.length - 1] : null
    if (newest && changeChars(newest.blocks, note.blocks) === 0) return // never store a duplicate
    if (!force && !shouldSnapshot(note.blocks, newest, now)) return
    await db.revisions.add({ noteId: note.id, savedAt: now, title: note.title, blocks: note.blocks })
    const after = await db.revisions.where('noteId').equals(note.id).sortBy('savedAt')
    const del = draftsToPrune(after.map((r) => ({ id: r.id!, savedAt: r.savedAt })), now)
    if (del.length) await db.revisions.bulkDelete(del)
  })().catch(() => {})
}

// Single-flight guard so React StrictMode's double mount can't seed twice.
let hydrating: Promise<void> | null = null

async function hydrateImpl(set: (partial: Partial<DataState>) => void): Promise<void> {
  await db.open()
  // Ask the browser to keep our IndexedDB from being evicted under storage
  // pressure — best-effort, granted from engagement / installed-PWA heuristics,
  // silently ignored where unsupported. Notes live here, so durability matters.
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* storage manager unavailable — ignore */
  }
  // Sample data seeds ONLY in the dev sandbox (npm run dev). The real app
  // (production build) starts as a clean, empty vault — your own notebook.
  if (import.meta.env.DEV && (await db.folders.count()) === 0) await seedDatabase()

  // Idempotent, and after the seed on purpose: a brand-new vault needs the sync
  // columns just as much as an upgraded one, and Dexie runs no upgrade hook for it.
  await repairForSync()

  const today = todayEpochDay()
  const [
    folderRows,
    noteRows,
    srsRows,
    ledgerRows,
    todos,
    goals,
    week,
    rituals,
    ranged,
    watchRows,
    journalRows,
    metaRows,
    byteRows,
  ] = await Promise.all([
    db.folders.toArray(),
    db.notes.toArray(),
    db.srs.toArray(),
    db.ledger.toArray(),
    db.todos.toArray(),
    db.goals.toArray(),
    db.week.toArray(),
    db.rituals.toArray(),
    db.ranged.toArray(),
    db.watch.toArray(),
    db.journal.toArray(),
    db.meta.toArray(),
    db.bytes.toArray(),
  ])

  // Creation order comes from the timestamp column now. The old code parsed the
  // digits out of the id, which the new random ids no longer encode.
  const folders: Folder[] = folderRows
    .slice()
    .sort((a, b) => folderCreatedAt(a) - folderCreatedAt(b))
    .map((r) => ({ id: r.id, name: r.name, parentId: r.parentId }))

  const notes: Note[] = noteRows
    .slice()
    .sort((a, b) => noteCreatedAt(a) - noteCreatedAt(b))
    .map((r) => ({
      id: r.id,
      title: r.title,
      folderId: r.folderId,
      tags: r.tags,
      created: r.createdDay - today,
      updated: r.updatedDay - today,
      blocks: r.blocks.map((b, i) => (b.id ? b : { ...b, id: `${r.id}-b${i}` })),
    }))

  // Reconstruct per-note history from the ledger.
  const ledgerByNote = new Map<string, typeof ledgerRows>()
  for (const l of ledgerRows) {
    const arr = ledgerByNote.get(l.noteId)
    if (arr) arr.push(l)
    else ledgerByNote.set(l.noteId, [l])
  }
  const srs: Record<string, SrsState> = {}
  for (const s of srsRows) {
    const hist = (ledgerByNote.get(s.noteId) ?? [])
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((l) => ({ d: l.day - today, g: l.grade, ivl: l.ivl }))
    // Replay the full review history through the FSRS memory model so the
    // adaptive scheduler "understands" each note from day one (also makes
    // stability/difficulty survive vault imports, which carry only the ledger).
    const mem = replayMemory(hist)
    srs[s.noteId] = {
      ease: s.ease,
      ivl: s.ivl,
      due: s.dueDay - today,
      hist,
      ...(mem ? { stab: mem.stab, diff: mem.diff } : {}),
    }
  }

  // "added" is derived live from the timestamp (was a frozen "just now"
  // string). Legacy/demo rows with synthetic addedAt keep their stored label.
  // A watch item that arrived from the phone may lack the fields only the
  // desktop's cards render. `tags.map(...)` on undefined is a crash, not a gap.
  const watch: Watch[] = watchRows
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((r) => ({
      ...r,
      tags: r.tags ?? [],
      note: r.note ?? '',
      hue: r.hue ?? WATCH_HUES[0],
      added: r.addedAt > 1.4e12 ? agoMs(r.addedAt) : r.added ?? 'just now',
    }))

  // Ritual daily rollover — rituals are real: a day boundary checks yesterday's
  // completion (streak +1) or breaks the streak, then unticks for the new day.
  const lastRitualDay = (metaRows.find((m) => m.key === 'ritualDay')?.value as number | undefined) ?? null
  let liveRituals = rituals
  if (lastRitualDay !== null && lastRitualDay < today) {
    liveRituals = rituals.map((r) => ({
      ...r,
      streak: today - lastRitualDay === 1 && r.done ? r.streak + 1 : 0,
      done: false,
    }))
    await db.rituals.bulkPut(liveRituals)
  }
  if (lastRitualDay !== today) await db.meta.put({ key: 'ritualDay', value: today })
  const journalCrypto =
    (metaRows.find((m) => m.key === 'journalCrypto')?.value as JournalCrypto | undefined) ?? null
  // Encrypted journals stay locked (empty) until the passphrase is entered.
  const journal: JournalEntry[] = journalCrypto
    ? []
    : journalRows
        .filter((r) => !r.enc && r.text !== undefined)
        .map((r) => ({
          id: r.id,
          off: r.day !== undefined ? r.day - today : r.off ?? 0,
          words: r.words ?? 0,
          text: r.text ?? '',
        }))
        .sort((a, b) => b.off - a.off)
  const tagsPool =
    (metaRows.find((m) => m.key === 'tagsPool')?.value as string[] | undefined) ?? []
  const githubRepo = (metaRows.find((m) => m.key === 'githubRepo')?.value as string | undefined) ?? ''
  const githubToken = (metaRows.find((m) => m.key === 'githubToken')?.value as string | undefined) ?? ''
  const autoSyncOn = (metaRows.find((m) => m.key === 'autoSync')?.value as string | undefined) !== '0'
  const scratchpad = journalCrypto
    ? ''
    : (metaRows.find((m) => m.key === 'scratchpad')?.value as string | undefined) ?? ''

  const ledgerByDay: Record<number, number> = {}
  for (const l of ledgerRows) ledgerByDay[l.day] = (ledgerByDay[l.day] ?? 0) + 1
  const doneToday = ledgerByDay[today] ?? 0

  // Auto-purge recycle-bin notes older than TRASH_TTL_DAYS — along with their
  // ledger history and drafts — so the bin (and IndexedDB) can't grow forever.
  const nowMs = Date.now()
  const trashRows = await db.trash.toArray()
  for (const t of trashRows) {
    if (nowMs - t.deletedAt < TRASH_TTL_MS) continue
    await db.trash.delete(t.id)
    await db.ledger.where('noteId').equals(t.id).delete()
    await db.revisions.where('noteId').equals(t.id).delete()
  }
  const trash = trashRows
    .filter((t) => nowMs - t.deletedAt < TRASH_TTL_MS)
    .sort((a, b) => b.deletedAt - a.deletedAt)

  set({
    hydrated: true,
    autoSyncOn,
    folders,
    notes,
    srs,
    todos,
    goals,
    week,
    rituals: liveRituals,
    ranged,
    watch,
    journal,
    tagsPool,
    githubRepo,
    githubToken,
    scratchpad,
    journalCrypto,
    ledgerByDay,
    doneToday,
    trash,
    bytes: (byteRows as unknown as SyncRow[]).map(toCard).filter((c): c is ByteCard => !!c),
  })
}

export const useData = create<DataState>()((set, get) => ({
  hydrated: false,
  folders: [],
  notes: [],
  srs: {},
  todos: [],
  goals: [],
  week: [],
  rituals: [],
  ranged: [],
  watch: [],
  journal: [],
  bytes: [],
  scratchpad: '',
  githubRepo: '',
  githubToken: '',
  autoSyncOn: true,
  journalCrypto: null,
  journalKey: null,
  tagsPool: [],
  doneToday: 0,
  ledgerByDay: {},
  session: null,
  hydrateError: null,
  trash: [],
  revisions: [],

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()
    if (!hydrating) {
      set({ hydrateError: null })
      hydrating = hydrateImpl(set).catch((err) => {
        // Reset the single-flight guard so a retry can re-run, and surface the
        // error instead of leaving the app stuck on the loading screen forever.
        hydrating = null
        set({ hydrateError: err instanceof Error ? err.message : 'Failed to open the vault' })
      })
    }
    return hydrating
  },

  startSession: (ids) => {
    const queue = ids ?? dueNotes(get().notes, get().srs).map((n) => n.id)
    if (!queue.length) {
      useUI.getState().showToast('Nothing due — your ink is dark')
      return
    }
    set({ session: { queue, idx: 0, log: [] } })
    useUI.getState().setScreen('session')
  },
  grade: (g) => {
    const s = get().session
    if (!s || s.idx >= s.queue.length) return
    const id = s.queue[s.idx]
    const cur = get().srs[id]
    if (!cur) return
    const { state: next, requeue, toast } = applyGrade(cur, g)

    // Adaptive layer (lib/adaptive.ts): fold this review into the FSRS memory
    // model, then let it — calibrated against the user's own recall history —
    // pick the actual next review date. The classic engine above still drives
    // ease stats and the Again requeue.
    const last = cur.hist[cur.hist.length - 1]
    const elapsed = last ? Math.max(0, -last.d) : 0
    const mem0 = memoryOf(cur)
    const mem = mem0 ? reviewMemory(mem0, g, elapsed) : initMemory(g)
    let final: SrsState = { ...next, stab: mem.stab, diff: mem.diff }
    let msg = toast
    if (g !== 1) {
      const { factor } = calibration(allHistory(get().srs))
      const ivl = scheduleInterval(mem.stab, factor)
      const hist = final.hist.slice()
      hist[hist.length - 1] = { ...hist[hist.length - 1], ivl }
      final = { ...final, ivl, due: ivl, hist }
      msg = 'Re-inked · next review in ' + ivl + 'd'
    }

    const today = todayEpochDay()
    void db.srs.put({ noteId: id, ease: final.ease, ivl: final.ivl, dueDay: today + final.due })
    void db.ledger.add({ noteId: id, day: today, grade: g, ivl: final.ivl })

    set({
      srs: { ...get().srs, [id]: final },
      session: {
        queue: requeue ? [...s.queue, id] : s.queue,
        idx: s.idx + 1,
        log: [...s.log, g],
      },
      doneToday: get().doneToday + 1,
      ledgerByDay: { ...get().ledgerByDay, [today]: (get().ledgerByDay[today] ?? 0) + 1 },
    })
    useUI.getState().showToast(msg)
  },
  endSession: () => {
    set({ session: null })
    useUI.getState().setScreen('queue')
  },

  // Every list write stamps `updatedAt`: without it, two devices that both ticked
  // a todo today would have no way to tell which tick happened last.
  toggleTodo: (id) => {
    set({ todos: get().todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().todos.find((t) => t.id === id)?.done
    if (done !== undefined) void db.todos.update(id, { done, updatedAt: Date.now() })
  },
  toggleGoal: (id) => {
    set({ goals: get().goals.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().goals.find((t) => t.id === id)?.done
    if (done !== undefined) void db.goals.update(id, { done, updatedAt: Date.now() })
  },
  toggleWeek: (id) => {
    set({ week: get().week.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().week.find((t) => t.id === id)?.done
    if (done !== undefined) void db.week.update(id, { done, updatedAt: Date.now() })
  },
  toggleRitual: (id) => {
    set({ rituals: get().rituals.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().rituals.find((t) => t.id === id)?.done
    if (done !== undefined) void db.rituals.update(id, { done, updatedAt: Date.now() })
  },

  addToReview: (noteId) => {
    const today = todayEpochDay()
    const state: SrsState = { ease: 2.5, ivl: 1, due: 1, hist: [] }
    set({ srs: { ...get().srs, [noteId]: state } })
    void db.srs.put({ noteId, ease: 2.5, ivl: 1, dueDay: today + 1 })
    useUI.getState().showToast('Added — first review tomorrow')
  },

  watchAdd: (url) => {
    const trimmed = url.trim()
    const toast = useUI.getState().showToast
    if (!trimmed) {
      toast('Paste a link first')
      return
    }
    const domain = domainOf(trimmed)
    const kind: WatchKind = /youtu|vimeo/.test(domain)
      ? 'video'
      : /arxiv|acm|ieee|semantic/.test(domain)
        ? 'paper'
        : 'article'
    const id = uid('v')
    const item: Watch = {
      id,
      kind,
      title: '',
      source: domain,
      mins: 0,
      url: trimmed,
      added: 'just now',
      done: false,
      hue: WATCH_HUES[get().watch.length % 6],
      tags: [],
      note: '',
      loading: true,
    }
    set({ watch: [item, ...get().watch] })
    void db.watch.add({ ...item, addedAt: Date.now(), updatedAt: Date.now() })
    // Real client-side scrape (noembed / YouTube thumbnail / OG tags via a CORS
    // proxy). Durations still need a server API, so they stay unknown.
    void (async () => {
      const scraped = await scrapeLink(trimmed).catch((): Scraped => ({}))
      const fallback = (kind === 'video' ? 'Video' : kind === 'paper' ? 'Paper' : 'Article') + ' · ' + domain
      get().watchPatch(id, {
        loading: false,
        title: scraped.title || fallback,
        thumb: scraped.thumb,
        source: scraped.source || domain,
        mins: scraped.mins ?? 0,
      })
      toast(scraped.title ? 'Saved · ' + domain : 'Saved · ' + domain + ' (no preview)')
    })()
  },

  // Every watch change funnels through here — toggle, scrape result, tags — so
  // this is the single place the edit stamp has to be set.
  watchPatch: (id, patch) => {
    set({ watch: get().watch.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
    void db.watch.update(id, { ...patch, updatedAt: Date.now() })
  },
  watchToggle: (id) => {
    const cur = get().watch.find((w) => w.id === id)
    if (cur) get().watchPatch(id, { done: !cur.done })
  },
  watchDelete: (id) => {
    set({ watch: get().watch.filter((w) => w.id !== id) })
    void db.watch.delete(id)
    tombstone(id)
  },

  watchAddTag: (id, rawTag) => {
    const t = rawTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t) return ''
    if (!get().tagsPool.includes(t)) {
      const pool = [...get().tagsPool, t]
      set({ tagsPool: pool })
      void db.meta.put({ key: 'tagsPool', value: pool })
    }
    const w = get().watch.find((x) => x.id === id)
    if (w && !w.tags.includes(t)) get().watchPatch(id, { tags: [...w.tags, t] })
    return t
  },
  watchRemoveTag: (id, tag) => {
    const w = get().watch.find((x) => x.id === id)
    if (w) get().watchPatch(id, { tags: w.tags.filter((x) => x !== tag) })
  },

  newNote: (title) => {
    const ui = useUI.getState()
    let folders = get().folders
    // A clean (empty) vault has no folders yet — give the first note a home.
    if (folders.length === 0) {
      const f = { id: uid('f'), name: 'Notes', parentId: null }
      const now = Date.now()
      set({ folders: [f] })
      void db.folders.add({ ...f, createdAt: now, updatedAt: now })
      folders = [f]
    }
    const sel = ui.selFolder
    const folderId = sel !== 'all' && folders.some((f) => f.id === sel) ? sel : folders[0]?.id ?? ''
    const id = uid('n')
    const note: Note = {
      id,
      title: title?.trim() || 'Untitled note',
      folderId,
      tags: [],
      created: 0,
      updated: 0,
      blocks: [{ id: blockId(), t: 'p', text: '' }],
    }
    set({ notes: [...get().notes, note] })
    const today = todayEpochDay()
    const now = Date.now()
    void db.notes.add({
      id,
      title: note.title,
      folderId,
      tags: [],
      createdDay: today,
      updatedDay: today,
      createdAt: now,
      updatedAt: now,
      blocks: note.blocks,
    })
    ui.openNote(id)
    ui.showToast('New note created')
  },
  updateNote: (id, patch) => {
    // Snapshot the pre-edit state as a draft (throttled) before overwriting.
    if (patch.blocks !== undefined || patch.title !== undefined) {
      const prev = get().notes.find((n) => n.id === id)
      if (prev) snapshotNote(prev)
    }
    const notes = get().notes.map((n) => (n.id === id ? { ...n, ...patch, updated: 0 } : n))
    set({ notes })
    const n = notes.find((x) => x.id === id)
    if (n) {
      void db.notes.update(id, {
        title: n.title,
        blocks: n.blocks,
        tags: n.tags,
        folderId: n.folderId,
        updatedDay: todayEpochDay(),
        updatedAt: Date.now(),
      })
    }
  },
  appendBlock: (noteId, block) => {
    const n = get().notes.find((x) => x.id === noteId)
    if (n) get().updateNote(noteId, { blocks: [...n.blocks, { ...block, id: block.id ?? blockId() }] })
  },
  deleteNote: (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    const today = todayEpochDay()
    const sr = get().srs[id]
    // Soft delete → the recycle bin. The ledger rows stay so review history
    // survives a restore; the SRS state is snapshotted (absolute) too.
    const row: TrashRow = {
      id,
      title: note.title,
      folderId: note.folderId,
      tags: note.tags,
      createdDay: today + note.created,
      updatedDay: today + note.updated,
      blocks: note.blocks,
      deletedAt: Date.now(),
      srs: sr ? { ease: sr.ease, ivl: sr.ivl, dueDay: today + sr.due } : undefined,
    }
    const srs = { ...get().srs }
    delete srs[id]
    // Capture the todos pointing at this note BEFORE clearing them in state —
    // otherwise the post-set db update reads the already-cleared refs and never
    // persists, so the stale ref would return on reload.
    const clearedTodos = get().todos.filter((t) => t.ref?.type === 'note' && t.ref.id === id)
    set({
      notes: get().notes.filter((n) => n.id !== id),
      srs,
      trash: [row, ...get().trash],
      todos: get().todos.map((t) => (t.ref?.type === 'note' && t.ref.id === id ? { ...t, ref: undefined } : t)),
    })
    void db.trash.put(row)
    void db.notes.delete(id)
    void db.srs.delete(id)
    tombstone(id)
    clearedTodos.forEach((t) => void db.todos.update(t.id, { ref: undefined, updatedAt: Date.now() }))
    const ui = useUI.getState()
    if (ui.noteId === id) ui.setScreen('notes')
    ui.showToast('Moved to Recently deleted')
  },
  loadRevisions: async (noteId) => {
    const revs = await db.revisions.where('noteId').equals(noteId).sortBy('savedAt')
    set({ revisions: revs.reverse() })
  },
  restoreRevision: (rev) => {
    // Force a snapshot of the current state first so restoring is itself undoable.
    const cur = get().notes.find((n) => n.id === rev.noteId)
    if (cur) snapshotNote(cur, true)
    get().updateNote(rev.noteId, { title: rev.title, blocks: rev.blocks.map((b) => ({ ...b })) })
    useUI.getState().bumpEditor() // remount the editor so it shows the restored text
    void get().loadRevisions(rev.noteId)
    useUI.getState().showToast('Restored this draft')
  },
  restoreNote: async (id) => {
    const t = get().trash.find((x) => x.id === id)
    if (!t) return
    const today = todayEpochDay()
    const folderId = get().folders.some((f) => f.id === t.folderId) ? t.folderId : get().folders[0]?.id ?? ''
    const note: Note = {
      id: t.id,
      title: t.title,
      folderId,
      tags: t.tags,
      created: t.createdDay - today,
      updated: t.updatedDay - today,
      blocks: t.blocks,
    }
    set({ notes: [...get().notes, note], trash: get().trash.filter((x) => x.id !== id) })
    // updatedAt = now, deliberately: it must outrank the tombstone, or the next
    // sync would read the restore as a stale note and delete it again.
    await db.notes.add({
      id: note.id,
      title: t.title,
      folderId,
      tags: t.tags,
      createdDay: t.createdDay,
      updatedDay: t.updatedDay,
      createdAt: noteCreatedAt(t),
      updatedAt: Date.now(),
      blocks: t.blocks,
    })
    await db.trash.delete(id)
    if (t.srs) {
      const ledger = await db.ledger.where('noteId').equals(id).toArray()
      const hist = ledger.sort((a, b) => a.day - b.day).map((l) => ({ d: l.day - today, g: l.grade, ivl: l.ivl }))
      const state: SrsState = { ease: t.srs.ease, ivl: t.srs.ivl, due: t.srs.dueDay - today, hist }
      set({ srs: { ...get().srs, [id]: state } })
      await db.srs.put({ noteId: id, ease: t.srs.ease, ivl: t.srs.ivl, dueDay: t.srs.dueDay })
    }
    useUI.getState().showToast('Note restored')
  },
  purgeNote: async (id) => {
    set({ trash: get().trash.filter((x) => x.id !== id) })
    await db.trash.delete(id)
    await db.ledger.where('noteId').equals(id).delete()
    await db.revisions.where('noteId').equals(id).delete()
    useUI.getState().showToast('Deleted forever')
  },
  emptyTrash: async () => {
    const ids = get().trash.map((x) => x.id)
    set({ trash: [] })
    await db.trash.clear()
    for (const id of ids) {
      await db.ledger.where('noteId').equals(id).delete()
      await db.revisions.where('noteId').equals(id).delete()
    }
    useUI.getState().showToast('Recycle bin emptied')
  },
  moveNote: (id, folderId) => {
    get().updateNote(id, { folderId })
  },
  noteAddTag: (id, rawTag) => {
    const t = normalizeTag(rawTag)
    if (!t) return ''
    if (!get().tagsPool.includes(t)) {
      const pool = [...get().tagsPool, t]
      set({ tagsPool: pool })
      void db.meta.put({ key: 'tagsPool', value: pool })
    }
    const n = get().notes.find((x) => x.id === id)
    if (n && !n.tags.includes(t)) get().updateNote(id, { tags: [...n.tags, t] })
    return t
  },
  noteRemoveTag: (id, tag) => {
    const n = get().notes.find((x) => x.id === id)
    if (n) get().updateNote(id, { tags: n.tags.filter((x) => x !== tag) })
  },
  newFolder: (parentId) => {
    // Only a real, existing folder may be a parent. The library passes the
    // selected folder as parent, but `selFolder` also holds the view sentinels
    // 'all'/'trash' — without this guard, "New folder" while the recycle bin is
    // open would write parentId:'trash', an orphan invisible to the tree.
    const parent = parentId && get().folders.some((f) => f.id === parentId) ? parentId : null
    const id = uid('f')
    set({ folders: [...get().folders, { id, name: 'New folder', parentId: parent }] })
    const now = Date.now()
    void db.folders.add({ id, name: 'New folder', parentId: parent, createdAt: now, updatedAt: now })
    const ui = useUI.getState()
    if (parent) ui.setExpanded({ ...ui.expanded, [parent]: true })
    ui.setSelFolder(id)
    ui.startRenameFolder(id)
  },
  renameFolder: (id, name) => {
    const nm = name.trim() || 'Untitled folder'
    set({ folders: get().folders.map((f) => (f.id === id ? { ...f, name: nm } : f)) })
    void db.folders.update(id, { name: nm, updatedAt: Date.now() })
  },
  deleteFolder: (id) => {
    const folders = get().folders
    const target = folders.find((f) => f.id === id)
    if (!target) return
    // The whole subtree: this folder + every descendant folder.
    const subtree = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of folders) {
        if (f.parentId && subtree.has(f.parentId) && !subtree.has(f.id)) {
          subtree.add(f.id)
          grew = true
        }
      }
    }
    // Safe delete: every note living anywhere in the subtree goes to the recycle
    // bin (recoverable — its ledger + SRS are kept, like a single delete), then
    // the folders themselves are removed. No note is ever lost to a folder click.
    const today = todayEpochDay()
    const now = Date.now()
    const srsMap = get().srs
    const doomed = get().notes.filter((n) => subtree.has(n.folderId))
    const doomedIds = new Set(doomed.map((n) => n.id))
    const rows: TrashRow[] = doomed.map((note) => {
      const sr = srsMap[note.id]
      return {
        id: note.id,
        title: note.title,
        folderId: note.folderId,
        tags: note.tags,
        createdDay: today + note.created,
        updatedDay: today + note.updated,
        blocks: note.blocks,
        deletedAt: now,
        srs: sr ? { ease: sr.ease, ivl: sr.ivl, dueDay: today + sr.due } : undefined,
      }
    })
    const srs = { ...srsMap }
    for (const nid of doomedIds) delete srs[nid]
    const clearedTodos = get().todos.filter((t) => t.ref?.type === 'note' && doomedIds.has(t.ref.id))
    set({
      folders: get().folders.filter((f) => !subtree.has(f.id)),
      notes: get().notes.filter((n) => !doomedIds.has(n.id)),
      srs,
      trash: [...rows, ...get().trash],
      todos: get().todos.map((t) =>
        t.ref?.type === 'note' && doomedIds.has(t.ref.id) ? { ...t, ref: undefined } : t,
      ),
    })
    void db.tombstones.bulkPut([...doomedIds, ...subtree].map((id) => ({ id, deletedAt: now })))
    for (const row of rows) {
      void db.trash.put(row)
      void db.notes.delete(row.id)
      void db.srs.delete(row.id)
    }
    clearedTodos.forEach((t) => void db.todos.update(t.id, { ref: undefined, updatedAt: Date.now() }))
    for (const fid of subtree) void db.folders.delete(fid)
    const ui = useUI.getState()
    if (subtree.has(ui.selFolder)) ui.setSelFolder('all')
    if (ui.noteId && doomedIds.has(ui.noteId)) ui.setScreen('notes')
    ui.showToast(
      doomed.length
        ? `Folder deleted · ${doomed.length} ${doomed.length === 1 ? 'note' : 'notes'} → bin`
        : 'Folder deleted',
    )
  },

  addTodo: (raw) => {
    const { text, tag } = extractTag(raw)
    if (!text) return
    if (tag && !get().tagsPool.includes(tag)) {
      const pool = [...get().tagsPool, tag]
      set({ tagsPool: pool })
      void db.meta.put({ key: 'tagsPool', value: pool })
    }
    const todo: Todo = { id: uid('t'), text, done: false, ...(tag ? { tag } : {}) }
    set({ todos: [...get().todos, todo] })
    void db.todos.add({ ...todo, updatedAt: Date.now() })
  },
  deleteTodo: (id) => {
    set({ todos: get().todos.filter((t) => t.id !== id) })
    void db.todos.delete(id)
    tombstone(id) // without this the other device syncs it straight back
  },
  addGoal: (text) => {
    const t = text.trim()
    if (!t) return
    const g: Goal = { id: uid('g'), text: t, done: false }
    set({ goals: [...get().goals, g] })
    void db.goals.add({ ...g, updatedAt: Date.now() })
  },
  deleteGoal: (id) => {
    set({ goals: get().goals.filter((g) => g.id !== id) })
    void db.goals.delete(id)
    tombstone(id)
  },
  addRitual: (text) => {
    const t = text.trim()
    if (!t) return
    const r: Ritual = { id: uid('r'), text: t, streak: 0, done: false }
    set({ rituals: [...get().rituals, r] })
    void db.rituals.add({ ...r, updatedAt: Date.now() })
  },
  deleteRitual: (id) => {
    set({ rituals: get().rituals.filter((r) => r.id !== id) })
    void db.rituals.delete(id)
    tombstone(id)
  },
  addWeekItem: (day, text) => {
    const t = text.trim()
    if (!t) return
    const w: WeekItem = { id: uid('w'), day, text: t, done: false }
    set({ week: [...get().week, w] })
    void db.week.add({ ...w, updatedAt: Date.now() })
  },
  deleteWeekItem: (id) => {
    set({ week: get().week.filter((w) => w.id !== id) })
    void db.week.delete(id)
    tombstone(id)
  },
  addRanged: (text, from, to) => {
    const t = text.trim()
    if (!t) return
    const lo = Math.max(1, Math.min(31, Math.min(from, to)))
    const hi = Math.max(1, Math.min(31, Math.max(from, to)))
    const hue = [215, 28, 262, 165, 320][get().ranged.length % 5]
    const r: Ranged = { id: uid('rg'), text: t, from: lo, to: hi, hue }
    set({ ranged: [...get().ranged, r] })
    void db.ranged.add({ ...r, updatedAt: Date.now() })
  },
  deleteRanged: (id) => {
    set({ ranged: get().ranged.filter((r) => r.id !== id) })
    void db.ranged.delete(id)
    tombstone(id)
  },

  saveJournalEntry: async (text) => {
    const clean = text.trim()
    const toast = useUI.getState().showToast
    const key = get().journalKey
    // Never persist plaintext into an encrypted journal that's currently locked
    // (the data-layer guard, not just the UI's pointer-events blur).
    if (get().journalCrypto && !key) {
      toast('Unlock the journal to save')
      return
    }
    const existing = get().journal.find((e) => e.off === 0)
    if (!clean && !existing) {
      toast('Write something first')
      return
    }
    const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0
    const today = todayEpochDay()
    // `sid` is the day, so the phone's copy of today's entry is the same entry.
    // A row saved without one would be re-uploaded under a fresh id every sync.
    const sid = journalId(today)
    const updatedAt = Date.now()
    if (existing) {
      set({ journal: get().journal.map((e) => (e.off === 0 ? { ...e, words, text: clean } : e)) })
      if (existing.id !== undefined) {
        if (key) await db.journal.put({ id: existing.id, sid, updatedAt, day: today, enc: await encryptJSON(key, { text: clean, words }) })
        else await db.journal.update(existing.id, { sid, updatedAt, day: today, words, text: clean })
      }
    } else {
      set({ journal: [{ off: 0, words, text: clean }, ...get().journal] })
      const row = key
        ? { sid, updatedAt, day: today, enc: await encryptJSON(key, { text: clean, words }) }
        : { sid, updatedAt, day: today, words, text: clean }
      const id = await db.journal.add(row)
      set({ journal: get().journal.map((e) => (e.off === 0 && e.id === undefined ? { ...e, id: id as number } : e)) })
    }
    toast("Saved · today's entry kept")
  },
  saveScratchpad: async (text) => {
    const key = get().journalKey
    // Same guard as saveJournalEntry: don't leak plaintext while locked.
    if (get().journalCrypto && !key) return
    set({ scratchpad: text })
    if (key) {
      await db.meta.put({ key: 'scratchpadEnc', value: await encryptJSON(key, text) })
      await db.meta.put({ key: 'scratchpadAt', value: Date.now() })
    } else await db.meta.put({ key: 'scratchpad', value: text })
  },
  setJournalPassphrase: async (pass) => {
    const toast = useUI.getState().showToast
    if (get().journalCrypto) {
      toast('Passphrase already set')
      return
    }
    if (pass.trim().length < 8) {
      toast('Use at least 8 characters')
      return
    }
    const salt = randomSalt()
    const iterations = CURRENT_ITERATIONS
    const key = await deriveKey(pass, salt, iterations)
    const verifier = await makeVerifier(key)
    const cryptoMeta: JournalCrypto = { salt, verifier, iterations }
    const today = todayEpochDay()
    const entries = get().journal
    const scratch = get().scratchpad
    // Migrate every plaintext entry to ciphertext, capturing the auto-assigned
    // id for entries not yet persisted so the in-memory list stays in sync
    // (otherwise a later save takes the "new entry" path and duplicates it).
    const migrated: JournalEntry[] = []
    await db.transaction('rw', db.journal, db.meta, async () => {
      // Re-put replaces the whole row, so `sid` has to be restated or every entry
      // loses its identity and re-uploads as a new one on the next sync.
      const existing = new Map((await db.journal.toArray()).map((r) => [r.id, r]))
      for (const e of entries) {
        const day = today + e.off
        const enc = await encryptJSON(key, { text: e.text, words: e.words })
        const sid = (e.id !== undefined ? existing.get(e.id)?.sid : undefined) ?? journalId(day)
        const updatedAt = Date.now()
        if (e.id !== undefined) {
          await db.journal.put({ id: e.id, sid, updatedAt, day, enc })
          migrated.push(e)
        } else {
          const newId = await db.journal.add({ sid, updatedAt, day, enc })
          migrated.push({ ...e, id: newId as number })
        }
      }
      await db.meta.put({ key: 'journalCrypto', value: cryptoMeta })
      await db.meta.put({ key: 'scratchpadEnc', value: await encryptJSON(key, scratch) })
      await db.meta.put({ key: 'scratchpadAt', value: Date.now() })
      await db.meta.delete('scratchpad')
    })
    set({ journalKey: key, journalCrypto: cryptoMeta, journal: migrated })
    toast('Journal encrypted — keep your passphrase safe')
  },
  unlockJournalCrypto: async (pass) => {
    const jc = get().journalCrypto
    if (!jc) return false
    const key = await deriveKey(pass, jc.salt, jc.iterations ?? DEFAULT_ITERATIONS)
    if (!(await checkVerifier(key, jc.verifier))) {
      useUI.getState().showToast('Wrong passphrase')
      return false
    }
    const today = todayEpochDay()
    const rows = await db.journal.toArray()
    const journal: JournalEntry[] = []
    let skipped = 0
    for (const r of rows) {
      if (r.enc) {
        try {
          const p = await decryptJSON<{ text: string; words: number }>(key, r.enc)
          journal.push({ id: r.id, off: (r.day ?? today) - today, words: p.words, text: p.text })
        } catch {
          skipped++ // the verifier passed, so a failure here is a corrupt/foreign row
        }
      }
    }
    journal.sort((a, b) => b.off - a.off)
    let scratchpad = ''
    const se = await db.meta.get('scratchpadEnc')
    if (se?.value) {
      try {
        scratchpad = await decryptJSON<string>(key, se.value as Cipher)
      } catch {
        /* ignore */
      }
    }
    set({ journalKey: key, journal, scratchpad })
    useUI.getState().showToast(
      skipped > 0
        ? `Journal unlocked — ${skipped} entr${skipped === 1 ? 'y' : 'ies'} couldn't be decrypted`
        : 'Journal unlocked',
    )
    return true
  },
  lockJournalCrypto: () => set({ journalKey: null, journal: [], scratchpad: '' }),

  exportData: async () => {
    const dump: Record<string, unknown> = {
      _app: 'noto',
      _schema: 1,
      _exportedAt: new Date().toISOString(),
    }
    for (const name of TABLE_NAMES) dump[name] = await db.table(name).toArray()
    return JSON.stringify(dump, null, 2)
  },
  importData: async (json) => {
    const toast = useUI.getState().showToast
    let data: Record<string, unknown[]>
    try {
      data = JSON.parse(json)
    } catch {
      toast('Import failed — not valid JSON')
      return false
    }
    if (!Array.isArray(data.notes) || !Array.isArray(data.folders)) {
      toast('Import failed — not a Noto vault')
      return false
    }
    // MERGE, not overwrite — fold the imported vault into this one so two vaults
    // combine instead of one wiping the other:
    //   · entity tables keyed by a stable string id → upsert (a shared id wins,
    //     everything else is added) — this is the "same file overwrites" case;
    //   · note-history tables (auto-increment ids) → append with FRESH ids,
    //     deduped by a natural key so their local ids can't clobber unrelated
    //     rows and re-importing the same file doesn't pile up duplicates;
    //   · tag vocabulary → union; the journal is passphrase-tied → atomic (below).
    const UPSERT = ['folders', 'notes', 'srs', 'todos', 'goals', 'week', 'rituals', 'ranged', 'watch', 'trash']
    const APPEND: Record<string, (r: { [k: string]: unknown }) => string> = {
      ledger: (r) => `${r.noteId}|${r.day}|${r.grade}|${r.ivl}`,
      revisions: (r) => `${r.noteId}|${r.savedAt}`,
    }
    const dropId = (r: { [k: string]: unknown }) => {
      const copy = { ...r }
      delete copy.id
      return copy
    }
    try {
      let journalFolded = false
      const importedAt = Date.now()
      await db.transaction('rw', db.tables, async () => {
        /*
         * 1) String-keyed entities → upsert by id (shared id overwrites, rest merge in).
         *
         * An export written before sync existed carries no `updatedAt`, and a
         * bulkPut writes the whole row: without this, importing would strip the
         * millisecond stamp off every row it lands on, and the next merge would
         * treat those rows as older than anything.
         */
        const STAMPED = new Set(['todos', 'goals', 'week', 'rituals', 'ranged', 'watch', 'notes', 'folders'])
        const DAY_MS = 86_400_000
        for (const name of UPSERT) {
          const rows = data[name]
          if (!Array.isArray(rows) || !rows.length) continue
          const stamped = STAMPED.has(name)
            ? rows.map((raw) => {
                const r = raw as { updatedAt?: number; createdAt?: number; updatedDay?: number; createdDay?: number }
                const fallbackUpdated = name === 'notes' && r.updatedDay ? r.updatedDay * DAY_MS : importedAt
                const fallbackCreated = name === 'notes' && r.createdDay ? r.createdDay * DAY_MS : importedAt
                return {
                  ...(raw as object),
                  updatedAt: r.updatedAt ?? fallbackUpdated,
                  ...(name === 'notes' || name === 'folders' ? { createdAt: r.createdAt ?? fallbackCreated } : {}),
                }
              })
            : rows
          await db.table(name).bulkPut(stamped)
        }
        // 2) Auto-increment history → append with fresh ids, skipping ones we already have.
        for (const name of Object.keys(APPEND)) {
          const rows = data[name] as { [k: string]: unknown }[] | undefined
          if (!Array.isArray(rows) || !rows.length) continue
          const keyOf = APPEND[name]
          const seen = new Set((await db.table(name).toArray()).map(keyOf))
          const fresh = rows.filter((r) => !seen.has(keyOf(r))).map(dropId)
          if (fresh.length) await db.table(name).bulkAdd(fresh)
        }
        // 3) Tag vocabulary → union.
        const meta = Array.isArray(data.meta) ? (data.meta as { key: string; value: unknown }[]) : []
        const importTags = (meta.find((m) => m.key === 'tagsPool')?.value as string[]) ?? []
        if (importTags.length) {
          const cur = ((await db.meta.get('tagsPool'))?.value as string[]) ?? []
          await db.meta.put({ key: 'tagsPool', value: [...new Set([...cur, ...importTags])] })
        }
        // 4) The journal is tied to ONE passphrase, so it can't be blended with a
        //    second key without stranding entries. Only fold in the imported journal
        //    when this vault has none yet; otherwise leave the local journal untouched.
        const localJournalEmpty = (await db.journal.count()) === 0 && !(await db.meta.get('journalCrypto'))
        if (localJournalEmpty) {
          const jrows = Array.isArray(data.journal) ? (data.journal as { [k: string]: unknown }[]) : []
          if (jrows.length) await db.table('journal').bulkAdd(jrows.map(dropId))
          for (const key of ['journalCrypto', 'scratchpad', 'scratchpadEnc']) {
            const m = meta.find((x) => x.key === key)
            if (m) await db.meta.put(m)
          }
          journalFolded = jrows.length > 0 || meta.some((m) => m.key === 'journalCrypto')
        }
      })
      toast(journalFolded ? 'Vault merged — notes + journal folded in' : 'Vault merged into yours')
      return true
    } catch {
      toast('Import failed while writing')
      return false
    }
  },
  resetData: async () => {
    await db.delete()
  },

  /*
   * The token is a device-local secret. A browser has no keychain, so it lives in
   * IndexedDB beside the notes: anyone with the disk and your OS account can read
   * it. That is the same reach they'd already have over the vault itself, but the
   * token also unlocks the remote copy — so scope it to one private repo and
   * revoke it if the machine is shared.
   */
  setGithubToken: async (token) => {
    const t = token.trim()
    if (t) await db.meta.put({ key: 'githubToken', value: t })
    else await db.meta.delete('githubToken')
    set({ githubToken: t })
  },

  /*
   * The repo is a real setting, not a hidden one. It was meta-only, and a user
   * whose vault lives in `noto-vault-live` had no way to say so — the app kept
   * looking for `noto-vault`, failed to find it, and tried to create it.
   */
  setGithubRepo: async (input) => {
    const name = repoNameFrom(input)
    if (name) await db.meta.put({ key: 'githubRepo', value: name })
    else await db.meta.delete('githubRepo')
    set({ githubRepo: name })
  },

  // ── Bytes deck (authoring lives on desktop) ──────────────────────────
  addByte: async (card) => {
    const full: ByteCard = { ...card, id: byteId(), updatedAt: Date.now() }
    await db.bytes.put(full)
    set({ bytes: [full, ...get().bytes] })
  },
  addByteBatch: async (cards) => {
    if (!cards.length) return 0
    await db.bytes.bulkPut(cards)
    set({ bytes: [...cards, ...get().bytes] })
    return cards.length
  },
  deleteByte: async (id) => {
    await db.bytes.delete(id)
    // A tombstone so the deletion propagates instead of resurrecting on the phone.
    await db.tombstones.put({ id, deletedAt: Date.now() })
    set({ bytes: get().bytes.filter((c) => c.id !== id) })
  },
  loadStarterPack: async () => {
    // Purely additive. It only inserts seed cards you don't already have and
    // never had (tombstoned = you deleted it, so don't resurrect it). Existing
    // cards keep their row, their seen/kept history, and the FSRS scheduling of
    // any notes you made from them — loading the pack can never reset progress.
    const have = new Set(get().bytes.map((c) => c.id))
    const tombstoned = new Set((await db.tombstones.toArray()).map((t) => t.id))
    const fresh: ByteCard[] = ALL_SEED_BYTES
      .filter((c) => !have.has(c.id) && !tombstoned.has(c.id))
      .map((c) => ({ ...c, updatedAt: Date.now() }))
    if (!fresh.length) return 0
    await db.bytes.bulkPut(fresh)
    set({ bytes: [...fresh, ...get().bytes] })
    return fresh.length
  },

  setAutoSync: async (on) => {
    await db.meta.put({ key: 'autoSync', value: on ? '1' : '0' })
    set({ autoSyncOn: on })
  },

  syncNow: () => {
    // One sync at a time — manual and auto share this lock, so a background sync
    // and a Sync-now click can never run two concurrent pushes.
    if (syncInFlight) return syncInFlight
    syncInFlight = (async (): Promise<SyncOutcome> => {
      // `suspend` for the whole sync: the reload below changes state, and without
      // this its own changes would re-arm the auto-sync timer into a loop.
      suspend = true
      try {
        const token = (await db.meta.get('githubToken'))?.value as string | undefined
        if (!token) return { ok: false, message: 'Connect a GitHub token first.' }

        // No guessing. A default repo name is a write to somewhere nobody asked for.
        const repoName = ((await db.meta.get('githubRepo'))?.value as string | undefined) ?? ''
        if (!repoName) return { ok: false, message: 'Name the repo to sync into first.' }

        try {
          const repo = await ensureRepo(token, repoName)
          const { vault, plaintextHeld } = await readVault()
          const result = await syncVault(token, repo, vault, await deviceName())
          lastSyncAt = Date.now()

          // Nothing was pushed and nothing may be written: the merged vault would
          // carry journal entries encrypted under a passphrase this device lacks.
          // Block auto-retries until a manual sync resolves it.
          if (result.cryptoConflict) {
            autoBlocked = true
            return {
              ok: false,
              conflict: true,
              message:
                'This vault was encrypted with a different journal passphrase. Nothing was synced — unlock with the vault’s passphrase, or use a separate repo.',
              plaintextHeld,
            }
          }
          autoBlocked = false

          await writeVault(result.vault)
          // Force a real reload, NOT get().hydrate() — that is single-flight-guarded
          // (`if (get().hydrated) return`) and no-ops after the first load, so a sync
          // that merged remote changes into Dexie would never reach the live store.
          await hydrateImpl(set)

          const { notes, ledger, lists } = result.stats
          return {
            ok: true,
            plaintextHeld,
            message: result.pushed
              ? `Synced · ${notes} notes, ${ledger} reviews, ${lists} items`
              : `Already up to date · ${notes} notes`,
          }
        } catch (e) {
          // GitHub's own wording ("Resource not accessible…") never says which
          // resource, nor what to grant. Translate what we can.
          const why = explainGitError(e) ?? (e as Error).message
          return { ok: false, message: `Sync failed — ${why}` }
        }
      } finally {
        suspend = false
        syncInFlight = null
      }
    })()
    return syncInFlight
  },
}))

/*
 * Auto-sync (desktop). Same contract as the phone: debounced so a burst of edits
 * becomes one sync, capped at once a minute, and `suspend`ed for the duration of
 * a sync so its own hydrate doesn't re-arm the timer into a loop.
 */
let autoTimer: ReturnType<typeof setTimeout> | null = null
let syncInFlight: Promise<SyncOutcome> | null = null
let suspend = false
// A crypto-conflict blocks auto-retries until a manual sync resolves it.
let autoBlocked = false
// Seeded to "now" so the initial hydrate on launch doesn't fire a sync 12s after
// every start — the first auto-sync waits out the min-gap like any other.
let lastSyncAt = Date.now()

const AUTO_DEBOUNCE = 12_000
const AUTO_MIN_GAP = 60_000

async function runAutoSync() {
  autoTimer = null
  if (autoBlocked || !useData.getState().autoSyncOn) return

  const since = Date.now() - lastSyncAt
  if (since < AUTO_MIN_GAP) {
    autoTimer = setTimeout(runAutoSync, AUTO_MIN_GAP - since)
    return
  }
  // No token or repo -> syncNow no-ops. Skip the network attempt entirely.
  const token = (await db.meta.get('githubToken'))?.value as string | undefined
  const repo = (await db.meta.get('githubRepo'))?.value as string | undefined
  if (!token || !repo) return

  // syncNow carries the mutex + suspend and sets lastSyncAt/autoBlocked itself.
  await useData.getState().syncNow()
}

function scheduleAutoSync() {
  if (suspend || syncInFlight || autoBlocked || !useData.getState().autoSyncOn) return
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = setTimeout(runAutoSync, AUTO_DEBOUNCE)
}

// Re-arm on any real change to synced data — never on the sync's own writes.
useData.subscribe((s, prev) => {
  if (
    s.notes !== prev.notes ||
    s.folders !== prev.folders ||
    s.srs !== prev.srs ||
    s.todos !== prev.todos ||
    s.goals !== prev.goals ||
    s.week !== prev.week ||
    s.rituals !== prev.rituals ||
    s.ranged !== prev.ranged ||
    s.watch !== prev.watch ||
    s.journal !== prev.journal
  ) {
    scheduleAutoSync()
  }
})
