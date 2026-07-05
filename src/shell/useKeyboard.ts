import { useEffect } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import type { Grade } from '../lib/types'

/**
 * Global keyboard handling:
 *  - ⌘/Ctrl-K toggles the command palette (its input owns ↑/↓/↵)
 *  - in a session: `1–4` grade the whole note directly (no reveal gate)
 *  - `esc` closes palette → thread → watch drawer → session, in that priority
 */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      const data = useData.getState()
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.isContentEditable)

      // ⌘/Ctrl-K toggles the palette from anywhere.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (ui.pal === null) ui.openPalette()
        else ui.closePalette()
        return
      }
      // While the palette is open, its input owns ↑/↓/↵; esc closes globally.
      if (ui.pal !== null) {
        if (e.key === 'Escape') ui.closePalette()
        return
      }

      // Whole-note review: no reveal gate — 1-4 grade the note directly.
      const s = data.session
      if (s && ui.screen === 'session' && s.idx < s.queue.length) {
        if (['1', '2', '3', '4'].includes(e.key) && !typing) {
          data.grade(Number(e.key) as Grade)
          return
        }
      }

      if (e.key === 'Escape') {
        if (ui.thread) ui.setThread(null)
        else if (ui.wOpenId) ui.closeWatch()
        else if (ui.screen === 'session') data.endSession()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
