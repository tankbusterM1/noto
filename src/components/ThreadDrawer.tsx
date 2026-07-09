import type { CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { folderPath } from '../lib/tree'
import { fmtMins } from '../lib/format'
import { MONO, SERIF } from '../lib/ui'
import { ThreadIcon, CloseIcon, PlayTriangle } from './icons'

const sectionLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}

/** The amber "stitched" timeline of everything carrying a tag. */
export function ThreadDrawer() {
  const notes = useData((s) => s.notes)
  const folders = useData((s) => s.folders)
  const watch = useData((s) => s.watch)
  const todos = useData((s) => s.todos)
  const week = useData((s) => s.week)
  const thread = useUI((s) => s.thread)
  const setThread = useUI((s) => s.setThread)
  const openNote = useUI((s) => s.openNote)
  const openWatchItem = useUI((s) => s.openWatchItem)
  const setScreen = useUI((s) => s.setScreen)
  const setTSeg = useUI((s) => s.setTSeg)

  if (thread === null) return null
  const close = () => setThread(null)

  const thNotes = notes.filter((n) => n.tags.includes(thread))
  const thWatch = watch.filter((w) => w.tags.includes(thread))
  const thTodos = [...todos, ...week].filter((x) => x.tag === thread)
  const stats = `${thNotes.length} ${thNotes.length === 1 ? 'note' : 'notes'} · ${thWatch.length} saved · ${thTodos.length} ${thTodos.length === 1 ? 'todo' : 'todos'}`

  const delay = (i: number): CSSProperties => ({ animation: 'rise 0.35s ease both', animationDelay: `${i * 0.05}s` })
  const stitch = <div style={{ position: 'absolute', left: -22.5, top: 17, width: 7, height: 7, background: 'var(--am)', transform: 'rotate(45deg)' }} />

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(24,19,10,0.38)', animation: 'fadein 0.25s ease both' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '92vw', zIndex: 141, background: 'var(--bg)', borderLeft: '1px solid var(--ln)', boxShadow: '-24px 0 60px rgba(24,19,10,0.18)', display: 'flex', flexDirection: 'column', animation: 'drawerin 0.35s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--ln)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <ThreadIcon style={{ color: 'var(--am)' }} />
            <span style={sectionLabel}>thread</span>
            <span style={{ flex: 1 }} />
            <div className="circle-btn" onClick={close} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid var(--ln)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>
              <CloseIcon size={10} />
            </div>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 31, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 8 }}>
            <span style={{ color: 'var(--am)' }}>#</span>{thread}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 5 }}>{stats} · one thread through everything</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 30px' }}>
          <div style={{ borderLeft: '1.5px dashed var(--am)', marginLeft: 7, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
            {thNotes.length > 0 && (
              <>
                <div style={{ ...sectionLabel, padding: '2px 0' }}>Notes</div>
                {thNotes.map((n, i) => (
                  <div key={n.id} className="nudge" onClick={() => { close(); openNote(n.id) }} style={{ position: 'relative', background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 12, padding: '11px 13px', cursor: 'pointer', ...delay(i) }}>
                    {stitch}
                    <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 3 }}>{folderPath(folders, n.folderId)}</div>
                  </div>
                ))}
              </>
            )}

            {thWatch.length > 0 && (
              <>
                <div style={{ ...sectionLabel, padding: '8px 0 2px' }}>Watch later</div>
                {thWatch.map((w, i) => (
                  <div key={w.id} className="nudge" onClick={() => { close(); openWatchItem(w.id) }} style={{ position: 'relative', display: 'flex', gap: 11, alignItems: 'center', background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 12, padding: '10px 13px', cursor: 'pointer', ...delay(thNotes.length + i) }}>
                    {stitch}
                    <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'rgba(250,248,240,0.95)', background: `linear-gradient(135deg, hsl(${w.hue},30%,62%), hsl(${w.hue + 34},32%,42%))` }}>
                      <PlayTriangle size={9} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', marginTop: 2 }}>{w.source} · {w.mins ? fmtMins(w.mins) : '—'}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {thTodos.length > 0 && (
              <>
                <div style={{ ...sectionLabel, padding: '8px 0 2px' }}>Todos</div>
                {thTodos.map((t, i) => {
                  const isWeek = 'day' in t
                  return (
                    <div key={t.id} className="nudge" onClick={() => { close(); setScreen('todos'); setTSeg(isWeek ? 'week' : 'today') }} style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 12, padding: '10px 13px', cursor: 'pointer', ...delay(thNotes.length + thWatch.length + i) }}>
                      {stitch}
                      <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="var(--ink3)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <rect x="2.5" y="2.5" width="13" height="13" rx="3.5" />
                        <polyline points="6,9.2 8.2,11.4 12.2,6.8" opacity={t.done ? 1 : 0} />
                      </svg>
                      <span style={{ fontSize: 12.5, lineHeight: 1.35, textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--ink3)' : undefined }}>{t.text}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', flexShrink: 0 }}>{isWeek ? 'this week' : 'today'}</span>
                    </div>
                  )
                })}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -22.5, top: 12, width: 8, height: 8, borderRadius: 99, border: '1.5px solid var(--am)', background: 'var(--bg)' }} />
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'var(--ink3)' }}>end of thread — tag more things to lengthen it</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
