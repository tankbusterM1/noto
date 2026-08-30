import { useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI, type WatchFilter } from '../store/ui'
import { fmtMins, domainOf } from '../lib/format'
import { MONO, SERIF, kicker, clamp, rise } from '../lib/ui'
import { Checkbox } from '../components/Checkbox'
import { TagLink } from '../components/TagLink'
import { EmptyState } from '../components/EmptyState'
import { LinkIcon, PlayTriangle, ArticleIcon, PaperIcon, WatchIcon } from '../components/icons'
import type { Watch as WatchItem } from '../lib/types'

const KINDS: WatchFilter[] = ['All', 'Video', 'Article', 'Paper']

export function Watch() {
  const watch = useData((s) => s.watch)
  const tagsPool = useData((s) => s.tagsPool)
  const watchAdd = useData((s) => s.watchAdd)
  const showToast = useUI((s) => s.showToast)
  const wFilter = useUI((s) => s.wFilter)
  const wTagF = useUI((s) => s.wTagF)
  const setWFilter = useUI((s) => s.setWFilter)
  const setWTagF = useUI((s) => s.setWTagF)
  const [url, setUrl] = useState('')
  const [shake, setShake] = useState(false)

  const queued = watch.filter((w) => !w.done && !w.loading)
  const finished = watch.filter((w) => w.done).length
  const stats = `${queued.length} queued · ${fmtMins(queued.reduce((a, w) => a + (w.mins || 0), 0))} of material · ${finished} finished`

  const filtered = watch.filter(
    (w) =>
      (wFilter === 'All' || w.kind === wFilter.toLowerCase()) &&
      (wTagF === 'All' || w.tags.includes(wTagF)),
  )

  const save = () => {
    if (!url.trim()) {
      // Nothing to save: shake the field rather than silently doing nothing.
      setShake(true)
      setTimeout(() => setShake(false), 480)
      showToast('Paste a link first')
      return
    }
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
    // Amber means "due now" and nothing else — a selected tag is ink.
    border: '1px ' + (active ? 'solid var(--ink)' : 'dashed var(--ln)'),
    background: active ? 'var(--ink)' : undefined,
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
          <div
            className={shake ? 'shake' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--sf)',
              border: `1px solid ${shake ? 'var(--g1)' : 'var(--ln)'}`,
              borderRadius: 9,
              padding: '9px 13px',
              width: 320,
              transition: 'border-color var(--t-fast) var(--t-ease)',
            }}
          >
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

      {/* The shelf */}
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 16 }}>
        On the shelf
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px 16px' }}>
        {filtered.map((w, i) => (
          <div key={w.id} className="slip-case" style={rise(i)}>
            {w.loading ? <DotLoader /> : <WatchCard item={w} />}
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <EmptyState
          icon={<WatchIcon size={22} />}
          title={watch.length === 0 ? 'Nothing saved for later — yet.' : 'Nothing matches this filter.'}
          hint={watch.length === 0 ? 'paste a link above · Noto fetches the title & thumbnail' : 'try another kind, or all tags'}
        />
      )}
    </div>
  )
}

/**
 * The 4x4 dot-matrix loader — what a link looks like while it is being read.
 * Staggered by row + column so the pulse crosses the grid diagonally.
 */
function DotLoader() {
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, padding: '34px 0 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 6px)', gap: 7 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              background: 'var(--ink2)',
              animation: 'dot-pulse 1.6s var(--t-soft) infinite',
              animationDelay: `${((i % 4) + Math.floor(i / 4)) * 110}ms`,
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
        reading the link
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
      style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 13, overflow: 'hidden', cursor: 'pointer', opacity: w.done ? 0.55 : 1 }}
    >
      {/*
        The case face: ruled paper stock, with the spine stripe down its left
        edge. A real scraped thumbnail covers it when there is one; the colour
        rules rule out the old hue gradient either way.
      */}
      <div
        style={{
          height: 112,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink3)',
          borderBottom: '1px solid var(--ln)',
          background:
            'repeating-linear-gradient(115deg, var(--sf2), var(--sf2) 7px, var(--sf) 7px, var(--sf) 14px)',
        }}
      >
        {w.thumb && (
          <img src={w.thumb} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: 'var(--ink2)', opacity: 0.16 }} />
        <span style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: 'var(--ln)' }} />
        {!w.thumb && w.kind === 'video' && <PlayTriangle size={18} />}
        {!w.thumb && w.kind === 'article' && <ArticleIcon size={20} />}
        {!w.thumb && w.kind === 'paper' && <PaperIcon size={20} />}
        <span style={{ position: 'absolute', left: 14, bottom: 9, fontFamily: MONO, fontSize: 9, color: 'var(--ink3)' }}>{domainOf(w.url)}</span>
        <span style={{ position: 'absolute', right: 10, bottom: 9, fontFamily: MONO, fontSize: 9, color: 'var(--ink3)' }}>{w.mins ? fmtMins(w.mins) : '—'}</span>
      </div>
      <div style={{ padding: '13px 16px 14px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, transition: 'color 0.35s ease', color: w.done ? 'var(--ink2)' : undefined, ...clamp(2) }}>{w.title}</div>
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
