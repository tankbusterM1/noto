import { useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { fmtMins } from '../lib/format'
import { MONO, SERIF } from '../lib/ui'
import { PlayTriangle, ArticleIcon, PaperIcon, ExternalArrow, CloseIcon, TrashIcon } from './icons'

const drawerLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}

/** Right-sliding detail drawer for a watch-later item. */
export function WatchDrawer() {
  const watch = useData((s) => s.watch)
  const watchPatch = useData((s) => s.watchPatch)
  const watchDelete = useData((s) => s.watchDelete)
  const watchAddTag = useData((s) => s.watchAddTag)
  const watchRemoveTag = useData((s) => s.watchRemoveTag)
  const tagsPool = useData((s) => s.tagsPool)
  const wOpenId = useUI((s) => s.wOpenId)
  const closeWatch = useUI((s) => s.closeWatch)
  const setThread = useUI((s) => s.setThread)
  const showToast = useUI((s) => s.showToast)
  const [tagInput, setTagInput] = useState('')

  const dw = watch.find((w) => w.id === wOpenId)
  if (!dw) return null

  const suggested = tagsPool.filter((t) => !dw.tags.includes(t)).slice(0, 4)

  return (
    <>
      <div onClick={closeWatch} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(24,19,10,0.38)', animation: 'fadein 0.25s ease both' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 131, background: 'var(--bg)', borderLeft: '1px solid var(--ln)', boxShadow: '-24px 0 60px rgba(24,19,10,0.18)', display: 'flex', flexDirection: 'column', animation: 'drawerin 0.35s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        {/* thumb */}
        <div style={{ height: 150, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(250,248,240,0.95)', flexShrink: 0, background: `linear-gradient(135deg, hsl(${dw.hue},30%,62%), hsl(${dw.hue + 34},32%,42%))` }}>
          {dw.thumb && (
            <img src={dw.thumb} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {dw.kind === 'video' && (
            <div style={{ width: 46, height: 46, borderRadius: 99, background: 'rgba(20,16,8,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <PlayTriangle size={16} style={{ marginLeft: 2 }} />
            </div>
          )}
          {dw.kind === 'article' && !dw.thumb && <ArticleIcon size={28} />}
          {dw.kind === 'paper' && !dw.thumb && <PaperIcon size={28} />}
          <div className="thumb-close" onClick={closeWatch} style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 99, background: 'rgba(20,16,8,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 30px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
            {dw.kind} · {dw.source} · {dw.mins ? fmtMins(dw.mins) : '—'} · added {dw.added}
          </div>
          <h2
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={(e) => watchPatch(dw.id, { title: e.currentTarget.innerText })}
            style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 500, lineHeight: 1.25, margin: '8px 0 0', outline: 'none' }}
          >
            {dw.title}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 9, padding: '7px 11px' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dw.url}</span>
            <ExternalArrow size={11} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={() => {
                const wasDone = dw.done
                watchPatch(dw.id, { done: !wasDone })
                showToast(wasDone ? 'Back in the queue' : 'Marked watched — nice')
              }}
              className="press"
              style={{ flex: 1, border: '1px solid var(--g4)', background: dw.done ? 'var(--g4)' : 'transparent', color: dw.done ? '#F7F5EE' : 'var(--g4)', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}
            >
              {dw.done ? '✓ Watched' : 'Mark watched'}
            </button>
            <button
              className="del-btn"
              title="Remove from queue"
              onClick={() => {
                watchDelete(dw.id)
                closeWatch()
                showToast('Removed from queue')
              }}
              style={{ width: 42, border: '1px solid var(--ln)', background: 'transparent', color: 'var(--ink2)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <TrashIcon />
            </button>
          </div>

          <div style={{ height: 1, background: 'var(--ln)', margin: '18px 0 14px' }} />
          <div style={{ ...drawerLabel, marginBottom: 9 }}>Tags</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {dw.tags.map((t) => (
              <span key={t} className="tag-lift" onClick={() => setThread(t)} title="Pull this thread" style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 11, color: 'var(--am)', background: 'var(--sf2)', borderRadius: 999, padding: '5px 7px 5px 11px', animation: 'chipin 0.2s ease both', cursor: 'pointer' }}>
                #{t}
                <span className="tag-x" onClick={(e) => { e.stopPropagation(); watchRemoveTag(dw.id, t) }} style={{ width: 15, height: 15, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>
                  ×
                </span>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  const t = watchAddTag(dw.id, tagInput)
                  setTagInput('')
                  if (t) showToast('Tagged #' + t + ' · linked')
                }
              }}
              placeholder="+ tag ↵"
              style={{ border: '1px dashed var(--ln)', outline: 'none', background: 'transparent', fontFamily: MONO, fontSize: 11, color: 'var(--ink)', borderRadius: 999, padding: '5px 11px', width: 76 }}
            />
          </div>
          {suggested.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9, alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)' }}>suggested:</span>
              {suggested.map((t) => (
                <span key={t} className="suggest" onClick={() => { watchAddTag(dw.id, t); showToast('Tagged #' + t) }} style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', border: '1px dashed var(--ln)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--ln)', margin: '18px 0 14px' }} />
          <div style={{ ...drawerLabel, marginBottom: 9 }}>My notes</div>
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => { watchPatch(dw.id, { note: e.currentTarget.innerText }); showToast('Note saved') }}
            data-ph="Why did you save this? What should future-you look for…"
            style={{ minHeight: 110, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 13, padding: '13px 15px', fontSize: 13.5, lineHeight: 1.65, outline: 'none' }}
          >
            {dw.note}
          </div>
        </div>
      </div>
    </>
  )
}
