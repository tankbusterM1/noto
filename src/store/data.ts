import { create } from 'zustand'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { todayEpochDay, agoMs } from '../lib/dates'
import { domainOf } from '../lib/format'
import { scrapeLink, type Scraped } from '../lib/scrape'
import { applyGrade, dueNotes } from '../lib/srs'
import {
  allHistory,
  calibration,
  initMemory,
  memoryOf,
  replayMemory,
  reviewMemory,
  scheduleInterval,
} from '../lib/adaptive'
import { notesIn, kidsOf } from '../lib/tree'
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

const numId = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0
const WATCH_HUES = [358, 215, 165, 262, 32, 205]

// Collision-proof entity id: Date.now() keeps ids roughly chronological (so
// `numId` still sorts by creation) while a per-session counter breaks ties for
// items created within the same millisecond. Purely numeric so numId parses it.
let idSeq = 0
const uid = (prefix: string) => prefix + (Date.now() * 1000 + (idSeq++ % 1000))

// Single-flight guard so React StrictMode's double mount can't seed twice.
let hydrating: Promise<void> | null = null

async function hydrateImpl(set: (partial: Partial<DataState>) => void): Promise<void> {
  await db.open()
  // Sample data seeds ONLY in the dev sandbox (npm run dev). The real app
  // (production build) starts as a clean, empty vault — your own notebook.
  if (import.meta.env.DEV && (await db.folders.count()) === 0) await seedDatabase()

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
  ])

  const folders: Folder[] = folderRows
    .map((r) => ({ id: r.id, name: r.name, parentId: r.parentId }))
    .sort((a, b) => numId(a.id) - numId(b.id))

  const notes: Note[] = noteRows
    .map((r) => ({
      id: r.id,
      title: r.title,
      folderId: r.folderId,
      tags: r.tags,
      created: r.createdDay - today,
      updated: r.updatedDay - today,
      blocks: r.blocks.map((b, i) => (b.id ? b : { ...b, id: `${r.id}-b${i}` })),
    }))
    .sort((a, b) => numId(a.id) - numId(b.id))

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
  const watch: Watch[] = watchRows
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((r) => ({ ...r, added: r.addedAt > 1.4e12 ? agoMs(r.addedAt) : r.added }))

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
  const scratchpad = journalCrypto
    ? ''
    : (metaRows.find((m) => m.key === 'scratchpad')?.value as string | undefined) ?? ''

  const ledgerByDay: Record<number, number> = {}
  for (const l of ledgerRows) ledgerByDay[l.day] = (ledgerByDay[l.day] ?? 0) + 1
  const doneToday = ledgerByDay[today] ?? 0

  set({
    hydrated: true,
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
    scratchpad,
    journalCrypto,
    ledgerByDay,
    doneToday,
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
  scratchpad: '',
  journalCrypto: null,
  journalKey: null,
  tagsPool: [],
  doneToday: 0,
  ledgerByDay: {},
  session: null,
  hydrateError: null,

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

  toggleTodo: (id) => {
    set({ todos: get().todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().todos.find((t) => t.id === id)?.done
    if (done !== undefined) void db.todos.update(id, { done })
  },
  toggleGoal: (id) => {
    set({ goals: get().goals.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().goals.find((t) => t.id === id)?.done
    if (done !== undefined) void db.goals.update(id, { done })
  },
  toggleWeek: (id) => {
    set({ week: get().week.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().week.find((t) => t.id === id)?.done
    if (done !== undefined) void db.week.update(id, { done })
  },
  toggleRitual: (id) => {
    set({ rituals: get().rituals.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
    const done = get().rituals.find((t) => t.id === id)?.done
    if (done !== undefined) void db.rituals.update(id, { done })
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
    void db.watch.add({ ...item, addedAt: Date.now() })
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

  watchPatch: (id, patch) => {
    set({ watch: get().watch.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
    void db.watch.update(id, patch)
  },
  watchToggle: (id) => {
    const cur = get().watch.find((w) => w.id === id)
    if (cur) get().watchPatch(id, { done: !cur.done })
  },
  watchDelete: (id) => {
    set({ watch: get().watch.filter((w) => w.id !== id) })
    void db.watch.delete(id)
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
      set({ folders: [f] })
      void db.folders.add(f)
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
    void db.notes.add({ id, title: note.title, folderId, tags: [], createdDay: today, updatedDay: today, blocks: note.blocks })
    ui.openNote(id)
    ui.showToast('New note created')
  },
  updateNote: (id, patch) => {
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
      })
    }
  },
  appendBlock: (noteId, block) => {
    const n = get().notes.find((x) => x.id === noteId)
    if (n) get().updateNote(noteId, { blocks: [...n.blocks, { ...block, id: block.id ?? blockId() }] })
  },
  deleteNote: (id) => {
    const srs = { ...get().srs }
    delete srs[id]
    set({
      notes: get().notes.filter((n) => n.id !== id),
      srs,
      todos: get().todos.map((t) => (t.ref?.type === 'note' && t.ref.id === id ? { ...t, ref: undefined } : t)),
    })
    void db.notes.delete(id)
    void db.srs.delete(id)
    void db.ledger.where('noteId').equals(id).delete()
    get().todos.forEach((t) => {
      if (t.ref?.type === 'note' && t.ref.id === id) void db.todos.update(t.id, { ref: undefined })
    })
    const ui = useUI.getState()
    if (ui.noteId === id) ui.setScreen('notes')
    ui.showToast('Note deleted')
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
    const id = uid('f')
    set({ folders: [...get().folders, { id, name: 'New folder', parentId }] })
    void db.folders.add({ id, name: 'New folder', parentId })
    const ui = useUI.getState()
    if (parentId) ui.setExpanded({ ...ui.expanded, [parentId]: true })
    ui.setSelFolder(id)
    ui.startRenameFolder(id)
  },
  renameFolder: (id, name) => {
    const nm = name.trim() || 'Untitled folder'
    set({ folders: get().folders.map((f) => (f.id === id ? { ...f, name: nm } : f)) })
    void db.folders.update(id, { name: nm })
  },
  deleteFolder: (id) => {
    const folders = get().folders
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    const parent = folder.parentId
    const directNotes = notesIn(get().notes, id)
    if (parent === null && directNotes.length > 0) {
      useUI.getState().showToast("Move this folder's notes before deleting a top-level folder")
      return
    }
    const childFolders = kidsOf(folders, id)
    set({
      folders: folders
        .map((f) => (f.parentId === id ? { ...f, parentId: parent } : f))
        .filter((f) => f.id !== id),
      notes: get().notes.map((n) => (n.folderId === id ? { ...n, folderId: parent as string } : n)),
    })
    childFolders.forEach((f) => void db.folders.update(f.id, { parentId: parent }))
    directNotes.forEach((n) => void db.notes.update(n.id, { folderId: parent as string }))
    void db.folders.delete(id)
    const ui = useUI.getState()
    if (ui.selFolder === id) ui.setSelFolder('all')
    ui.showToast('Folder deleted')
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
    void db.todos.add(todo)
  },
  deleteTodo: (id) => {
    set({ todos: get().todos.filter((t) => t.id !== id) })
    void db.todos.delete(id)
  },
  addGoal: (text) => {
    const t = text.trim()
    if (!t) return
    const g: Goal = { id: uid('g'), text: t, done: false }
    set({ goals: [...get().goals, g] })
    void db.goals.add(g)
  },
  deleteGoal: (id) => {
    set({ goals: get().goals.filter((g) => g.id !== id) })
    void db.goals.delete(id)
  },
  addRitual: (text) => {
    const t = text.trim()
    if (!t) return
    const r: Ritual = { id: uid('r'), text: t, streak: 0, done: false }
    set({ rituals: [...get().rituals, r] })
    void db.rituals.add(r)
  },
  deleteRitual: (id) => {
    set({ rituals: get().rituals.filter((r) => r.id !== id) })
    void db.rituals.delete(id)
  },
  addWeekItem: (day, text) => {
    const t = text.trim()
    if (!t) return
    const w: WeekItem = { id: uid('w'), day, text: t, done: false }
    set({ week: [...get().week, w] })
    void db.week.add(w)
  },
  deleteWeekItem: (id) => {
    set({ week: get().week.filter((w) => w.id !== id) })
    void db.week.delete(id)
  },
  addRanged: (text, from, to) => {
    const t = text.trim()
    if (!t) return
    const lo = Math.max(1, Math.min(31, Math.min(from, to)))
    const hi = Math.max(1, Math.min(31, Math.max(from, to)))
    const hue = [215, 28, 262, 165, 320][get().ranged.length % 5]
    const r: Ranged = { id: uid('rg'), text: t, from: lo, to: hi, hue }
    set({ ranged: [...get().ranged, r] })
    void db.ranged.add(r)
  },
  deleteRanged: (id) => {
    set({ ranged: get().ranged.filter((r) => r.id !== id) })
    void db.ranged.delete(id)
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
    if (existing) {
      set({ journal: get().journal.map((e) => (e.off === 0 ? { ...e, words, text: clean } : e)) })
      if (existing.id !== undefined) {
        if (key) await db.journal.put({ id: existing.id, day: today, enc: await encryptJSON(key, { text: clean, words }) })
        else await db.journal.update(existing.id, { day: today, words, text: clean })
      }
    } else {
      set({ journal: [{ off: 0, words, text: clean }, ...get().journal] })
      const row = key
        ? { day: today, enc: await encryptJSON(key, { text: clean, words }) }
        : { day: today, words, text: clean }
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
    if (key) await db.meta.put({ key: 'scratchpadEnc', value: await encryptJSON(key, text) })
    else await db.meta.put({ key: 'scratchpad', value: text })
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
      for (const e of entries) {
        const enc = await encryptJSON(key, { text: e.text, words: e.words })
        if (e.id !== undefined) {
          await db.journal.put({ id: e.id, day: today + e.off, enc })
          migrated.push(e)
        } else {
          const newId = await db.journal.add({ day: today + e.off, enc })
          migrated.push({ ...e, id: newId as number })
        }
      }
      await db.meta.put({ key: 'journalCrypto', value: cryptoMeta })
      await db.meta.put({ key: 'scratchpadEnc', value: await encryptJSON(key, scratch) })
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
    try {
      await db.transaction('rw', db.tables, async () => {
        for (const name of TABLE_NAMES) {
          const rows = data[name]
          // Only replace tables the file actually carries. A partial/older backup
          // that omits a table leaves the existing one intact instead of wiping
          // it (this used to clear all 12 tables before checking each).
          if (!Array.isArray(rows)) continue
          await db.table(name).clear()
          if (rows.length) await db.table(name).bulkAdd(rows)
        }
      })
      return true
    } catch {
      toast('Import failed while writing')
      return false
    }
  },
  resetData: async () => {
    await db.delete()
  },
}))
