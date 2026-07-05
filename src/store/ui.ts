import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI / shell store — the ephemeral, app-chrome state that the prototype kept
 * alongside its data (screen, dark, slim, accent, inkFade). Data (notes,
 * folders, srs, todos, …) lives in a separate store backed by Dexie (step 2).
 *
 * `accent` and `inkFade` are the two "tweakable props" the design already
 * accounts for (README "Tweakable props").
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

/** Curated accent options (README): blue (default), green, rust, slate. */
export const ACCENTS: { value: Accent; name: string }[] = [
  { value: '#35518E', name: 'blue' },
  { value: '#4A7350', name: 'green' },
  { value: '#7D4A34', name: 'rust' },
  { value: '#41414B', name: 'slate' },
]

interface UIState {
  screen: Screen
  dark: boolean
  slim: boolean
  accent: Accent
  inkFade: boolean
  toast: string | null

  setScreen: (screen: Screen) => void
  toggleTheme: () => void
  toggleSlim: () => void
  setAccent: (accent: Accent) => void
  setInkFade: (inkFade: boolean) => void
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      screen: 'today',
      dark: false,
      slim: false,
      accent: '#35518E',
      inkFade: true,
      toast: null,

      setScreen: (screen) => set({ screen }),
      toggleTheme: () => set((s) => ({ dark: !s.dark })),
      toggleSlim: () => set((s) => ({ slim: !s.slim })),
      setAccent: (accent) => set({ accent }),
      setInkFade: (inkFade) => set({ inkFade }),
      showToast: (msg) => {
        clearTimeout(toastTimer)
        set({ toast: msg })
        toastTimer = setTimeout(() => set({ toast: null }), 2400)
      },
    }),
    {
      name: 'noto-ui',
      // Only persist the durable preferences, not the current screen.
      partialize: (s) => ({
        dark: s.dark,
        slim: s.slim,
        accent: s.accent,
        inkFade: s.inkFade,
      }),
    },
  ),
)
