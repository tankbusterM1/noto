import { useMemo, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { parseBatch, BYTE_TOPICS, type ByteCard } from '../lib/bytes'
import { storyCount } from '../lib/bytesStory'
import { MONO } from '../lib/ui'

/*
 * The Bytes deck — desktop authoring for the iOS learning reel. Write one card,
 * or paste a batch and let it parse; everything lands in the vault and syncs to
 * the phone, where the reader serves it and a Kept card becomes a note.
 */
export function Bytes() {
  const bytes = useData((s) => s.bytes)
  const addByte = useData((s) => s.addByte)
  const addByteBatch = useData((s) => s.addByteBatch)
  const deleteByte = useData((s) => s.deleteByte)
  const loadStarterPack = useData((s) => s.loadStarterPack)

  const [topic, setTopic] = useState<string>('ml')
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [code, setCode] = useState('')
  const [story, setStory] = useState('')
  const [level, setLevel] = useState(1)
  const [batch, setBatch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)

  const topics = useMemo(() => [...new Set(bytes.map((c) => c.topic))].sort(), [bytes])

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2200)
  }

  const parsed = useMemo(() => (batch.trim() ? parseBatch(batch, 'foundations', Date.now()) : []), [batch])

  const canAdd = title.trim().length > 0

  const submitOne = async () => {
    if (!canAdd) return
    await addByte({ pack: 'foundations', topic, level, title: title.trim(), blurb: blurb.trim(), code: code.trim() || undefined, lang: code.trim() ? topic : undefined, detail: story.trim() || undefined })
    setTitle('')
    setBlurb('')
    setCode('')
    setStory('')
    flash('Added 1 · syncs on next push')
  }

  const pushBatch = async () => {
    if (!parsed.length) return
    const n = await addByteBatch(parsed)
    setBatch('')
    flash(`Pushed ${n} · syncs on next push`)
  }

  const starter = async () => {
    const n = await loadStarterPack()
    flash(n ? `Loaded ${n} starter cards` : 'Starter pack already loaded')
  }

  // Group for the list (filtered by the active tag).
  const byTopic = useMemo(() => {
    const shown = filter ? bytes.filter((c) => c.topic === filter) : bytes
    const m = new Map<string, ByteCard[]>()
    for (const c of shown) {
      const a = m.get(c.topic)
      if (a) a.push(c)
      else m.set(c.topic, [c])
    }
    return [...m.entries()]
  }, [bytes, filter])

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '34px 40px 80px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={kicker}>BITE-SIZED LEARNING · SYNCS TO iOS</div>
            <h1 style={h1}>Bytes deck</h1>
            <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 4 }}>
              Write cards here; the phone serves them, and the ones you Keep become notes in review.
            </div>
          </div>
          <button style={ghostBtn} onClick={starter}>
            Load starter pack
          </button>
        </div>

        {/* compose */}
        <div style={grid2}>
          {/* write one */}
          <div style={panel}>
            <div style={panelK}>Write one</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} style={{ ...field, flex: '0 0 116px', fontFamily: MONO, fontSize: 12 }}>
                {BYTE_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))} style={{ ...field, flex: '0 0 90px', fontFamily: MONO, fontSize: 12 }}>
                <option value={1}>level 1</option>
                <option value={2}>level 2</option>
                <option value={3}>level 3</option>
              </select>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Concept — the one idea" style={{ ...field, fontFamily: 'var(--serif, Georgia), serif', fontSize: 15, marginBottom: 9 }} />
            <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="A sentence or two of intuition…" rows={3} style={{ ...field, fontFamily: 'var(--serif, Georgia), serif', resize: 'vertical', marginBottom: 9 }} />
            <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="code? (≤5 lines, optional)" rows={3} style={{ ...field, fontFamily: MONO, fontSize: 12, resize: 'vertical', marginBottom: 9 }} />
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder={'The story? (optional — swipe-through depth)\nEach ALL-CAPS line = a new slide:\nWHY IT MATTERS\n…\nTHE MODEL\n…'}
              rows={4}
              style={{ ...field, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.55, resize: 'vertical', marginBottom: 6 }}
            />
            {story.trim() ? (
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--am)', marginBottom: 10 }}>
                ◆ {storyCount({ detail: story })} slide{storyCount({ detail: story }) === 1 ? '' : 's'}
              </div>
            ) : (
              <div style={{ marginBottom: 10 }} />
            )}
            <button style={{ ...primaryBtn, ...(canAdd ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }} disabled={!canAdd} onClick={submitOne}>
              ◆ Add to deck
            </button>
          </div>

          {/* paste batch */}
          <div style={panel}>
            <div style={panelK}>Paste a batch</div>
            <textarea
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder={'## sql · joins :: LEFT JOIN keeps every left row\nUnmatched right side is NULL.\n```sql\nSELECT …\n```\n---\n## python · traps :: The mutable-default trap\nA default list is made once…'}
              rows={9}
              style={{ ...field, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, resize: 'vertical', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={{ ...primaryBtn, ...(parsed.length ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }} disabled={!parsed.length} onClick={pushBatch}>
                ◆ Push {parsed.length || ''} to deck
              </button>
              <span style={{ fontFamily: MONO, fontSize: 11, color: parsed.length ? 'var(--g, #4a7350)' : 'var(--ink3)' }}>
                {parsed.length ? `parsed ${parsed.length} · ${[...new Set(parsed.map((c) => c.topic))].join(', ')}` : 'nothing parsed yet'}
              </span>
            </div>
          </div>
        </div>

        {/* the deck */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 34, marginBottom: 10 }}>
          <div style={panelK}>The deck</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)' }}>{bytes.length} cards</div>
        </div>
        {topics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
            <button style={chip(filter === null)} onClick={() => setFilter(null)}>
              all
            </button>
            {topics.map((tp) => (
              <button key={tp} style={chip(filter === tp)} onClick={() => setFilter(filter === tp ? null : tp)}>
                {tp} · {bytes.filter((c) => c.topic === tp).length}
              </button>
            ))}
          </div>
        )}
        {bytes.length === 0 ? (
          <div style={{ fontFamily: 'var(--serif, Georgia), serif', fontStyle: 'italic', color: 'var(--ink3)', padding: '18px 2px' }}>
            Empty. Write a card above, or load the starter pack.
          </div>
        ) : (
          byTopic.map(([t, cards]) => (
            <div key={t} style={{ marginTop: 18 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--am)', marginBottom: 8 }}>
                {t} · {cards.length}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {cards.map((c) => (
                  <div key={c.id} style={cardRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--serif, Georgia), serif', fontSize: 15, color: 'var(--ink)' }}>{c.title}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.blurb}</div>
                      {c.code ? <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ink3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.code.split('\n')[0]}</div> : null}
                    </div>
                    {c.detail ? <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--am)', flexShrink: 0 }} title={`${storyCount(c)}-slide story`}>▤ {storyCount(c)}</span> : null}
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', flexShrink: 0 }}>L{c.level}</span>
                    <button style={delBtn} title="Delete card" onClick={() => void deleteByte(c.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {toast ? <div style={toastStyle}>{toast}</div> : null}
      </div>
    </div>
  )
}

const wrap: CSSProperties = { height: '100%', overflowY: 'auto', background: 'var(--bg)' }
const kicker: CSSProperties = { fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--ink3)' }
const h1: CSSProperties = { fontFamily: 'var(--serif, Georgia), serif', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: '6px 0 0', letterSpacing: '-0.01em' }
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 26 }
const panel: CSSProperties = { background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, padding: '18px 18px' }
const panelK: CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 12 }
const field: CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--ln)', background: 'var(--sf2)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
const primaryBtn: CSSProperties = { background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const ghostBtn: CSSProperties = { background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--ln)', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }
const cardRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 11, padding: '11px 13px' }
const delBtn: CSSProperties = { background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 4 }
const toastStyle: CSSProperties = { position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--bg)', padding: '9px 16px', borderRadius: 999, fontSize: 12.5, fontFamily: MONO, boxShadow: '0 12px 30px rgba(24,19,10,0.28)', zIndex: 50 }
const chip = (active: boolean): CSSProperties => ({
  fontFamily: MONO,
  fontSize: 11,
  padding: '5px 11px',
  borderRadius: 999,
  cursor: 'pointer',
  border: '1px solid ' + (active ? 'var(--am)' : 'var(--ln)'),
  background: active ? 'var(--am)' : 'transparent',
  color: active ? 'var(--bg)' : 'var(--ink2)',
})
