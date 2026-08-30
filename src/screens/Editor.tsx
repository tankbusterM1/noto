import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { folderPath } from '../lib/tree'
import { markdownToBlocks } from '../lib/markdown'
import { TEMPLATES } from '../lib/templates'
import { ago } from '../lib/dates'
import { MarkdownEditor, type EditorWeaveApi } from '../components/MarkdownEditor'
import { NoteBlocks } from '../components/NoteBlocks'
import { MemoryRail } from '../components/MemoryRail'
import { unwovenMentions } from '../lib/loom'
import { HistoryIcon } from '../components/icons'
import s from './Editor.module.css'

/*
 * The note.
 *
 * Two flex SIBLINGS: the writing column and the memory rail. The rail is never
 * nested inside the column — nested, its width and flex-shrink do nothing and it
 * stacks underneath the note.
 *
 * The writing column carries 96px of left padding on purpose: the block gutter
 * hangs at left:-56px, and any less padding puts it outside the scroll clip.
 *
 * Three ways to hold a note (⌘E cycles read ⇄ blocks):
 *   blocks   — the block canvas, the redesign's editor
 *   markdown — the CodeMirror surface, which keeps [[weave]] autocomplete, the
 *              highlighter pens and fenced-code highlighting. Kept because the
 *              redesign adds the canvas without removing what was there.
 *   read     — the note, rendered
 */

type Mode = 'blocks' | 'markdown' | 'read'

export function Editor() {
  const notes = useData((d) => d.notes)
  const folders = useData((d) => d.folders)
  const srs = useData((d) => d.srs)
  const updateNote = useData((d) => d.updateNote)
  const deleteNote = useData((d) => d.deleteNote)
  const noteId = useUI((u) => u.noteId)
  const setScreen = useUI((u) => u.setScreen)
  const openHistory = useUI((u) => u.openHistory)
  const editorEpoch = useUI((u) => u.editorEpoch)
  const noteMode = useUI((u) => u.noteMode)
  const setNoteReading = useUI((u) => u.setNoteReading)

  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [mode, setMode] = useState<Mode>('blocks')

  // notes[0] is undefined on an empty vault (import/reset can empty it while
  // this screen is mounted), and every line below dereferences `note`.
  const note = notes.find((n) => n.id === noteId) ?? notes[0]
  const sr = note ? srs[note.id] : undefined

  // Reading mode is remembered per note (⌘E), as before.
  const reading = noteMode[note.id] ?? false
  const view: Mode = reading ? 'read' : mode

  const noteIdRef = useRef(note?.id ?? '')
  noteIdRef.current = note?.id ?? ''
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        const id = noteIdRef.current
        setNoteReading(id, !(useUI.getState().noteMode[id] ?? false))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setNoteReading])

  // The title is an uncontrolled contentEditable: React never owns its text
  // node, so a concurrent store write can't re-commit the old title over what
  // you're typing (or throw the caret to the start).
  const titleRef = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    if (titleRef.current && note) titleRef.current.innerText = note.title
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editorEpoch])

  // Delete disarms on note switch — an arm on the previous note must not make
  // the first click on this one destructive.
  useEffect(() => setArmed(false), [note?.id])

  const armDelete = () => {
    if (armed) {
      deleteNote(note.id)
      return
    }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), 3000)
  }

  const edApi = useRef<EditorWeaveApi | null>(null)
  const unwoven = !note || view === 'read' ? [] : unwovenMentions(note, notes).slice(0, 3)

  // Nothing to edit — the library is the right place to be.
  if (!note) return null

  // Study templates, offered while the note is still blank.
  const isEmpty = note.blocks.length === 1 && note.blocks[0].t === 'p' && !(note.blocks[0].text ?? '').trim()
  const [tplN, setTplN] = useState(0)
  const applyTpl = (md: string) => {
    updateNote(note.id, { blocks: markdownToBlocks(md) })
    setTplN((x) => x + 1)
  }

  return (
    <div className={s.row}>
      <div className={s.column}>
        <div className={s.measure}>
          {/* sticky breadcrumb */}
          <div className={s.crumbs}>
            <button type="button" className={s.crumb} onClick={() => setScreen('notes')}>
              ← {folderPath(folders, note.folderId)}
            </button>
            <span className={s.spacer} />
            <div className={s.modes}>
              {(['blocks', 'markdown', 'read'] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`${s.mode} ${view === m ? s.modeOn : ''}`}
                  onClick={() => {
                    if (m === 'read') setNoteReading(note.id, true)
                    else {
                      setNoteReading(note.id, false)
                      setMode(m)
                    }
                  }}
                >
                  {m === 'blocks' ? '▣ blocks' : m === 'markdown' ? '⌁ markdown' : '❧ read'}
                </button>
              ))}
            </div>
            <button type="button" className={s.edited} onClick={openHistory} title="Draft history">
              <HistoryIcon size={12} />
              edited {ago(note.updated)}
            </button>
          </div>

          {/* the notebook's margin rule */}
          <div className={s.marginRule} />

          <h1
            ref={titleRef}
            className={s.title}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => {
              const t = e.currentTarget.innerText.trim()
              if (t && t !== note.title) updateNote(note.id, { title: t })
            }}
          />

          {isEmpty && view !== 'read' && (
            <div className={s.templates}>
              <span className={s.tplLabel}>start from</span>
              {TEMPLATES.map((t) => (
                <button type="button" key={t.name} className={s.tpl} onClick={() => applyTpl(t.md)}>
                  ◇ {t.name}
                </button>
              ))}
            </div>
          )}

          <div className={s.body}>
            {view === 'read' ? (
              <NoteBlocks key={`read-${note.id}`} note={note} readOnly full />
            ) : view === 'markdown' ? (
              <MarkdownEditor key={`md-${note.id}-${tplN}-${editorEpoch}`} note={note} apiRef={edApi} />
            ) : (
              <NoteBlocks key={`canvas-${note.id}-${tplN}-${editorEpoch}`} note={note} />
            )}
          </div>
        </div>
      </div>

      <MemoryRail
        note={note}
        sr={sr}
        armed={armed}
        onArmDelete={armDelete}
        unwoven={unwoven.map((u) => ({ title: u.title, id: u.id }))}
        onWeave={(title) => edApi.current?.weaveTitle(title)}
      />
    </div>
  )
}
