import { useRef, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueLabel, gradeColor, gradeName } from '../lib/srs'
import { folderPath } from '../lib/tree'
import { words } from '../lib/format'
import { ago, addDays, fmtShort } from '../lib/dates'
import { MONO, SERIF, rise } from '../lib/ui'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { TrashIcon } from '../components/icons'

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

  const [tagInput, setTagInput] = useState('')
  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const note = notes.find((n) => n.id === noteId) ?? notes[0]
  const sr = srs[note.id]

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
            <span style={{ fontFamily: MONO, fontSize: 10 }}>edited {ago(note.updated)}</span>
          </div>

          <h1
            key={note.id}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => updateNote(note.id, { title: e.currentTarget.innerText })}
            style={{ fontFamily: SERIF, fontSize: 37, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.15, margin: '0 0 8px', outline: 'none' }}
          >
            {note.title}
          </h1>
          <div style={{ display: 'flex', gap: 6, marginBottom: 26, flexWrap: 'wrap', alignItems: 'center' }}>
            {note.tags.map((t) => (
              <span key={t} className="tag-lift" onClick={() => setThread(t)} title="Pull this thread" style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: MONO, fontSize: 11, color: 'var(--am)', cursor: 'pointer' }}>
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
              style={{ border: '1px dashed var(--ln)', outline: 'none', background: 'transparent', fontFamily: MONO, fontSize: 11, color: 'var(--ink)', borderRadius: 999, padding: '3px 9px', width: 64 }}
            />
          </div>

          <MarkdownEditor key={note.id} note={note} />
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 20, letterSpacing: '0.04em' }}>
            markdown · # heading · - list · &gt; quote · ``` code · paste or drop an image
          </div>
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
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{sr.due <= 0 ? 'In review — due now' : 'In review'}</span>
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, marginTop: 12, lineHeight: 1 }}>
                  {sr.due <= 0 ? 'due now' : dueLabel(sr.due).replace('in ', '')}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 5 }}>
                  next review · {fmtShort(addDays(Math.max(0, sr.due)))}
                </div>
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
