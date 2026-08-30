import { useEffect } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import type { Grade } from '../lib/types'

/**
 * Global keyboard handling:
 *  - ⌘/Ctrl-K toggles the command palette (its input owns ↑/↓/↵)
 *  - ⌘/Ctrl-\ toggles the sidebar (full-screen writing)
 *  - ⌘/Ctrl-⇧-\ toggles the editor's memory rail (the other half of that)
 *  - while reviewing: `1–4` grade, `space` = Good, `esc` = back to the list
 *  - `esc` closes palette → settings → thread → watch drawer → session
 */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      const data = useData.getState()
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.isContentEditable)

      // ⌘/Ctrl-⇧-\ toggles the editor's memory rail — the mirror of ⌘\ for the
      // right-hand side. Shift-\ arrives as '|', so it can't hit the case below.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '|' || e.key === '\\')) {
        e.preventDefault()
        ui.toggleMemRail()
        return
      }
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
      // Same for the '?' cheatsheet.
      if (ui.helpOpen) {
        if (e.key === 'Escape' || e.key === '?') ui.closeHelp()
        return
      }
      // '?' opens the shortcut sheet (when not typing).
      if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        ui.toggleHelp()
        return
      }

      // Whole-note review: no reveal gate — 1-4 grade the open note directly,
      // and space is the one you reach for most (Good).
      if (ui.screen === 'reviewing' && ui.reviewId && !typing) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          e.preventDefault()
          data.grade(Number(e.key) as Grade)
          return
        }
        if (e.key === ' ') {
          e.preventDefault()
          data.grade(3)
          return
        }
      }

      if (e.key === 'Escape') {
        if (ui.thread) ui.setThread(null)
        else if (ui.wOpenId) ui.closeWatch()
        else if (ui.screen === 'reviewing') ui.endReview()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
