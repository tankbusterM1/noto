import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection, dropCursor } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { useData } from '../store/data'
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown'
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

export function MarkdownEditor({ note }: { note: Note }) {
  const updateNote = useData((s) => s.updateNote)
  const host = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

    return () => {
      clearTimeout(saveTimer.current)
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  return <div ref={host} />
}
