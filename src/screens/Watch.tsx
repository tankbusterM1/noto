import { useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI, type WatchFilter } from '../store/ui'
import { fmtMins, domainOf } from '../lib/format'
import { MONO, SERIF, kicker, clamp, rise } from '../lib/ui'
import { Checkbox } from '../components/Checkbox'
import { TagLink } from '../components/TagLink'
import { LinkIcon, PlayTriangle, ArticleIcon, PaperIcon } from '../components/icons'
import type { Watch as WatchItem } from '../lib/types'

const shimmer =
  'linear-gradient(90deg, var(--sf2) 25%, var(--sf) 37%, var(--sf2) 63%)'
const KINDS: WatchFilter[] = ['All', 'Video', 'Article', 'Paper']

export function Watch() {
  const watch = useData((s) => s.watch)
  const tagsPool = useData((s) => s.tagsPool)
  const watchAdd = useData((s) => s.watchAdd)
  const wFilter = useUI((s) => s.wFilter)
  const wTagF = useUI((s) => s.wTagF)
  const setWFilter = useUI((s) => s.setWFilter)
  const setWTagF = useUI((s) => s.setWTagF)
  const [url, setUrl] = useState('')

  const queued = watch.filter((w) => !w.done && !w.loading)
  const finished = watch.filter((w) => w.done).length
  const stats = `${queued.length} queued · ${fmtMins(queued.reduce((a, w) => a + (w.mins || 0), 0))} of material · ${finished} finished`

  const filtered = watch.filter(
    (w) =>
      (wFilter === 'All' || w.kind === wFilter.toLowerCase()) &&
      (wTagF === 'All' || w.tags.includes(wTagF)),
  )

  const save = () => {
    watchAdd(url)
    setUrl('')
  }

  const kindChip = (k: WatchFilter): CSSProperties => ({
    fontSize: 12,
    fontWeight: 500,
    color: wFilter === k ? 'var(--bg)' : 'var(--ink2)',
    border: '1px solid ' + (wFilter === k ? 'var(--ink)' : 'var(--ln)'),
    background: wFilter === k ? 'var(--ink)' : undefined,
    borderRadius: 999,
    padding: '6px 13px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })
  const tagChip = (active: boolean): CSSProperties => ({
    fontFamily: MONO,
    fontSize: 11,
    color: active ? 'var(--bg)' : 'var(--ink2)',
    border: '1px ' + (active ? 'solid var(--am)' : 'dashed var(--ln)'),
    background: active ? 'var(--am)' : undefined,
    borderRadius: 999,
    padding: '5px 12px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={kicker}>{stats}</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Watch Later</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 11, padding: '9px 13px', width: 320 }}>
            <LinkIcon size={13} style={{ color: 'var(--ink3)' }} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              placeholder="Paste a YouTube / article / paper link…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
            />
          </div>
          <button className="btn-dark" onClick={save} style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 11, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <div key={k} className="border-hover" onClick={() => setWFilter(k)} style={kindChip(k)}>{k}</div>
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--ln)', margin: '0 6px' }} />
        {['All', ...tagsPool].map((t) => (
          <div key={t} className="border-hover" onClick={() => setWTagF(t)} style={tagChip(wTagF === t)}>
            {t === 'All' ? 'all tags' : '#' + t}
          </div>
        ))}
      </div>

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 15 }}>
        {filtered.map((w, i) => (
          <div key={w.id} style={rise(i)}>
            {w.loading ? <Skeleton /> : <WatchCard item={w} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Skeleton() {
  const bar: CSSProperties = { background: shimmer, backgroundSize: '520px 100%', animation: 'shimmer 1.2s linear infinite' }
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ height: 110, ...bar }} />
      <div style={{ padding: '14px 16px' }}>
        <div style={{ height: 13, width: '80%', borderRadius: 6, ...bar }} />
        <div style={{ height: 10, width: '45%', borderRadius: 6, marginTop: 9, ...bar }} />
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 11 }}>scraping title · thumbnail · duration…</div>
      </div>
    </div>
  )
}

function WatchCard({ item: w }: { item: WatchItem }) {
  const watchToggle = useData((s) => s.watchToggle)
  const openWatchItem = useUI((s) => s.openWatchItem)

  return (
    <div
      className="lift-2"
      onClick={() => openWatchItem(w.id)}
      style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', opacity: w.done ? 0.55 : 1 }}
    >
      <div style={{ height: 110, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(250,248,240,0.95)', background: `linear-gradient(135deg, hsl(${w.hue},30%,62%), hsl(${w.hue + 34},32%,42%))` }}>
        {w.thumb && (
          <img src={w.thumb} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {w.kind === 'video' && (
          <div style={{ width: 38, height: 38, borderRadius: 99, background: 'rgba(20,16,8,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
            <PlayTriangle size={13} style={{ marginLeft: 2 }} />
          </div>
        )}
        {w.kind === 'article' && !w.thumb && <ArticleIcon size={22} />}
        {w.kind === 'paper' && !w.thumb && <PaperIcon size={22} />}
        <span style={{ position: 'absolute', left: 10, bottom: 9, fontFamily: MONO, fontSize: 9, background: 'rgba(20,16,8,0.4)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '3px 7px' }}>{domainOf(w.url)}</span>
        <span style={{ position: 'absolute', right: 10, bottom: 9, fontFamily: MONO, fontSize: 9, background: 'rgba(20,16,8,0.4)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '3px 7px' }}>{w.mins ? fmtMins(w.mins) : '—'}</span>
      </div>
      <div style={{ padding: '13px 16px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, transition: 'color 0.35s ease', color: w.done ? 'var(--ink2)' : undefined, ...clamp(2) }}>{w.title}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 5 }}>{w.source} · added {w.added}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, minHeight: 20 }}>
          {w.tags.map((t) => (
            <TagLink key={t} tag={t} variant="amber" size={9.5} />
          ))}
          <span style={{ flex: 1 }} />
          <Checkbox
            done={w.done}
            shape="round"
            size={20}
            borderColor="var(--ink3)"
            doneColor="var(--g4)"
            hoverBorder="var(--ink)"
            title="Mark watched"
            onClick={(e) => {
              e.stopPropagation()
              watchToggle(w.id)
            }}
          />
        </div>
      </div>
    </div>
  )
}
