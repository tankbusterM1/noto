import type { Note, SrsState } from './types'

/*
 * The Bindery's geography — pure maths, no React.
 *
 * The room where loose leaves are sewn into a book. The vocabulary is
 * load-bearing and used throughout the UI: a note is a LEAF, a connection is a
 * STITCH, a tag is a GATHERING.
 *
 * The layout is a seeded force simulation run ONCE and frozen. Same seed →
 * same geography on every visit, which is the whole point: a map that moves
 * cannot be learned. Nothing here uses hue — the map is ink on paper.
 */

export interface BinderyNode {
  /** Stable key: `n:<noteId>` or `t:<tag>`. */
  k: string
  kind: 'note' | 'tag'
  /** Note id, or tag name. */
  ref: string
  label: string
  tags: string[]
  /** Unfitted simulation coordinates. */
  ux: number
  uy: number
  /** Fitted pixel coordinates (filled by `fitBindery`). */
  x: number
  y: number
  deg: number
}

export interface BinderyEdge {
  a: number
  b: number
  kind: 'tag' | 'link'
  tag?: string
}

export interface BinderyGraph {
  nodes: BinderyNode[]
  edges: BinderyEdge[]
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Deterministic LCG — the seed is what freezes the geography. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const noteText = (n: Note): string =>
  n.blocks.map((b) => (b.text ?? '') + ' ' + (b.items ?? []).join(' ')).join(' ').toLowerCase()

/**
 * Build the graph and run the simulation. Leaves stitch to every gathering they
 * carry, and to any leaf whose title they name in their text.
 */
export function buildBindery(notes: Note[]): BinderyGraph {
  const nodes: BinderyNode[] = []
  const edges: BinderyEdge[] = []
  const idx: Record<string, number> = {}
  const mk = (k: string, kind: 'note' | 'tag', ref: string, label: string, tags: string[]) => {
    idx[k] = nodes.length
    nodes.push({ k, kind, ref, label, tags, ux: 0, uy: 0, x: 0, y: 0, deg: 0 })
  }

  for (const n of notes) mk('n:' + n.id, 'note', n.id, n.title, n.tags)

  // A gathering only exists once two leaves share it — one leaf is not a set.
  const tally: Record<string, number> = {}
  for (const n of notes) for (const t of n.tags) tally[t] = (tally[t] ?? 0) + 1
  for (const t of Object.keys(tally).sort()) {
    if (tally[t] < 2) continue
    mk('t:' + t, 'tag', t, '#' + t, [t])
  }

  for (const n of notes) {
    const a = idx['n:' + n.id]
    for (const t of n.tags) {
      const b = idx['t:' + t]
      if (b !== undefined) edges.push({ a, b, kind: 'tag', tag: t })
    }
  }

  // A leaf that names another leaf in its text is stitched to it.
  const seen: Record<string, true> = {}
  for (const n of notes) {
    const text = noteText(n)
    for (const o of notes) {
      if (o.id === n.id || o.title.length < 8) continue
      if (!text.includes(o.title.toLowerCase())) continue
      const a = idx['n:' + n.id]
      const b = idx['n:' + o.id]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seen[key]) continue
      seen[key] = true
      edges.push({ a, b, kind: 'link' })
    }
  }

  const N = nodes.length
  const deg = new Array(N).fill(0)
  for (const e of edges) {
    deg[e.a]++
    deg[e.b]++
  }

  const rand = seeded(20260830)
  nodes.forEach((nd, i) => {
    const a = (i / Math.max(1, N)) * Math.PI * 2
    nd.x = 500 + Math.cos(a) * (170 + rand() * 90)
    nd.y = 320 + Math.sin(a) * (115 + rand() * 65)
  })

  const ITER = 460
  for (let it = 0; it < ITER; it++) {
    const k = 1 - it / ITER
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = nodes[i].x - nodes[j].x
        let dy = nodes[i].y - nodes[j].y
        let d2 = dx * dx + dy * dy
        if (d2 < 24) {
          d2 = 24
          dx = dx || 0.7
          dy = dy || 0.7
        }
        const d = Math.sqrt(d2)
        const f = ((34000 / d2) * k) / 2
        nodes[i].x += (dx / d) * f
        nodes[i].y += (dy / d) * f
        nodes[j].x -= (dx / d) * f
        nodes[j].y -= (dy / d) * f
      }
    }
    for (const e of edges) {
      const A = nodes[e.a]
      const B = nodes[e.b]
      const dx = B.x - A.x
      const dy = B.y - A.y
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const f = (d - (e.kind === 'link' ? 150 : 122)) * 0.045 * k
      A.x += (dx / d) * f
      A.y += (dy / d) * f
      B.x -= (dx / d) * f
      B.y -= (dy / d) * f
    }
    for (const nd of nodes) {
      nd.x += (500 - nd.x) * 0.008 * k
      nd.y += (320 - nd.y) * 0.011 * k
    }
  }

  nodes.forEach((nd, i) => {
    nd.deg = deg[i]
    nd.ux = nd.x
    nd.uy = nd.y
  })
  const xs = nodes.map((n) => n.ux)
  const ys = nodes.map((n) => n.uy)
  return {
    nodes,
    edges,
    x0: xs.length ? Math.min(...xs) : 0,
    x1: xs.length ? Math.max(...xs) : 1,
    y0: ys.length ? Math.min(...ys) : 0,
    y1: ys.length ? Math.max(...ys) : 1,
  }
}

