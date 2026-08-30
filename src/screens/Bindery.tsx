import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import {
  buildBindery,
  fitBindery,
  hullOf,
  comingLoose,
  binderyStats,
  stitchedTo,
  leafMeta,
  type BinderyNode,
} from '../lib/bindery'
import s from './Bindery.module.css'

/*
 * The Bindery — the room where loose leaves are sewn into a book.
 *
 * Vocabulary is load-bearing: a note is a LEAF, a connection a STITCH, a tag a
 * GATHERING. Say it in the copy; it is what makes this a place and not a chart.
 *
 * This is deliberately the QUIETEST screen in the app. An earlier pass gave
 * gatherings their own hues and dash rhythms, an always-open legend, breathing
 * halos and a stats rail — it was built, shown, and cut for being
 * overstimulating. Do not reintroduce any of it: one circle vocabulary, one
 * hairline ink, no hue, and nothing on this screen animates on a loop.
 */

export function Bindery() {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const openNote = useUI((u) => u.openNote)
  const startReview = useUI((u) => u.startReview)

  // Built once per note-set and frozen: same geography every visit.
  const graph = useMemo(() => buildBindery(notes), [notes])

  const canvasRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 520 })
  const [hover, setHover] = useState<number | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [keyOpen, setKeyOpen] = useState(false)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const onLeaf = useRef(false)

  // The viewBox comes from the MEASURED pixel size, so 1 unit = 1px and labels
  // never scale with the map.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setBox({ w: Math.max(360, Math.round(r.width)), h: Math.max(260, Math.round(r.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const edgePaths = useMemo(() => fitBindery(graph, box.w, box.h), [graph, box.w, box.h])

  const needle = q.trim().toLowerCase()
  const selNode = sel ? graph.nodes.find((n) => n.k === sel) ?? null : null
  const focusIdx = hover !== null ? hover : selNode ? graph.nodes.indexOf(selNode) : null

  // The lit neighbourhood: the focused leaf and everything stitched to it.
  const litSet = useMemo(() => {
    if (focusIdx === null) return null
    const lit = new Set<number>([focusIdx])
    for (const e of graph.edges) {
      if (e.a === focusIdx) lit.add(e.b)
      if (e.b === focusIdx) lit.add(e.a)
    }
    return lit
  }, [focusIdx, graph])

  const degree = useMemo(() => {
    const d: Record<string, number> = {}
    for (const e of graph.edges) {
      d[graph.nodes[e.a].k] = (d[graph.nodes[e.a].k] ?? 0) + 1
      d[graph.nodes[e.b].k] = (d[graph.nodes[e.b].k] ?? 0) + 1
    }
    return d
  }, [graph])

  const gatherings = useMemo(() => graph.nodes.filter((n) => n.kind === 'tag').map((n) => n.ref), [graph])
  const loose = useMemo(() => comingLoose(notes, graph), [notes, graph])
  const stats = useMemo(() => binderyStats(notes, graph), [notes, graph])

  const opacityOf = (n: BinderyNode, i: number): number => {
    if (litSet) return litSet.has(i) ? 1 : 0.14
    if (tag) return n.tags.includes(tag) ? 1 : 0.14
    if (needle) return n.label.toLowerCase().includes(needle) ? 1 : 0.14
    return 1
  }
  const radiusOf = (n: BinderyNode) =>
    n.kind === 'tag' ? 3.2 : 3.6 + Math.min(3.4, (degree[n.k] ?? 1) * 0.6)

  const xform = `translate(${view.x} ${view.y}) scale(${view.z})`

  return (
    <div className={s.screen}>
      <div className={s.left}>
        {/* min-width:0 + overflow:hidden, or this row prints over the rail */}
        <div className={s.header}>
          <h1 className={s.title}>Bindery</h1>
          <div className={s.stats}>{stats}</div>
          <span className={s.gap} />
          <input
            className={s.find}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find…"
          />
          <button type="button" className={s.disclosure} onClick={() => setFiltersOpen((v) => !v)}>
            {tag ? `#${tag}` : filtersOpen ? 'filter −' : 'filter'}
          </button>
        </div>

        {filtersOpen && (
          <div className={s.chips}>
            <button type="button" className={`${s.chip} ${!tag ? s.chipOn : ''}`} onClick={() => setTag(null)}>
              all
            </button>
            {gatherings.map((t) => (
              <button
                type="button"
                key={t}
                className={`${s.chip} ${tag === t ? s.chipOn : ''}`}
                onClick={() => setTag(tag === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        <div
          ref={canvasRef}
          className={s.canvas}
          style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
          onMouseDown={(e) => {
            drag.current = { x: e.clientX - view.x, y: e.clientY - view.y, moved: false }
          }}
          onMouseMove={(e) => {
            const d = drag.current
            if (!d) return
            const nx = e.clientX - d.x
            const ny = e.clientY - d.y
            // 3px threshold, or every pan selects the leaf it ends on.
            if (!d.moved && Math.abs(nx - view.x) + Math.abs(ny - view.y) < 3) return
            d.moved = true
            setView((v) => ({ ...v, x: nx, y: ny }))
          }}
          onMouseUp={() => {
            const moved = drag.current?.moved
            drag.current = null
            if (moved) onLeaf.current = true // swallow the click that ends a pan
          }}
          onMouseLeave={() => {
            drag.current = null
            setHover(null)
          }}
          onWheel={(e) => {
            const el = canvasRef.current
            if (!el) return
            const r = el.getBoundingClientRect()
            const mx = e.clientX - r.left
            const my = e.clientY - r.top
            setView((v) => {
              const next = Math.max(0.55, Math.min(3, v.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
              if (next === v.z) return v
              const k = next / v.z
              // Anchor the zoom on the pointer, not the centre.
              return { z: next, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
            })
          }}
          onDoubleClick={() => setView({ x: 0, y: 0, z: 1 })}
          onClick={() => {
            if (onLeaf.current) {
              onLeaf.current = false
              return
            }
            setSel(null)
            setHover(null)
          }}
        >
          <svg className={s.svg} viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet">
            <g transform={xform}>
              {/* Gathering fields — the sheets the leaves rest on. No hue. */}
              {graph.nodes
                .filter((n) => n.kind === 'tag')
                .map((n) => {
                  const pts = notes
                    .filter((x) => x.tags.includes(n.ref))
                    .map((x) => graph.nodes.find((g2) => g2.k === 'n:' + x.id))
                    .filter((g2): g2 is BinderyNode => !!g2)
                    .map((g2) => [g2.x, g2.y] as [number, number])
                  pts.push([n.x, n.y])
                  if (pts.length < 3) return null
                  const hull = hullOf(pts)
                  if (!hull.length) return null
                  const on =
                    tag === n.ref ||
                    (selNode && (selNode.ref === n.ref || selNode.tags.includes(n.ref))) ||
                    (focusIdx !== null && graph.nodes[focusIdx].tags.includes(n.ref))
                  return (
                    <path
                      key={n.k}
                      className={s.field}
                      d={'M ' + hull.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ' Z'}
                      fill="var(--ink3)"
                      stroke="var(--ink3)"
                      strokeWidth={14}
                      strokeLinejoin="round"
                      opacity={on ? 0.1 : tag || focusIdx !== null ? 0.02 : 0.045}
                    />
                  )
                })}

              {/* Stitches — weight and opacity carry the difference, never hue. */}
              {graph.edges.map((e, i) => {
                const on = litSet ? e.a === focusIdx || e.b === focusIdx : tag ? e.tag === tag : false
                return (
                  <path
                    key={i}
                    className={s.edge}
                    d={edgePaths.get(i)}
                    fill="none"
                    stroke="var(--ink3)"
                    strokeWidth={e.kind === 'link' ? (on ? 1.5 : 1.1) : on ? 1.2 : 0.9}
                    strokeLinecap="round"
                    opacity={litSet || tag ? (on ? 0.8 : 0.06) : e.kind === 'link' ? 0.34 : 0.2}
                  />
                )
              })}

              {/* Leaves — one circle vocabulary. */}
              {graph.nodes.map((n, i) => {
                const sr = n.kind === 'note' ? srs[n.ref] : undefined
                const due = !!sr && sr.due <= 0
                const r = radiusOf(n)
                return (
                  <g
                    key={n.k}
                    className={s.node}
                    opacity={opacityOf(n, i)}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      if (drag.current?.moved) return
                      onLeaf.current = true
                      setSel((cur) => (cur === n.k ? null : n.k))
                    }}
                    onMouseOver={() => setHover(i)}
                    /* Every leaf needs its own mouseout — a canvas mouseleave
                       alone leaves the last one lit and the rest faded. */
                    onMouseOut={() => setHover((h) => (h === i ? null : h))}
                  >
                    <circle cx={n.x} cy={n.y} r={Math.max(14, r + 9)} fill="transparent" />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={n.kind === 'tag' ? 'var(--bg)' : due ? 'var(--am)' : sr ? 'var(--ink2)' : 'var(--bg)'}
                      stroke={due ? 'var(--am)' : n.kind === 'tag' || !sr ? 'var(--ink3)' : 'var(--ink2)'}
                      strokeWidth={1.2}
                    />
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Labels are an HTML overlay, moved by the SAME transform. */}
          <div className={s.labels} style={{ transform: xform.replace(/ /g, ' ') }}>
            {graph.nodes.map((n, i) => {
              const isTag = n.kind === 'tag'
              const sr = isTag ? undefined : srs[n.ref]
              const due = !!sr && sr.due <= 0
              const near = litSet
                ? litSet.has(i)
                : tag
                  ? n.tags.includes(tag)
                  : needle
                    ? n.label.toLowerCase().includes(needle)
                    : false
              const op = near || sel === n.k ? 1 : litSet || tag || needle ? 0 : isTag ? 0.62 : 0
              if (op === 0) return null
              const r = radiusOf(n)
              return (
                <div
                  key={n.k}
                  className={isTag ? s.tagLabel : s.leafLabel}
                  style={{
                    left: n.x,
                    // Labels in the bottom band flip above their leaf.
                    top: n.y > box.h - 96 ? n.y - r - 17 : n.y + r + 8,
                    opacity: op,
                    color: isTag ? 'var(--ink3)' : due ? 'var(--am)' : 'var(--ink2)',
                  }}
                >
                  {isTag ? n.label : n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
                </div>
              )
            })}
          </div>

          <div className={s.footLinks}>
            <button type="button" className={s.disclosure} onClick={() => setKeyOpen((v) => !v)}>
              {keyOpen ? 'key −' : 'key'}
            </button>
            {(view.x !== 0 || view.y !== 0 || view.z !== 1) && (
              <button type="button" className={s.disclosure} onClick={() => setView({ x: 0, y: 0, z: 1 })}>
                reset view
              </button>
            )}
          </div>

          {keyOpen && (
            <div className={s.key}>
              {[
                ['background: var(--am)', 'due now'],
                ['background: var(--ink2)', 'reviewed before'],
                ['background: var(--bg); border: 1.2px solid var(--ink3)', 'never reviewed'],
                ['background: var(--bg); border: 1.2px solid var(--ink3); width: 7px; height: 7px', 'a gathering'],
              ].map(([mark, label]) => (
                <div key={label} className={s.keyRow}>
                  <span className={s.keyMarkWrap}>
                    <span className={s.keyMark} style={Object.fromEntries(mark.split(';').map((d) => {
                      const [k, v] = d.split(':')
                      return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.trim()]
                    }))} />
                  </span>
                  <span className={s.keyLabel}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── the rail — never a repeat of the Review list ─────────── */}
      <aside className={s.rail}>
        {selNode ? (
          <>
            <div className={s.railTop}>
              <div className={s.railKind}>{selNode.kind === 'tag' ? 'a gathering' : 'a leaf'}</div>
              <div className={s.railTitle}>{selNode.label}</div>
              <div className={s.railMeta}>
                {selNode.kind === 'tag'
                  ? `${notes.filter((n) => n.tags.includes(selNode.ref)).length} leaves gathered here`
                  : leafMeta(srs[selNode.ref])}
              </div>
              <div className={s.railLinks}>
                {selNode.kind === 'note' && (
                  <button type="button" className={s.railLink} onClick={() => openNote(selNode.ref)}>
                    open note
                  </button>
                )}
                {selNode.kind === 'note' && (srs[selNode.ref]?.due ?? 1) <= 0 && (
                  <button type="button" className={s.railLinkDue} onClick={() => startReview(selNode.ref)}>
                    review now
                  </button>
                )}
              </div>
            </div>
            <div className={s.railLabel}>{selNode.kind === 'tag' ? 'Gathered here' : 'Stitched to'}</div>
            {stitchedTo(graph, selNode.k).map((nb, i) => {
              const nsr = nb.node.kind === 'note' ? srs[nb.node.ref] : undefined
              return (
                <button
                  type="button"
                  key={nb.node.k}
                  className={s.nbRow}
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => setSel(nb.node.k)}
                >
                  <span
                    className={s.nbDot}
                    style={
                      nb.node.kind === 'tag'
                        ? { border: '1px solid var(--ink3)' }
                        : { background: nsr && nsr.due <= 0 ? 'var(--am)' : 'var(--ink3)' }
                    }
                  />
                  <span className={s.nbTitle}>{nb.node.label}</span>
                </button>
              )
            })}
          </>
        ) : (
          <>
            <p className={s.hint}>The Review list knows what is due. The Bindery knows what is barely sewn in.</p>
            <div className={s.railLabel}>Coming loose</div>
            {loose.map((w, i) => (
              <button
                type="button"
                key={w.id}
                className={s.looseRow}
                style={{ animationDelay: `${120 + i * 70}ms` }}
                onClick={() => setSel('n:' + w.id)}
              >
                <span className={s.looseTitle}>{w.title}</span>
                <span className={s.looseWhy}>{w.why}</span>
              </button>
            ))}
            {loose.length === 0 && <div className={s.allHeld}>Every leaf is held by at least two stitches.</div>}
          </>
        )}
      </aside>
    </div>
  )
}
