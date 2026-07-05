import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection, dropCursor } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { useData } from '../store/data'
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown'
import { ContextMenu, type MenuItem, type MenuState } from './ContextMenu'
import type { Note } from '../lib/types'

/*
 * The note editor, built on CodeMirror 6 — the same engine Obsidian uses.
 * Real text editing (selection, undo, IME, paste), themed to Noto: serif prose,
 * amber caret + selection, live markdown styling. CodeMirror owns its DOM, so
 * React never resets the cursor. Edits parse markdown → blocks (debounced) so
 * the review session keeps rendering.
 */

const SERIF = "'Newsreader', Georgia, serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"

// Live markdown styling (Obsidian "source" feel): headings big serif, muted
// markers, amber inline code, italic quotes.
const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '600', fontFamily: SERIF, lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.4em', fontWeight: '600', fontFamily: SERIF, lineHeight: '1.3' },
  { tag: t.heading, fontSize: '1.2em', fontWeight: '600', fontFamily: SERIF },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--ac)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--ink3)' },
  { tag: [t.monospace], fontFamily: MONO, color: 'var(--am)', fontSize: '0.9em' },
  { tag: t.quote, color: 'var(--ink2)', fontStyle: 'italic' },
  { tag: [t.list], color: 'var(--am)' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--ink3)' },
])

const theme = EditorView.theme(
  {
    '&': { color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '15px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: SERIF, lineHeight: '1.75', overflow: 'visible' },
    '.cm-content': { padding: '2px 0', caretColor: 'var(--am)' },
    '.cm-line': { padding: '0 2px 0 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--am)', borderLeftWidth: '2px' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(184,122,38,0.16)' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(184,122,38,0.22)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--sf2)', outline: 'none' },
    '.cm-placeholder': { color: 'var(--ink3)', fontStyle: 'italic' },
  },
  { dark: false },
)

function insertImage(view: EditorView, file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    const url = reader.result as string
    const at = view.state.selection.main.head
    view.dispatch({
      changes: { from: at, insert: `\n![image](${url})\n` },
      selection: { anchor: at + 2 },
    })
  }
  reader.readAsDataURL(file)
}

// ── Formatting commands (right-click menu) ────────────────────────────
interface Sel {
  from: number
  to: number
  head: number
}

/** Wrap the selection in markers (toggles off if already wrapped). */
function wrapSel(view: EditorView, r: Sel, before: string, after = before) {
  const text = view.state.sliceDoc(r.from, r.to)
  const wrapped = text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)
  if (wrapped) {
    const inner = text.slice(before.length, text.length - after.length)
    view.dispatch({ changes: { from: r.from, to: r.to, insert: inner }, selection: EditorSelection.range(r.from, r.from + inner.length) })
  } else {
    view.dispatch({ changes: { from: r.from, to: r.to, insert: before + text + after }, selection: EditorSelection.range(r.from + before.length, r.to + before.length) })
  }
  view.focus()
}

/** Set (or clear, level 0) the heading level on the caret's line. */
function setHeading(view: EditorView, r: Sel, level: number) {
  const line = view.state.doc.lineAt(r.head)
  const stripped = line.text.replace(/^#{1,6}\s+/, '')
  const prefix = level > 0 ? '#'.repeat(level) + ' ' : ''
  view.dispatch({ changes: { from: line.from, to: line.to, insert: prefix + stripped } })
  view.focus()
}

/** Toggle a line prefix (list / quote) across every line in the selection. */
function toggleLines(view: EditorView, r: Sel, prefix: string, re: RegExp) {
  const startN = view.state.doc.lineAt(r.from).number
  const endN = view.state.doc.lineAt(r.to).number
  const changes: { from: number; to?: number; insert: string }[] = []
  for (let n = startN; n <= endN; n++) {
    const line = view.state.doc.line(n)
    if (re.test(line.text)) changes.push({ from: line.from, to: line.to, insert: line.text.replace(re, '') })
    else changes.push({ from: line.from, insert: prefix })
  }
  view.dispatch({ changes })
  view.focus()
}

function codeBlock(view: EditorView, r: Sel) {
  const text = view.state.sliceDoc(r.from, r.to)
  view.dispatch({ changes: { from: r.from, to: r.to, insert: '```\n' + text + '\n```' }, selection: EditorSelection.cursor(r.from + 4) })
  view.focus()
}

function makeLink(view: EditorView, r: Sel) {
  const text = view.state.sliceDoc(r.from, r.to) || 'text'
  const insert = `[${text}](url)`
  const urlAt = r.from + text.length + 3
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.range(urlAt, urlAt + 3) })
  view.focus()
}

