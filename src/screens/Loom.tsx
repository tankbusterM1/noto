import { useMemo, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { inkOpacity, srsPill } from '../lib/srs'
import { outboundIds, threadColor } from '../lib/loom'
import { fuzzyScore } from '../lib/weave'
import { MONO, SERIF, kicker } from '../lib/ui'
import { EmptyState } from '../components/EmptyState'
import { LoomIcon } from '../components/icons'
import type { Note, SrsState } from '../lib/types'

/*
 * The Loom — an index of threads, set like the index of a fine book. No boxes,
 * no diagrams: hairline rules, serif entries, and each tag drawn as a real
 * thread — a gently sagging line with the tag's notes hanging on it as knots,
 * strung oldest → newest. Due knots burn amber. Unravel a row for its stitched
 * list; single-knot tags fold into one quiet line so the index stays short at
 * any vault size.
 */

const KNOT_CAP = 36
/** y along the sagging thread (matches the path M0,5 Q50,13.5 100,5). */
const sagY = (t: number) => 5 + 17 * t * (1 - t)

function Knot({ note, sr, inkFade, x, delay, color, onOpen }: { note: Note; sr?: SrsState; inkFade: boolean; x: number; delay: number; color: string; onOpen: () => void }) {
  const due = sr && sr.due <= 0
  const size = due ? 11 : 8
  // An 18px invisible hitbox around the small visual dot — beads are pretty,
  // but fingers and cursors need Fitts-friendly targets.
  return (
    <span
      className="knot"
      title={note.title + (due ? '  ·  due now' : sr ? '' : '  ·  not in review')}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      style={{
        position: 'absolute',
        left: `calc(${x}% - 9px)`,
        top: sagY(x / 100) + 10 - 9,
        width: 18,
        height: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: due ? 2 : 1,
      }}
    >
      <span
        className="knot-dot"
        style={{
          width: size,
          height: size,
          borderRadius: 99,
          background: due ? 'var(--am)' : color,
          opacity: due ? 1 : Math.max(0.45, inkOpacity(sr, inkFade)),
          border: '1.5px solid var(--bg)',
          boxShadow: due ? '0 0 0 3px rgba(184,122,38,0.18)' : undefined,
          animation: 'ringgrow 0.4s cubic-bezier(0.3,0.7,0.3,1) both',
          animationDelay: `${delay}s`,
          transition: 'transform 0.15s ease',
        }}
      />
    </span>
  )
}

export function Loom() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const inkFade = useUI((s) => s.inkFade)
  const openNote = useUI((s) => s.openNote)
  const setThread = useUI((s) => s.setThread)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const index = useMemo(() => {
    const adj = new Map<string, Set<string>>()
    const touch = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a)!.add(b)
    }
    let stitches = 0
    for (const n of notes) {
      for (const t of outboundIds(n, notes)) {
        if (!adj.get(n.id)?.has(t)) stitches++
        touch(n.id, t)
        touch(t, n.id)
      }
    }
    const byTag = new Map<string, Note[]>()
    for (const n of notes) for (const t of n.tags) (byTag.get(t) ?? byTag.set(t, []).get(t)!).push(n)
    const all = [...byTag.entries()].map(([tag, members]) => ({
      tag,
      members: members.slice().sort((a, b) => a.updated - b.updated),
      latest: Math.max(...members.map((m) => m.updated)),
      due: members.filter((m) => srs[m.id] && srs[m.id].due <= 0).length,
    }))
    const threads = all.filter((t) => t.members.length >= 2).sort((a, b) => b.latest - a.latest)
    const singles = all.filter((t) => t.members.length === 1).sort((a, b) => a.tag.localeCompare(b.tag))
    const loose = notes.filter((n) => n.tags.length === 0 && !adj.get(n.id)?.size)
    return { threads, singles, loose, stitches, adj }
  }, [notes, srs])

  const { threads, singles, loose, stitches, adj } = index
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])

  const query = q.trim().toLowerCase()
  const shown = query ? threads.filter((t) => t.tag.includes(query.replace(/^#/, ''))) : threads
  const shownSingles = query ? singles.filter((t) => t.tag.includes(query.replace(/^#/, ''))) : singles
  const noteHits = query && !query.startsWith('#')
    ? notes
        .map((n) => ({ n, s: fuzzyScore(query, n.title) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5)
    : []

  const linksOf = (n: Note): Note[] =>
    [...(adj.get(n.id) ?? [])].map((id) => byId.get(id)!).filter(Boolean).slice(0, 3)

  const micro: CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink3)' }

  if (notes.length === 0) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '44px 48px 120px' }}>
        <EmptyState icon={<LoomIcon size={22} />} title="The loom is empty — write a first note and the weaving begins." />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={kicker}>Knowledge · woven</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>The Loom</h1>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ink3)' }}>
          {notes.length} notes · {threads.length + singles.length} threads · {stitches} stitches
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '10px 0 26px', fontFamily: SERIF, fontStyle: 'italic' }}>
        An index of threads — unravel what you need, the rest stays folded.
      </div>

      {/* ── search, set like an index lookup ── */}
      <div className="index-search" style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--ln)', padding: '4px 2px 10px', marginBottom: 6, transition: 'border-color 0.2s ease' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--am)' }}>◎</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="find a thread, or a note by its initials…"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
        />
        {q && <span onClick={() => setQ('')} style={{ cursor: 'pointer', color: 'var(--ink3)', fontSize: 13, padding: '0 4px' }}>×</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 2px', marginBottom: 4 }}>
        <span style={micro}>threads · {shown.length}</span>
        <span style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--ink3)' }}>knots strung old → new · amber = due</span>
      </div>

      {/* ── direct note hits ── */}
      {noteHits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '6px 0 10px' }}>
          {noteHits.map(({ n }) => (
            <div key={n.id} className="tint" onClick={() => openNote(n.id)} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 10px', borderRadius: 9, cursor: 'pointer' }}>
              <span style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: 500, opacity: Math.max(0.5, inkOpacity(srs[n.id], inkFade)) }}>{n.title}</span>
              <span style={{ display: 'flex', gap: 7 }}>
                {n.tags.slice(0, 3).map((t) => (
                  <span key={t} style={{ fontFamily: MONO, fontSize: 9, color: threadColor(t) }}>#{t}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── the index ── */}
      <div>
        {shown.map(({ tag, members, due }, ti) => {
          const col = threadColor(tag)
          const isOpen = open === tag
          const knots = members.slice(-KNOT_CAP)
          const extra = members.length - knots.length
          return (
            <div key={tag} style={{ borderBottom: '1px solid var(--ln)', animation: 'rise 0.35s ease both', animationDelay: `${Math.min(ti * 0.045, 0.4)}s` }}>
              {/* entry row */}
              <div
                className="tint"
                onClick={() => setOpen(isOpen ? null : tag)}
                style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 10px', cursor: 'pointer', borderRadius: 10 }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, width: 168, flexShrink: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: col, fontWeight: 600 }}>#</span>
                  <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tag}
                  </span>
                </span>

                {/* the thread — a sagging line with knots hung on it */}
                <span style={{ position: 'relative', flex: 1, height: 26, minWidth: 80 }}>
                  <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: 26 }}>
                    <path d="M 0 15 Q 50 23.5 100 15" transform="translate(0 -0.5)" fill="none" stroke={col} strokeWidth={1.2} opacity={0.4} vectorEffect="non-scaling-stroke" />
                  </svg>
                  {knots.map((n, i) => {
                    const x = knots.length === 1 ? 90 : 3 + (i / (knots.length - 1)) * 94
                    return (
                      <Knot key={n.id} note={n} sr={srs[n.id]} inkFade={inkFade} x={x} color={col}
                        delay={Math.min(ti * 0.045, 0.4) + 0.15 + i * 0.03}
                        onOpen={() => openNote(n.id)} />
                    )
                  })}
                </span>

                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', flexShrink: 0, textAlign: 'right', minWidth: 86 }}>
                  {extra > 0 && <span>+{extra} · </span>}
                  {members.length} notes
                  {due > 0 && <span style={{ color: 'var(--am)', fontWeight: 600 }}> · {due} due</span>}
                </span>
                <span style={{ color: 'var(--ink3)', fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.3,0.7,0.3,1)', flexShrink: 0, width: 12, textAlign: 'center' }}>
                  ⌄
                </span>
              </div>

              {/* unraveled — the stitched list */}
              {isOpen && (
                <div style={{ padding: '2px 10px 18px 14px', animation: 'fadein 0.25s ease both' }}>
                  <div style={{ borderLeft: `1.5px dashed ${col}`, paddingLeft: 20, display: 'flex', flexDirection: 'column' }}>
                    {members.slice().reverse().map((n, i) => {
                      const sr = srs[n.id]
                      const pill = srsPill(sr)
                      const linked = linksOf(n)
                      return (
                        <div key={n.id} className="tint" onClick={() => openNote(n.id)}
                          style={{ position: 'relative', padding: '9px 12px', borderRadius: 9, cursor: 'pointer', animation: 'rise 0.3s ease both', animationDelay: `${Math.min(i * 0.035, 0.3)}s` }}>
                          <span style={{ position: 'absolute', left: -24.5, top: 16, width: 7, height: 7, background: col, transform: 'rotate(45deg)' }} />
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 500, opacity: Math.max(0.5, inkOpacity(sr, inkFade)), flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {n.title}
                            </span>
                            <span style={{ fontFamily: MONO, fontSize: 9.5, color: pill.color, fontWeight: pill.bold ? 600 : 400, flexShrink: 0 }}>
                              {pill.label}
                            </span>
                          </div>
                          {linked.length > 0 && (
                            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', marginTop: 3 }}>
                              ↔{' '}
                              {linked.map((l, j) => (
                                <span key={l.id} className="crumb" onClick={(e) => { e.stopPropagation(); openNote(l.id) }} style={{ color: 'var(--ac)', cursor: 'pointer' }}>
                                  {l.title}
                                  {j < linked.length - 1 ? '  ·  ' : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <span onClick={() => setThread(tag)} className="crumb"
                      style={{ fontFamily: MONO, fontSize: 9.5, color: col, cursor: 'pointer', padding: '9px 12px 0', letterSpacing: '0.04em' }}>
                      pull the full thread → <span style={{ color: 'var(--ink3)' }}>todos + watch ride along</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {shown.length === 0 && shownSingles.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <EmptyState compact title={`No thread matches “${q}”.`} hint="tags weave threads — add one to a note" />
          </div>
        )}
      </div>

      {/* ── single knots, folded into one quiet line ── */}
      {shownSingles.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ ...micro, marginBottom: 10 }}>single knots · {shownSingles.length}</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {shownSingles.map(({ tag, members }) => (
              <span
                key={tag}
                className="suggest"
                title={`opens “${members[0].title}”`}
                onClick={() => openNote(members[0].id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, color: 'var(--ink2)', border: '1px dashed var(--ln)', borderRadius: 999, padding: '4px 11px', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 99, background: threadColor(tag) }} />
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── loose threads ── */}
      {loose.length > 0 && (
        <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--ln)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={micro}>loose threads · {loose.length}</span>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink3)' }}>
              no tags, no [[links]] — can't be found by association yet
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {loose.slice(0, 8).map((n) => (
              <span key={n.id} className="suggest" onClick={() => openNote(n.id)} style={{ fontFamily: SERIF, fontSize: 12.5, color: 'var(--ink2)', border: '1px dashed var(--ln)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                {n.title} — weave in →
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
