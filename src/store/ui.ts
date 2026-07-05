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
  | 'queue'
  | 'session'
  | 'journal'
  | 'todos'
  | 'watch'

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
  accent: Accent
  inkFade: boolean

  // navigation / view state (ephemeral)
  screen: Screen
  noteId: string
  selFolder: string
  libQ: string
  expanded: Record<string, boolean>
  tSeg: TodoSeg
  wFilter: WatchFilter
  wTagF: string
  wOpenId: string | null
  jLocked: boolean
  jMode: JournalMode
  jSaved: boolean
  thread: string | null
  toast: string | null

  // preference actions
  toggleTheme: () => void
  toggleSlim: () => void
  setAccent: (accent: Accent) => void
  setInkFade: (inkFade: boolean) => void

  // navigation actions
  setScreen: (screen: Screen) => void
  openNote: (id: string) => void
  openWatchItem: (id: string) => void
  closeWatch: () => void
  setSelFolder: (id: string) => void
  setLibQ: (q: string) => void
  setExpanded: (map: Record<string, boolean>) => void
  toggleExpand: (id: string) => void
  setTSeg: (seg: TodoSeg) => void
  setWFilter: (f: WatchFilter) => void
  setWTagF: (t: string) => void
  setThread: (tag: string | null) => void

  // journal actions
  unlockJournal: () => void
  toggleJournalLock: () => void
  setJMode: (m: JournalMode) => void
  saveJournal: () => void

  // toast
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      dark: false,
      slim: false,
      accent: '#35518E',
      inkFade: true,

      screen: 'today',
      noteId: 'n2',
      selFolder: 'all',
      libQ: '',
      expanded: { f1: true, f6: true },
      tSeg: 'today',
      wFilter: 'All',
      wTagF: 'All',
      wOpenId: null,
      jLocked: true,
      jMode: 'prompt',
      jSaved: false,
      thread: null,
      toast: null,

      toggleTheme: () => set((s) => ({ dark: !s.dark })),
      toggleSlim: () => set((s) => ({ slim: !s.slim })),
      setAccent: (accent) => set({ accent }),
      setInkFade: (inkFade) => set({ inkFade }),

      setScreen: (screen) => set({ screen }),
      openNote: (id) => set({ noteId: id, screen: 'editor' }),
      openWatchItem: (id) => set({ screen: 'watch', wOpenId: id }),
      closeWatch: () => set({ wOpenId: null }),
      setSelFolder: (id) => set({ selFolder: id }),
      setLibQ: (libQ) => set({ libQ }),
      setExpanded: (expanded) => set({ expanded }),
      toggleExpand: (id) =>
        set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      setTSeg: (tSeg) => set({ tSeg }),
      setWFilter: (wFilter) => set({ wFilter }),
      setWTagF: (wTagF) => set({ wTagF }),
      setThread: (thread) => set({ thread }),

      unlockJournal: () => {
        set({ jLocked: false })
        get().showToast('Unlocked — just you and the page')
      },
      toggleJournalLock: () => set((s) => ({ jLocked: !s.jLocked })),
      setJMode: (jMode) => set({ jMode }),
      saveJournal: () => {
        if (get().jSaved) {
          get().showToast('Already saved — see you tomorrow')
          return
        }
        set({ jSaved: true })
        get().showToast('Saved · streak extended to 7 days')
      },

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
        accent: s.accent,
        inkFade: s.inkFade,
      }),
    },
  ),
)
