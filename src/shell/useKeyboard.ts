import { useEffect } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import type { Grade } from '../lib/types'

/**
 * Global keyboard handling (README "Keyboard"):
 *  - in a session: `space` reveals, `1–4` grade (only once revealed)
 *  - `esc` closes thread → watch drawer → session, in that priority
 * The ⌘K palette + palette navigation are layered on in step 5.
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

      const s = data.session
      if (s && ui.screen === 'session' && s.idx < s.queue.length) {
        if (!data.sRevealed) {
          if (e.key === ' ' && !typing) {
            e.preventDefault()
            data.reveal()
            return
          }
        } else if (['1', '2', '3', '4'].includes(e.key) && !typing) {
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
