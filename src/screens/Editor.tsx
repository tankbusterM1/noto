import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueLabel, gradeColor, gradeName } from '../lib/srs'
import { recallNow } from '../lib/adaptive'
import { folderPath } from '../lib/tree'
import { words, noteFullText } from '../lib/format'
import { markdownToBlocks } from '../lib/markdown'
import { TEMPLATES } from '../lib/templates'
import { ago, addDays, fmtShort } from '../lib/dates'
import { MONO, SERIF, rise } from '../lib/ui'
import { MarkdownEditor, type EditorWeaveApi } from '../components/MarkdownEditor'
import { NoteBlocks } from '../components/NoteBlocks'
import { LocalLoom } from '../components/LocalLoom'
import { threadColor, unwovenMentions } from '../lib/loom'
import { TrashIcon, HistoryIcon } from '../components/icons'

const railLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}
const statLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}
export function Editor() {
  const notes = useData((s) => s.notes)
  const folders = useData((s) => s.folders)
  const srs = useData((s) => s.srs)
  const updateNote = useData((s) => s.updateNote)
  const moveNote = useData((s) => s.moveNote)
  const deleteNote = useData((s) => s.deleteNote)
  const noteAddTag = useData((s) => s.noteAddTag)
  const noteRemoveTag = useData((s) => s.noteRemoveTag)
  const addToReview = useData((s) => s.addToReview)
  const startSession = useData((s) => s.startSession)
  const noteId = useUI((s) => s.noteId)
  const openNote = useUI((s) => s.openNote)
  const setScreen = useUI((s) => s.setScreen)
  const setThread = useUI((s) => s.setThread)
  const showToast = useUI((s) => s.showToast)
  const trail = useUI((s) => s.trail)
  const clearTrail = useUI((s) => s.clearTrail)
  const noteMode = useUI((s) => s.noteMode)
  const setNoteReading = useUI((s) => s.setNoteReading)
  const openHistory = useUI((s) => s.openHistory)
  const editorEpoch = useUI((s) => s.editorEpoch)

  const [tagInput, setTagInput] = useState('')
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const note = notes.find((n) => n.id === noteId) ?? notes[0]
  const sr = srs[note.id]

  // Reading ⇄ edit mode, remembered PER NOTE (⌘E toggles). A note you leave in
  // reading mode opens in reading mode next time, until you flip it back.
  const reading = noteMode[note.id] ?? false
  const noteIdRef = useRef(note.id)
  noteIdRef.current = note.id
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

  // Load the title into the uncontrolled contentEditable ourselves (keyed on the
  // note) so React never owns its text node — otherwise a concurrent store write
  // (autosave, tag edit, move) could re-commit the old title over what you're
  // typing and reset the caret.
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Re-commit the title text on note switch AND on editorEpoch bumps (a draft
  // restore updates the store title + bumps the epoch) — otherwise restoring a
  // draft with a different title leaves the old title showing until note switch.
  useLayoutEffect(() => {
    if (titleRef.current) titleRef.current.innerText = note.title
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editorEpoch])

  // Disarm delete when switching notes — a delete armed on the previous note
  // must not make the first click on the new note's button delete it.
  useEffect(() => setArmed(false), [note.id])

  const armDelete = () => {
    if (armed) {
      deleteNote(note.id)
      return
    }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), 3000)
  }

  const related = notes
    .filter((n) => n.id !== note.id && n.tags.some((t) => note.tags.includes(t)))
    .slice(0, 3)

  // Backlinks — notes whose body mentions [[this note's title]].
  const backlinks = notes.filter(
    (n) => n.id !== note.id && noteFullText(n).includes('[[' + note.title.trim().toLowerCase() + ']]'),
  )

  // "Noto noticed" — other notes' titles sitting in this text, not yet linked.
  // One click weaves them via the live editor (edApi), so no save races.
  const edApi = useRef<EditorWeaveApi | null>(null)
  const unwoven = reading ? [] : unwovenMentions(note, notes).slice(0, 3)

  // Study templates: offered while the note is still empty. Applying one
  // remounts the editor (tplN in the key) so CodeMirror picks up the blocks.
  const isEmpty = note.blocks.length === 1 && note.blocks[0].t === 'p' && !(note.blocks[0].text ?? '').trim()
  const [tplN, setTplN] = useState(0)
  const applyTpl = (md: string) => {
    updateNote(note.id, { blocks: markdownToBlocks(md) })
    setTplN((x) => x + 1)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100%', animation: 'fadein 0.3s ease both' }}>
      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0, padding: '34px 48px 140px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink3)', marginBottom: 26 }}>
            <span className="crumb" onClick={() => setScreen('notes')} style={{ cursor: 'pointer', color: 'var(--ink2)', fontWeight: 500 }}>
              Notes
            </span>
            <span>/</span>
            <span>{folderPath(folders, note.folderId)}</span>
            <span style={{ flex: 1 }} />
            {/* reading ⇄ edit segmented toggle (⌘E) */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--sf2)', borderRadius: 7, padding: 2 }} title="Toggle reading mode · ⌘E">
              {(['edit', 'read'] as const).map((m) => {
                const active = (m === 'read') === reading
                return (
                  <span
                    key={m}
                    onClick={() => setNoteReading(note.id, m === 'read')}
                    style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 5, cursor: 'pointer', color: active ? 'var(--ink)' : 'var(--ink3)', background: active ? 'var(--sf)' : 'transparent', fontWeight: active ? 600 : 500, transition: 'all 0.15s ease' }}
                  >
                    {m === 'edit' ? '✎ edit' : '❧ read'}
                  </span>
                )
              })}
            </div>
            <span
              className="crumb"
              onClick={openHistory}
              title="Draft history — view & restore past versions"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 10, cursor: 'pointer', color: 'var(--ink3)', transition: 'color 0.15s ease' }}
            >
              <HistoryIcon size={12} />
              edited {ago(note.updated)}
            </span>
          </div>

          {/* Ink trail — the path of notes hopped through this session */}
          {trail.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', margin: '-16px 0 22px', animation: 'fadein 0.25s ease both' }}>
              <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>ink trail</span>
              {trail.map((id, i) => {
                const t = notes.find((n) => n.id === id)
                if (!t) return null
                const isCurrent = id === note.id
                return (
                  <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {i > 0 && <span style={{ color: 'var(--ink3)', fontSize: 9 }}>▸</span>}
                    <span
                      onClick={isCurrent ? undefined : () => openNote(id)}
                      style={{ fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: isCurrent ? 'var(--am)' : 'var(--ink3)', fontWeight: isCurrent ? 600 : undefined, cursor: isCurrent ? 'default' : 'pointer', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      className={isCurrent ? undefined : 'crumb'}
                    >
                      {t.title}
                    </span>
                  </span>
                )
              })}
              <span onClick={clearTrail} title="Clear trail" style={{ cursor: 'pointer', color: 'var(--ink3)', fontSize: 11, padding: '0 3px' }}>
                ×
              </span>
            </div>
          )}

          <h1
            key={`title-${note.id}`}
            ref={titleRef}
            contentEditable={!reading}
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => {
              const t = e.currentTarget.innerText.trim()
              if (t && t !== note.title) updateNote(note.id, { title: t })
              else if (!t) e.currentTarget.innerText = note.title // keep a title
            }}
            style={{ fontFamily: SERIF, fontSize: 37, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.15, margin: '0 0 8px', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 26, flexWrap: 'wrap', alignItems: 'center' }}>
            {note.tags.map((t) => (
              <span key={t} className="tag-lift" onClick={() => setThread(t)} title="Pull this thread" style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, fontSize: 11, color: 'var(--am)', cursor: 'pointer' }}>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: threadColor(t), marginRight: 2, flexShrink: 0 }} />
                #{t}
                <span className="tag-x" onClick={(e) => { e.stopPropagation(); noteRemoveTag(note.id, t) }} style={{ width: 14, height: 14, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                  ×
                </span>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  const t = noteAddTag(note.id, tagInput)
                  setTagInput('')
                  if (t) showToast('Tagged #' + t)
                }
              }}
              placeholder="+ tag"
              className="tag-add"
              style={{ border: '1px dashed var(--ln)', outline: 'none', background: 'transparent', fontFamily: MONO, fontSize: 11, color: 'var(--ink)', borderRadius: 999, padding: '3px 9px', width: 64 }}
            />
          </div>

          {reading ? (
            <NoteBlocks key={`read-${note.id}`} note={note} readOnly full />
          ) : (
            <>
              {isEmpty && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16, animation: 'fadein 0.3s ease both' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>start from</span>
                  {TEMPLATES.map((t) => (
                    <span
                      key={t.name}
                      className="suggest"
                      onClick={() => applyTpl(t.md)}
                      title={t.hint}
                      style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink2)', border: '1px dashed var(--ln)', borderRadius: 999, padding: '4px 11px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    >
                      ◇ {t.name}
                    </span>
                  ))}
                </div>
              )}
              <MarkdownEditor key={`body-${note.id}-${tplN}-${editorEpoch}`} note={note} apiRef={edApi} />
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 20, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                markdown · right-click to format · [[link]] · ⌘B/⌘I · ⌘E read · ⌘S save · paste an image
              </div>
            </>
          )}
        </div>
      </div>

      {/* Memory rail */}
      <div style={{ width: 290, flexShrink: 0, borderLeft: '1px solid var(--ln)', padding: '30px 22px 120px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div style={{ ...railLabel, marginBottom: 12 }}>Memory</div>
          {sr ? (
            <>
              <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, background: 'var(--am)', transform: 'rotate(45deg)' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>In review</span>
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, marginTop: 12, lineHeight: 1 }}>
                  {sr.due <= 0 ? 'due now' : dueLabel(sr.due).replace('in ', '')}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 5 }}>
                  next review · {fmtShort(addDays(Math.max(0, sr.due)))}
                </div>
                {(() => {
                  const recall = recallNow(sr)
                  if (recall === null || sr.stab === undefined) return null
                  const strength = sr.stab >= 1 ? Math.round(sr.stab) + 'd' : '<1d'
                  return (
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 3 }} title="FSRS memory model — recall probability now · stability">
                      recall now ~{Math.round(recall * 100)}% · memory {strength}
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--ln)' }}>
                  <div>
                    <div style={statLabel}>interval</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{sr.ivl}d</div>
                  </div>
                  <div>
                    <div style={statLabel}>ease</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{sr.ease.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={statLabel}>reviews</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{sr.hist.length}</div>
                  </div>
                </div>
                {sr.due <= 0 && (
                  <button
                    className="btn-accent"
                    onClick={() => startSession([note.id])}
                    style={{ width: '100%', marginTop: 14, background: 'var(--ac)', color: 'var(--acI)', border: 'none', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Review this note now
                  </button>
                )}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ ...railLabel, marginBottom: 10 }}>Review history</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {sr.hist
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--ln)', ...rise(i, 0.35) }}>
                        <div style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, background: gradeColor(h.g) }} />
                        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ink2)', width: 48 }}>{fmtShort(addDays(h.d))}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: gradeColor(h.g) }}>{gradeName(h.g)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>→ {h.ivl}d</span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--sf)', border: '1px dashed var(--ink3)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Not in review</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 5 }}>
                Add this note to the spaced-repetition queue and Noto will resurface it before you forget it.
              </div>
              <button
                className="btn-dark"
                onClick={() => addToReview(note.id)}
                style={{ width: '100%', marginTop: 13, background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ◈ Add to review
              </button>
            </div>
          )}
        </div>

        {/* Local loom — this note's corner of the knowledge web */}
        <LocalLoom note={note} notes={notes} srs={srs} />

        {/* Details + marginalia */}
        <div>
          <div style={{ ...railLabel, marginBottom: 10 }}>Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ink3)' }}>Folder</span>
              <select
                value={note.folderId}
                onChange={(e) => moveNote(note.id, e.target.value)}
                title="Move to folder"
                style={{ border: '1px solid var(--ln)', background: 'var(--sf)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, borderRadius: 7, padding: '3px 6px', maxWidth: 165, cursor: 'pointer', outline: 'none' }}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(folders, f.id)}
                  </option>
                ))}
              </select>
            </div>
            <Row k="Created" v={fmtShort(addDays(note.created))} />
            <Row k="Words" v={String(words(note))} />
            <div style={{ height: 1, background: 'var(--ln)', margin: '8px 0 4px' }} />
            <div style={railLabel}>Marginalia · touches</div>
            {related.map((n) => (
              <div
                key={n.id}
                className="nudge"
                onClick={() => openNote(n.id)}
                style={{ border: '1px solid var(--ln)', background: 'var(--sf)', borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}
              >
                <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{n.title}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--am)', marginTop: 3 }}>
                  via {n.tags.filter((t) => note.tags.includes(t)).map((t) => '#' + t).join(' ')}
                </div>
              </div>
            ))}
            {related.length === 0 && (
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink3)' }}>
                No siblings yet — tag this note to weave it in.
              </div>
            )}
            {unwoven.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--ln)', margin: '8px 0 4px' }} />
                <div style={railLabel}>Noto noticed · unwoven</div>
                {unwoven.map((n) => (
                  <div key={n.id} style={{ border: '1px dashed var(--ln)', borderRadius: 11, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{n.title}</div>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--ink3)', marginTop: 2 }}>mentioned in this text</div>
                    </div>
                    <button
                      className="border-hover"
                      onClick={() => {
                        const ok = edApi.current?.weaveTitle(n.title)
                        showToast(ok ? `Woven [[${n.title}]] ✓` : 'Mention not found in the current text')
                      }}
                      style={{ border: '1px solid var(--ln)', background: 'transparent', color: 'var(--ac)', borderRadius: 7, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}
                    >
                      weave →
                    </button>
                  </div>
                ))}
              </>
            )}
            {backlinks.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--ln)', margin: '8px 0 4px' }} />
                <div style={railLabel}>Linked mentions · {backlinks.length}</div>
                {backlinks.slice(0, 4).map((n) => (
                  <div
                    key={n.id}
                    className="nudge"
                    onClick={() => openNote(n.id)}
                    style={{ border: '1px solid var(--ln)', background: 'var(--sf)', borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}
                  >
                    <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ac)', marginTop: 3 }}>[[links here]]</div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--ln)', margin: '18px 0 12px' }} />
          <button
            onClick={armDelete}
            className="del-btn"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: `1px solid ${armed ? 'var(--g1)' : 'var(--ln)'}`, background: 'transparent', color: armed ? 'var(--g1)' : 'var(--ink2)', borderRadius: 9, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <TrashIcon size={12} />
            {armed ? 'Click again to delete' : 'Delete note'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--ink3)' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  )
}
