import { create } from 'zustand'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { todayEpochDay } from '../lib/dates'
import { domainOf } from '../lib/format'
import { applyGrade, dueNotes } from '../lib/srs'
import { notesIn, kidsOf } from '../lib/tree'
import { useUI } from './ui'
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
  tagsPool: string[]
  doneToday: number
  session: Session | null

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
  newNote: () => void
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
}

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

// Single-flight guard so React StrictMode's double mount can't seed twice.
let hydrating: Promise<void> | null = null

async function hydrateImpl(set: (partial: Partial<DataState>) => void): Promise<void> {
  await db.open()
  if ((await db.folders.count()) === 0) await seedDatabase()

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
      blocks: r.blocks,
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
    srs[s.noteId] = { ease: s.ease, ivl: s.ivl, due: s.dueDay - today, hist }
  }

  const watch: Watch[] = watchRows.slice().sort((a, b) => b.addedAt - a.addedAt)
  const journal: JournalEntry[] = journalRows
    .map((r) => ({
      id: r.id,
      off: r.day !== undefined ? r.day - today : r.off ?? 0,
      words: r.words,
      text: r.text,
    }))
    .sort((a, b) => b.off - a.off)
  const tagsPool =
    (metaRows.find((m) => m.key === 'tagsPool')?.value as string[] | undefined) ?? []
  const scratchpad =
    (metaRows.find((m) => m.key === 'scratchpad')?.value as string | undefined) ?? ''

  set({
    hydrated: true,
    folders,
    notes,
    srs,
    todos,
    goals,
    week,
    rituals,
    ranged,
    watch,
    journal,
    tagsPool,
    scratchpad,
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
  tagsPool: [],
  doneToday: 0,
  session: null,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()
    if (!hydrating) hydrating = hydrateImpl(set)
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

    const today = todayEpochDay()
    void db.srs.put({ noteId: id, ease: next.ease, ivl: next.ivl, dueDay: today + next.due })
    void db.ledger.add({ noteId: id, day: today, grade: g, ivl: next.ivl })

    set({
      srs: { ...get().srs, [id]: next },
      session: {
        queue: requeue ? [...s.queue, id] : s.queue,
        idx: s.idx + 1,
        log: [...s.log, g],
      },
      doneToday: get().doneToday + 1,
    })
    useUI.getState().showToast(toast)
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
    const id = 'v' + Date.now()
    // STUB: real URL scraping (title / thumbnail / duration) is not implemented.
    // We fake it with a shimmer skeleton, then resolve to placeholder metadata.
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
    setTimeout(() => {
      const label =
        (kind === 'video' ? 'Video' : kind === 'paper' ? 'Paper' : 'Article') +
        ' from ' +
        domain +
        ' — click to rename'
      get().watchPatch(id, { loading: false, title: label, mins: kind === 'video' ? 34 : 12 })
      toast('Saved · scraped from ' + domain)
    }, 1100)
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

  newNote: () => {
    const ui = useUI.getState()
    const folders = get().folders
    const sel = ui.selFolder
    const folderId = sel !== 'all' && folders.some((f) => f.id === sel) ? sel : folders[0]?.id ?? ''
    const id = 'n' + Date.now()
    const note: Note = {
      id,
      title: 'Untitled note',
      folderId,
      tags: [],
      created: 0,
      updated: 0,
      blocks: [{ t: 'p', text: '' }],
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
    if (n) get().updateNote(noteId, { blocks: [...n.blocks, block] })
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
    const id = 'f' + Date.now()
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
    const todo: Todo = { id: 't' + Date.now(), text, done: false, ...(tag ? { tag } : {}) }
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
    const g: Goal = { id: 'g' + Date.now(), text: t, done: false }
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
    const r: Ritual = { id: 'r' + Date.now(), text: t, streak: 0, done: false }
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
    const w: WeekItem = { id: 'w' + Date.now(), day, text: t, done: false }
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
    const r: Ranged = { id: 'rg' + Date.now(), text: t, from: lo, to: hi, hue }
    set({ ranged: [...get().ranged, r] })
    void db.ranged.add(r)
  },
  deleteRanged: (id) => {
    set({ ranged: get().ranged.filter((r) => r.id !== id) })
    void db.ranged.delete(id)
  },

  saveJournalEntry: (text) => {
    const clean = text.trim()
    const toast = useUI.getState().showToast
    const existing = get().journal.find((e) => e.off === 0)
    if (!clean && !existing) {
      toast('Write something first')
      return
    }
    const wordCount = clean ? clean.split(/\s+/).filter(Boolean).length : 0
    const today = todayEpochDay()
    if (existing) {
      set({ journal: get().journal.map((e) => (e.off === 0 ? { ...e, words: wordCount, text: clean } : e)) })
      if (existing.id !== undefined) void db.journal.update(existing.id, { day: today, words: wordCount, text: clean })
    } else {
      set({ journal: [{ off: 0, words: wordCount, text: clean }, ...get().journal] })
      void db.journal.add({ day: today, words: wordCount, text: clean }).then((id) => {
        set({ journal: get().journal.map((e) => (e.off === 0 && e.id === undefined ? { ...e, id: id as number } : e)) })
      })
    }
    toast("Saved · today's entry kept")
  },
  saveScratchpad: (text) => {
    set({ scratchpad: text })
    void db.meta.put({ key: 'scratchpad', value: text })
  },
}))
