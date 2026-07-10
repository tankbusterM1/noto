import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI / shell store — the ephemeral, app-chrome and view state that the
 * prototype kept in one big state object. Only durable *preferences*
 * (dark/slim/accent/inkFade) are persisted; navigation/view state resets on
 * reload, exactly like the prototype. Data lives in the Dexie-backed store.
 */

export type Screen =
  | 'today'
  | 'notes'
  | 'editor'
  | 'loom'
  | 'queue'
  | 'session'
  | 'journal'
  | 'todos'
  | 'watch'
  | 'trash'

export type Accent = '#35518E' | '#4A7350' | '#7D4A34' | '#41414B'
export type TodoSeg = 'today' | 'week' | 'month'
export type WatchFilter = 'All' | 'Video' | 'Article' | 'Paper'
export type JournalMode = 'prompt' | 'blank'

/** Curated accent options (README): blue (default), green, rust, slate. */
export const ACCENTS: { value: Accent; name: string }[] = [
  { value: '#35518E', name: 'blue' },
  { value: '#4A7350', name: 'green' },
  { value: '#7D4A34', name: 'rust' },
  { value: '#41414B', name: 'slate' },
]

interface UIState {
  // preferences (persisted)
  dark: boolean
  slim: boolean
  /** Sidebar fully visible? false = hidden (immersive full-screen writing). */
  sbOpen: boolean
  accent: Accent
  inkFade: boolean
  /** Per-note reading mode (true = reading). Sticks until you flip it back. */
  noteMode: Record<string, boolean>

  // navigation / view state (ephemeral)
  screen: Screen
  noteId: string
  selFolder: string
  libQ: string
  expanded: Record<string, boolean>
  renamingFolder: string | null
  tSeg: TodoSeg
  wFilter: WatchFilter
  wTagF: string
  wOpenId: string | null
  jLocked: boolean
  jMode: JournalMode
  thread: string | null
  /** Ink trail — the path of notes you've hopped through (most recent last). */
  trail: string[]
  pal: string | null
  palIdx: number
  settingsOpen: boolean
  /** '?' shortcut cheatsheet. */
  helpOpen: boolean
  /** Per-note draft-history drawer (opens for the current note). */
  historyOpen: boolean
  /** Bumped to force the note editor to remount (e.g. after restoring a draft). */
  editorEpoch: number
  toast: string | null

  // preference actions
  toggleTheme: () => void
  toggleSlim: () => void
  /** Show/hide the whole sidebar (⌘\ · Obsidian-style immersive mode). */
  toggleSidebar: () => void
  setAccent: (accent: Accent) => void
  setInkFade: (inkFade: boolean) => void
  /** Remember a note's reading/edit mode. */
  setNoteReading: (id: string, reading: boolean) => void

  // navigation actions
  setScreen: (screen: Screen) => void
  openNote: (id: string) => void
  openWatchItem: (id: string) => void
  closeWatch: () => void
  setSelFolder: (id: string) => void
  setLibQ: (q: string) => void
  setExpanded: (map: Record<string, boolean>) => void
  toggleExpand: (id: string) => void
  startRenameFolder: (id: string) => void
  stopRenameFolder: () => void
  setTSeg: (seg: TodoSeg) => void
  setWFilter: (f: WatchFilter) => void
  setWTagF: (t: string) => void
  setThread: (tag: string | null) => void
  clearTrail: () => void

  // command palette
  openPalette: () => void
  closePalette: () => void
  setPalQ: (q: string) => void
  movePalette: (dir: number) => void

  // settings
  openSettings: () => void
  closeSettings: () => void

  // help sheet
  toggleHelp: () => void
  closeHelp: () => void

  // draft history
  openHistory: () => void
  closeHistory: () => void
  bumpEditor: () => void

  // journal actions
  unlockJournal: () => void
  toggleJournalLock: () => void
  setJMode: (m: JournalMode) => void

  // toast
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      dark: false,
      slim: false,
      sbOpen: true,
      accent: '#35518E',
      inkFade: true,
      noteMode: {},

      screen: 'today',
      noteId: 'n2',
      selFolder: 'all',
      libQ: '',
      expanded: { f1: true, f6: true },
      renamingFolder: null,
      tSeg: 'today',
      wFilter: 'All',
      wTagF: 'All',
      wOpenId: null,
      jLocked: true,
      jMode: 'prompt',
      thread: null,
      trail: [],
      pal: null,
      palIdx: 0,
      settingsOpen: false,
      helpOpen: false,
      historyOpen: false,
      editorEpoch: 0,
      toast: null,

      toggleTheme: () => set((s) => ({ dark: !s.dark })),
      toggleSlim: () => set((s) => ({ slim: !s.slim })),
      // Reopening always returns to the full-width sidebar (never slim).
      toggleSidebar: () => set((s) => (s.sbOpen ? { sbOpen: false } : { sbOpen: true, slim: false })),
      setAccent: (accent) => set({ accent }),
      setInkFade: (inkFade) => set({ inkFade }),
      setNoteReading: (id, reading) => set((s) => ({ noteMode: { ...s.noteMode, [id]: reading } })),

      setScreen: (screen) => set({ screen }),
      openNote: (id) =>
        set((s) => ({
          noteId: id,
          screen: 'editor',
          // Ink trail: move this note to the end of the path (cap 6).
          trail: [...s.trail.filter((x) => x !== id), id].slice(-6),
        })),
      openWatchItem: (id) => set({ screen: 'watch', wOpenId: id }),
      closeWatch: () => set({ wOpenId: null }),
      setSelFolder: (id) => set({ selFolder: id }),
      setLibQ: (libQ) => set({ libQ }),
      setExpanded: (expanded) => set({ expanded }),
      toggleExpand: (id) =>
        set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      startRenameFolder: (id) => set({ renamingFolder: id }),
      stopRenameFolder: () => set({ renamingFolder: null }),
      setTSeg: (tSeg) => set({ tSeg }),
      setWFilter: (wFilter) => set({ wFilter }),
      setWTagF: (wTagF) => set({ wTagF }),
      setThread: (thread) => set({ thread }),
      clearTrail: () => set({ trail: [] }),

      openPalette: () => set({ pal: '', palIdx: 0 }),
      closePalette: () => set({ pal: null }),
      setPalQ: (pal) => set({ pal, palIdx: 0 }),
      movePalette: (dir) => set((s) => ({ palIdx: s.palIdx + dir })),

      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),

      toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
      closeHelp: () => set({ helpOpen: false }),

      openHistory: () => set({ historyOpen: true }),
      closeHistory: () => set({ historyOpen: false }),
      bumpEditor: () => set((s) => ({ editorEpoch: s.editorEpoch + 1 })),

      unlockJournal: () => {
        set({ jLocked: false })
        get().showToast('Unlocked — just you and the page')
      },
      toggleJournalLock: () => set((s) => ({ jLocked: !s.jLocked })),
      setJMode: (jMode) => set({ jMode }),

      showToast: (msg) => {
        clearTimeout(toastTimer)
        set({ toast: msg })
        toastTimer = setTimeout(() => set({ toast: null }), 2400)
      },
    }),
    {
      name: 'noto-ui',
      partialize: (s) => ({
        dark: s.dark,
        slim: s.slim,
        sbOpen: s.sbOpen,
        accent: s.accent,
        inkFade: s.inkFade,
        noteMode: s.noteMode,
      }),
    },
  ),
)
