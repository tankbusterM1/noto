import { useEffect } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import type { Grade } from '../lib/types'

/**
 * Global keyboard handling:
 *  - ⌘/Ctrl-K toggles the command palette (its input owns ↑/↓/↵)
 *  - ⌘/Ctrl-\ toggles the sidebar (full-screen writing)
 *  - in a session: `1–4` grade the whole note directly (no reveal gate)
 *  - `esc` closes palette → settings → thread → watch drawer → session
 */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      const data = useData.getState()
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.isContentEditable)

      // ⌘/Ctrl-\ toggles the sidebar (Obsidian/Notion-style full-screen writing).
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        ui.toggleSidebar()
        return
      }
      // ⌘/Ctrl-K toggles the palette from anywhere — but never stacks it over Settings.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (ui.settingsOpen) return
        if (ui.pal === null) ui.openPalette()
        else ui.closePalette()
        return
      }
      // While the palette is open, its input owns ↑/↓/↵; esc closes globally.
      if (ui.pal !== null) {
        if (e.key === 'Escape') ui.closePalette()
        return
      }
      // Settings is a modal overlay: esc closes it, and it swallows other shortcuts
      // (so 1–4 can't grade a hidden session behind it).
      if (ui.settingsOpen) {
        if (e.key === 'Escape') ui.closeSettings()
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