/**
 * Fit the frozen layout into a measured pixel box, writing `x`/`y` and each
 * edge's curve. Anisotropy is capped at 1.35× so the map never shears.
 */
export function fitBindery(g: BinderyGraph, w: number, h: number): Map<number, string> {
  const padX = 118
  const padT = 58
  const padB = 138
  const sx0 = (w - padX * 2) / Math.max(1, g.x1 - g.x0)
  const sy0 = (h - padT - padB) / Math.max(1, g.y1 - g.y0)
  const base = Math.min(sx0, sy0)
  const sx = Math.min(sx0, base * 1.35)
  const sy = Math.min(sy0, base * 1.35)
  const cy = padT + (h - padT - padB) / 2
  for (const nd of g.nodes) {
    nd.x = Math.round((w / 2 + (nd.ux - (g.x0 + g.x1) / 2) * sx) * 10) / 10
    nd.y = Math.round((cy + (nd.uy - (g.y0 + g.y1) / 2) * sy) * 10) / 10
  }
  const paths = new Map<number, string>()
  g.edges.forEach((e, i) => {
    const A = g.nodes[e.a]
    const B = g.nodes[e.b]
    const mx = (A.x + B.x) / 2
    const my = (A.y + B.y) / 2
    const dx = B.x - A.x
    const dy = B.y - A.y
    paths.set(i, `M ${A.x} ${A.y} Q ${(mx - dy * 0.09).toFixed(1)} ${(my + dx * 0.09).toFixed(1)} ${B.x} ${B.y}`)
  })
  return paths
}

/**
 * Convex hull (Andrew's monotone chain), each vertex pushed 9px out from the
 * centroid. Stroked at 14px with the same fill, this reads as the sheet the
 * leaves rest on — the map's geography, with no hue at all.
 */
export function hullOf(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = []
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
    lo.push(q)
  }
  const up: [number, number][] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
    up.push(q)
  }
  const hull = lo.slice(0, -1).concat(up.slice(0, -1))
  if (!hull.length) return []
  const cx = hull.reduce((a, q) => a + q[0], 0) / hull.length
  const cy = hull.reduce((a, q) => a + q[1], 0) / hull.length
  return hull.map((q) => {
    const dx = q[0] - cx
    const dy = q[1] - cy
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    return [q[0] + (dx / d) * 9, q[1] + (dy / d) * 9] as [number, number]
  })
}

export interface LooseLeaf {
  id: string
  title: string
  why: string
}

/**
 * "Coming loose" — the one thing only the map knows.
 *
 * First the leaves that are the ONLY stitch between two gatherings (cut them
 * and the book falls into two halves), then leaves held by a single stitch or
 * none at all.
 */
export function comingLoose(notes: Note[], g: BinderyGraph, limit = 5): LooseLeaf[] {
  const deg: Record<string, number> = {}
  for (const e of g.edges) {
    deg[g.nodes[e.a].k] = (deg[g.nodes[e.a].k] ?? 0) + 1
    deg[g.nodes[e.b].k] = (deg[g.nodes[e.b].k] ?? 0) + 1
  }
  const tags = g.nodes.filter((n) => n.kind === 'tag').map((n) => n.ref)
  const out: LooseLeaf[] = []
  const taken: Record<string, true> = {}

  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const both = notes.filter((n) => n.tags.includes(tags[i]) && n.tags.includes(tags[j]))
      if (both.length !== 1 || taken[both[0].id]) continue
      taken[both[0].id] = true
      out.push({ id: both[0].id, title: both[0].title, why: `the only stitch between #${tags[i]} and #${tags[j]}` })
    }
  }
  for (const n of notes) {
    if (taken[n.id]) continue
    const d = deg['n:' + n.id] ?? 0
    if (d > 1) continue
    taken[n.id] = true
    out.push({ id: n.id, title: n.title, why: d === 0 ? 'not sewn to anything' : 'held by a single stitch' })
  }
  return out.slice(0, limit)
}

/** The header's census: leaves, stitches, and how many are coming loose. */
export function binderyStats(notes: Note[], g: BinderyGraph): string {
  const leaves = g.nodes.filter((n) => n.kind === 'note').length
  const loose = comingLoose(notes, g, 999).length
  return `${leaves} leaves · ${g.edges.length} stitches · ${loose} coming loose`
}

/** Everything stitched to one node, with the gathering that stitched it. */
export function stitchedTo(g: BinderyGraph, k: string): { node: BinderyNode; via?: string }[] {
  const i = g.nodes.findIndex((n) => n.k === k)
  if (i < 0) return []
  const out: { node: BinderyNode; via?: string }[] = []
  for (const e of g.edges) {
    if (e.a !== i && e.b !== i) continue
    out.push({ node: g.nodes[e.a === i ? e.b : e.a], via: e.tag })
  }
  return out
}

/** The rail's SRS line for a selected leaf. */
export function leafMeta(sr: SrsState | undefined): string {
  if (!sr) return 'not in review'
  const when = sr.due <= 0 ? 'due now' : `next in ${sr.due}d`
  return `${when} · ivl ${sr.ivl}d · ${sr.hist.length} reviews`
}
