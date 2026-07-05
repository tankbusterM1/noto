import type { CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueLabel, gradeColor, gradeName } from '../lib/srs'
import { folderName, folderPath } from '../lib/tree'
import { words } from '../lib/format'
import { ago, addDays, fmtShort } from '../lib/dates'
import { MONO, SERIF, rise } from '../lib/ui'
import { NoteBlocks } from '../components/NoteBlocks'
import { TagLink } from '../components/TagLink'
import { ImageIcon, LinkIcon } from '../components/icons'

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
const tbtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: '6px 9px',
  borderRadius: 7,
  cursor: 'pointer',
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ink2)',
}

export function Editor() {
  const notes = useData((s) => s.notes)
  const folders = useData((s) => s.folders)
  const srs = useData((s) => s.srs)
  const appendBlock = useData((s) => s.appendBlock)
  const updateNote = useData((s) => s.updateNote)
  const addToReview = useData((s) => s.addToReview)
  const startSession = useData((s) => s.startSession)
  const noteId = useUI((s) => s.noteId)
  const openNote = useUI((s) => s.openNote)
  const setScreen = useUI((s) => s.setScreen)
  const showToast = useUI((s) => s.showToast)

  const note = notes.find((n) => n.id === noteId) ?? notes[0]
  const sr = srs[note.id]

  const exec = (cmd: string, arg?: string) => () => document.execCommand(cmd, false, arg)
  const append = (block: Parameters<typeof appendBlock>[1], msg: string) => () => {
    appendBlock(note.id, block)
    showToast(msg)
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

          {/* Sticky formatting toolbar */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 24,
              background: 'var(--sf)',
              border: '1px solid var(--ln)',
              borderRadius: 11,
              padding: 4,
              width: 'fit-content',
              position: 'sticky',
              top: 16,
              zIndex: 10,
              boxShadow: '0 4px 14px rgba(38,30,14,0.06)',
            }}
          >
            <button className="tbtn" style={tbtn} onClick={exec('formatBlock', 'h2')}>H1</button>
            <button className="tbtn" style={tbtn} onClick={exec('formatBlock', 'h3')}>H2</button>
            <div style={{ width: 1, background: 'var(--ln)', margin: '4px 3px' }} />
            <button className="tbtn" style={{ ...tbtn, color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '6px 10px' }} onClick={exec('bold')}>B</button>
            <button className="tbtn" style={{ ...tbtn, color: 'var(--ink)', fontFamily: SERIF, fontStyle: 'italic', fontSize: 13.5, fontWeight: 400, padding: '6px 10px' }} onClick={exec('italic')}>I</button>
            <button className="tbtn" style={{ ...tbtn, fontFamily: 'inherit', fontSize: 12, fontWeight: 400, padding: '6px 10px' }} onClick={exec('insertUnorderedList')}>• list</button>
            <button className="tbtn" title="Code block — any language" style={tbtn} onClick={append({ t: 'code', lang: 'python', text: '# new code block — click the language chip to switch\n' }, 'Code block added · any language')}>&lt;/&gt;</button>
            <button className="tbtn" title="Image block" style={{ ...tbtn, display: 'flex', alignItems: 'center', color: 'var(--ink2)' }} onClick={append({ t: 'img', text: 'caption…' }, 'Image block added at the end')}>
              <ImageIcon />
            </button>
            <button className="tbtn" title="Link card" style={{ ...tbtn, display: 'flex', alignItems: 'center', color: 'var(--ink2)' }} onClick={append({ t: 'link', text: 'New link — rename me', domain: 'example.com' }, 'Link card added at the end')}>
              <LinkIcon />
            </button>
            <button className="tbtn" style={{ ...tbtn, fontFamily: SERIF, fontSize: 14, fontWeight: 400 }} onClick={append({ t: 'q', text: 'A line worth keeping…' }, 'Quote added at the end')}>❝</button>
            <button className="tbtn" style={{ ...tbtn, fontFamily: 'inherit', fontSize: 12, fontWeight: 400, padding: '6px 10px' }} onClick={exec('insertHorizontalRule')}>—</button>
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
          <div style={{ display: 'flex', gap: 7, marginBottom: 26 }}>
            {note.tags.map((t) => (
              <TagLink key={t} tag={t} variant="amber" size={11} />
            ))}
          </div>

          <NoteBlocks note={note} />
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
            <Row k="Folder" v={folderName(folders, note.folderId)} />
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
