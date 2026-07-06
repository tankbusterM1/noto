import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { inkOpacity } from '../lib/srs'
import { buildLoom, threadColor } from '../lib/loom'
import { MONO, SERIF, kicker } from '../lib/ui'

/*
 * The Loom — Noto's knowledge web, drawn live. A gentle force simulation lays
 * out note-knots and tag-threads; ink opacity is the note's real memory state
 * (same inkOpacity as everywhere else), due notes burn amber. Drag knots,
 * hover to trace a thread, click a note to open it, click a tag to pull its
 * thread. Physics runs in refs + one RAF loop and cools to a stop (alpha
 * decay) so an idle Loom costs nothing.
 */

const W = 1000
const H = 620

interface Body {
  x: number
  y: number
  vx: number
  vy: number
}

export function Loom() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const inkFade = useUI((s) => s.inkFade)
  const openNote = useUI((s) => s.openNote)
  const setThread = useUI((s) => s.setThread)

  const loom = useMemo(() => buildLoom(notes, srs), [notes, srs])
  const { nodes, edges, loose } = loom

  // Physics state lives outside React; a frame counter triggers redraws.
  const bodies = useRef(new Map<string, Body>())
  const alpha = useRef(1)
  const raf = useRef(0)
  const [, setFrame] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const drag = useRef<{ key: string; moved: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Seat new knots on a ring; keep existing positions across data changes.
  useEffect(() => {
    nodes.forEach((n, i) => {
      if (!bodies.current.has(n.key)) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
        const rad = 170 + (i % 4) * 38
        bodies.current.set(n.key, {
          x: W / 2 + Math.cos(angle) * rad,
          y: H / 2 + Math.sin(angle) * rad * 0.72,
          vx: 0,
          vy: 0,
        })
      }
    })
    alpha.current = 1
  }, [nodes])

  // The weave settles: repulsion between knots, springs along threads,
  // a soft pull to center, cooling until still.
  useEffect(() => {
    const tick = () => {
      const a = alpha.current
      if (a > 0.02) {
        const bs = nodes.map((n) => bodies.current.get(n.key)!)
        for (let i = 0; i < bs.length; i++) {
          for (let j = i + 1; j < bs.length; j++) {
            let dx = bs[j].x - bs[i].x
            let dy = bs[j].y - bs[i].y
            let d2 = dx * dx + dy * dy
            if (d2 < 1) {
              dx = (i % 2 ? 1 : -1) * 0.5
              dy = 0.5
              d2 = 0.5
            }
            const f = Math.min(5, 3400 / d2) * a
            const d = Math.sqrt(d2)
            const fx = (dx / d) * f
            const fy = (dy / d) * f
            bs[i].vx -= fx
            bs[i].vy -= fy
            bs[j].vx += fx
            bs[j].vy += fy
          }
        }
        for (const e of edges) {
          const A = bs[e.a]
          const B = bs[e.b]
          const rest = e.kind === 'link' ? 150 : 112
          const dx = B.x - A.x
          const dy = B.y - A.y
          const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
          const f = (d - rest) * 0.028 * a
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          A.vx += fx
          A.vy += fy
          B.vx -= fx
          B.vy -= fy
        }
        for (const b of bs) {
          b.vx += (W / 2 - b.x) * 0.005 * a
          b.vy += (H / 2 - b.y) * 0.005 * a
          b.vx *= 0.86
          b.vy *= 0.86
          if (!drag.current || bodies.current.get(drag.current.key) !== b) {
            b.x = Math.min(W - 40, Math.max(40, b.x + b.vx))
            b.y = Math.min(H - 46, Math.max(40, b.y + b.vy))
          }
        }
        alpha.current *= 0.99
        setFrame((f) => f + 1)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [nodes, edges])

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const b = bodies.current.get(drag.current.key)
    if (!b) return
    const p = toLocal(e)
    drag.current.moved += Math.abs(p.x - b.x) + Math.abs(p.y - b.y)
    b.x = Math.min(W - 40, Math.max(40, p.x))
    b.y = Math.min(H - 46, Math.max(40, p.y))
    b.vx = 0
    b.vy = 0
    alpha.current = Math.max(alpha.current, 0.3)
    setFrame((f) => f + 1)
  }

  const onUp = () => {
    if (!drag.current) return
    const { key, moved } = drag.current
    drag.current = null
    if (moved < 6) {
      // A click, not a drag: open the note / pull the thread.
      const n = nodes.find((x) => x.key === key)
      if (n?.kind === 'note') openNote(n.ref)
      else if (n?.kind === 'tag') setThread(n.ref)
    }
  }

  // Hover: light up the hovered knot's threads, let the rest recede.
  const neighbors = useMemo(() => {
    if (!hover) return null
    const set = new Set<string>([hover])
    for (const e of edges) {
      if (nodes[e.a].key === hover) set.add(nodes[e.b].key)
      if (nodes[e.b].key === hover) set.add(nodes[e.a].key)
    }
    return set
  }, [hover, edges, nodes])

  const linkCount = edges.filter((e) => e.kind === 'link').length
  const threadCount = nodes.filter((n) => n.kind === 'tag').length

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 44px 100px', animation: 'fadein 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={kicker}>Knowledge · woven</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>The Loom</h1>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ink3)' }}>
          {notes.length} knots · {threadCount} threads · {linkCount} links
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20, fontFamily: SERIF, fontStyle: 'italic' }}>
        Every note a knot, every tag a thread. Drag to untangle · click a knot to open it · click a ◆ to pull its thread.
      </div>

      <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, overflow: 'hidden', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', display: 'block', touchAction: 'none' }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => {
            onUp()
            setHover(null)
          }}
        >
          {/* threads + links */}
          {edges.map((e, i) => {
            const A = bodies.current.get(nodes[e.a].key)
            const B = bodies.current.get(nodes[e.b].key)
            if (!A || !B) return null
            const lit = neighbors ? neighbors.has(nodes[e.a].key) && neighbors.has(nodes[e.b].key) : true
            return e.kind === 'link' ? (
              <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--ac)" strokeWidth={1.6} opacity={lit ? 0.55 : 0.1} style={{ transition: 'opacity 0.2s ease' }} />
            ) : (
              <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={threadColor(e.tag!)} strokeWidth={1.1} strokeDasharray="2 4" opacity={lit ? 0.6 : 0.09} style={{ transition: 'opacity 0.2s ease' }} />
            )
          })}
          {/* knots */}
          {nodes.map((n) => {
            const b = bodies.current.get(n.key)
            if (!b) return null
            const lit = neighbors ? neighbors.has(n.key) : true
            const isHover = hover === n.key
            if (n.kind === 'tag') {
              return (
                <g
                  key={n.key}
                  transform={`translate(${b.x},${b.y})`}
                  opacity={lit ? 1 : 0.18}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    drag.current = { key: n.key, moved: 0 }
                    svgRef.current?.setPointerCapture(e.pointerId)
                  }}
                  onPointerEnter={() => setHover(n.key)}
                  onPointerLeave={() => setHover(null)}
                >
                  <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill={threadColor(n.ref)} opacity={0.9} />
                  <text y={-11} textAnchor="middle" style={{ fontFamily: MONO, fontSize: isHover ? 10.5 : 9, fill: threadColor(n.ref), fontWeight: 600 }}>
                    {n.label}
                  </text>
                </g>
              )
            }
            const sr = srs[n.ref]
            const due = sr && sr.due <= 0
            const ink = inkOpacity(sr, inkFade)
            return (
              <g
                key={n.key}
                transform={`translate(${b.x},${b.y})`}
                opacity={lit ? 1 : 0.16}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  drag.current = { key: n.key, moved: 0 }
                  svgRef.current?.setPointerCapture(e.pointerId)
                }}
                onPointerEnter={() => setHover(n.key)}
                onPointerLeave={() => setHover(null)}
              >
                {due && <circle r={n.r + 5} fill="var(--am)" opacity={0.18} />}
                <circle
                  r={isHover ? n.r + 1.5 : n.r}
                  fill={due ? 'var(--am)' : sr ? 'var(--ac)' : 'var(--bg)'}
                  stroke={sr ? 'none' : 'var(--ink3)'}
                  strokeWidth={sr ? 0 : 1.2}
                  strokeDasharray={sr ? undefined : '2 2.5'}
                  opacity={Math.max(0.35, ink)}
                  style={{ transition: 'r 0.15s ease' }}
                />
                <text y={n.r + 13} textAnchor="middle" style={{ fontFamily: SERIF, fontSize: isHover ? 12.5 : 10.5, fontWeight: isHover ? 600 : 500, fill: 'var(--ink)', opacity: isHover ? 1 : 0.72, transition: 'all 0.15s ease' }}>
                  {n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* legend */}
        <div style={{ position: 'absolute', left: 14, bottom: 10, display: 'flex', gap: 14, alignItems: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', pointerEvents: 'none' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--am)' }} /> due
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--ac)' }} /> in review
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, border: '1px dashed var(--ink3)' }} /> unwoven
          </span>
          <span>— [[link]]</span>
          <span>┄ shared thread</span>
        </div>
      </div>

      {/* loose threads */}
      {loose.length > 0 && (
        <div style={{ marginTop: 18, background: 'var(--sf)', border: '1px dashed var(--ln)', borderRadius: 14, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
              Loose threads · {loose.length}
            </span>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink3)' }}>
              not woven to anything yet — no shared threads, no [[links]]
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {loose.slice(0, 8).map((n) => (
              <span
                key={n.id}
                className="suggest"
                onClick={() => openNote(n.id)}
                style={{ fontFamily: SERIF, fontSize: 12.5, color: 'var(--ink2)', border: '1px dashed var(--ln)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                {n.title} — weave in →
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