const glyph = (node: ReactNode): ReactNode => (
  <span style={{ fontSize: 12, fontWeight: 600 }}>{node}</span>
)

function formatItems(view: EditorView, r: Sel): MenuItem[] {
  const div = (): MenuItem => ({ label: '', onClick: () => {}, divider: true })
  return [
    { label: 'Bold', icon: glyph('B'), onClick: () => wrapSel(view, r, '**') },
    { label: 'Italic', icon: glyph(<em>I</em>), onClick: () => wrapSel(view, r, '*') },
    { label: 'Strikethrough', icon: glyph(<s>S</s>), onClick: () => wrapSel(view, r, '~~') },
    { label: 'Inline code', icon: glyph('‹›'), onClick: () => wrapSel(view, r, '`') },
    div(),
    { label: 'Heading — large', icon: glyph('H1'), onClick: () => setHeading(view, r, 1) },
    { label: 'Heading — medium', icon: glyph('H2'), onClick: () => setHeading(view, r, 2) },
    { label: 'Heading — small', icon: glyph('H3'), onClick: () => setHeading(view, r, 3) },
    { label: 'Body text', icon: glyph('¶'), onClick: () => setHeading(view, r, 0) },
    div(),
    { label: 'Bullet list', icon: glyph('•'), onClick: () => toggleLines(view, r, '- ', /^\s*[-*]\s+/) },
    { label: 'Quote', icon: glyph('❝'), onClick: () => toggleLines(view, r, '> ', /^>\s?/) },
    { label: 'Code block', icon: glyph('{ }'), onClick: () => codeBlock(view, r) },
    { label: 'Link', icon: glyph('↗'), onClick: () => makeLink(view, r) },
  ]
}

export function MarkdownEditor({ note }: { note: Note }) {
  const updateNote = useData((s) => s.updateNote)
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const onContextMenu = (e: MouseEvent) => {
    const view = viewRef.current
    if (!view) return
    e.preventDefault()
    const m = view.state.selection.main
    setMenu({ x: e.clientX, y: e.clientY, items: formatItems(view, { from: m.from, to: m.to, head: m.head }) })
  }

  // Rebuild the editor only when the note changes (not on every keystroke).
  useEffect(() => {
    if (!host.current) return
    const noteId = note.id

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: blocksToMarkdown(note.blocks),
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          placeholder('Write, in markdown — # heading · - list · > quote · ``` code · ![](img)'),
          EditorView.domEventHandlers({
            paste(e, v) {
              const img = [...(e.clipboardData?.items ?? [])]
                .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
                .find((f) => f && f.type.startsWith('image/'))
              if (img) {
                e.preventDefault()
                insertImage(v, img)
                return true
              }
              return false
            },
            drop(e, v) {
              const img = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
              if (img) {
                e.preventDefault()
                insertImage(v, img)
                return true
              }
              return false
            },
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            clearTimeout(saveTimer.current)
            const md = u.state.doc.toString()
            saveTimer.current = setTimeout(() => {
              updateNote(noteId, { blocks: markdownToBlocks(md) })
            }, 400)
          }),
        ],
      }),
    })

    viewRef.current = view
    return () => {
      clearTimeout(saveTimer.current)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  return (
    <>
      <div ref={host} onContextMenu={onContextMenu} />
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  )
}
