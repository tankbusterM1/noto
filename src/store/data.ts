import { create } from 'zustand'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { todayEpochDay } from '../lib/dates'
import { domainOf } from '../lib/format'
import { useUI } from './ui'
import type {
  Block,
  Folder,
  Goal,
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
  tagsPool: string[]
  doneToday: number
  extra: Record<string, Block[]>
  langO: Record<string, string>

  hydrate: () => Promise<void>
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
  addBlock: (noteId: string, block: Block) => void
  setLang: (key: string, lang: string) => void
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
  const journal: JournalEntry[] = journalRows.map((r) => ({
    id: r.id,
    off: r.off,
    words: r.words,
    text: r.text,
  }))
  const tagsPool =
    (metaRows.find((m) => m.key === 'tagsPool')?.value as string[] | undefined) ?? []

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
  tagsPool: [],
  doneToday: 0,
  extra: {},
  langO: {},

  hydrate: () => {
    if (get().hydrated) return Promise.resolve()
    if (!hydrating) hydrating = hydrateImpl(set)
    return hydrating
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

  addBlock: (noteId, block) => {
    set({ extra: { ...get().extra, [noteId]: [...(get().extra[noteId] ?? []), block] } })
  },
  setLang: (key, lang) => {
    set({ langO: { ...get().langO, [key]: lang } })
  },
}))
