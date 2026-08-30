import { describe, it, expect } from 'vitest'
import { buildBindery, fitBindery, hullOf, comingLoose, binderyStats, stitchedTo } from './bindery'
import { blockId, type Note } from './types'

/*
 * The Bindery's geography must be STABLE — a map that moves cannot be learned —
 * and its "coming loose" list is the one thing only the graph knows, so both
 * are worth pinning.
 */

const note = (id: string, title: string, tags: string[], body = ''): Note => ({
  id,
  title,
  folderId: 'f1',
  tags,
  created: -10,
  updated: -1,
  blocks: [{ id: blockId(), t: 'p', text: body }],
})

const vault: Note[] = [
  note('a', 'Dijkstra vs A*', ['graphs', 'search']),
  note('b', 'B-Trees and Indexes', ['systems', 'search']),
  note('c', 'CAP Theorem', ['systems', 'distributed']),
  note('d', 'Orphan note', []),
  // Names another leaf in its text → a link stitch, not just a shared gathering.
  note('e', 'Reading list', ['systems'], 'follows on from CAP Theorem nicely'),
]

describe('buildBindery', () => {
  it('makes a leaf per note and a gathering only where a tag is shared', () => {
    const g = buildBindery(vault)
    const leaves = g.nodes.filter((n) => n.kind === 'note').map((n) => n.ref)
    const gatherings = g.nodes.filter((n) => n.kind === 'tag').map((n) => n.ref)
    expect(leaves).toEqual(['a', 'b', 'c', 'd', 'e'])
    // 'graphs' and 'distributed' are held by one leaf each — not a set.
    expect(gatherings).toEqual(['search', 'systems'])
  })

  it('stitches a leaf to a leaf it names in its text', () => {
    const g = buildBindery(vault)
    const links = g.edges.filter((e) => e.kind === 'link')
    expect(links).toHaveLength(1)
    const ends = [g.nodes[links[0].a].ref, g.nodes[links[0].b].ref].sort()
    expect(ends).toEqual(['c', 'e'])
  })

  /*
   * The seeded simulation is the whole reason the map is learnable: same input,
   * same geography, every visit.
   */
  it('is deterministic — the same vault lays out identically', () => {
    const a = buildBindery(vault).nodes.map((n) => [n.ux.toFixed(4), n.uy.toFixed(4)])
    const b = buildBindery(vault).nodes.map((n) => [n.ux.toFixed(4), n.uy.toFixed(4)])
    expect(a).toEqual(b)
  })

  it('survives an empty vault', () => {
    const g = buildBindery([])
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })
})

describe('fitBindery', () => {
  it('fits inside the measured box and yields a curve per stitch', () => {
    const g = buildBindery(vault)
    const paths = fitBindery(g, 900, 520)
    expect(paths.size).toBe(g.edges.length)
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThan(0)
      expect(n.x).toBeLessThan(900)
      expect(n.y).toBeGreaterThan(0)
      expect(n.y).toBeLessThan(520)
    }
  })
})

describe('hullOf', () => {
  it('wraps its points and pushes every vertex outward', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5], // interior — must not survive
    ]
    const hull = hullOf(square)
    expect(hull).toHaveLength(4)
    // Padded 9px out from the centroid, so it is wider than the input.
    const xs = hull.map((p) => p[0])
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(10)
  })
})

describe('comingLoose', () => {
  it('names the sole bridge between two gatherings first', () => {
    const g = buildBindery(vault)
    const loose = comingLoose(vault, g)
    const bridge = loose.find((l) => l.why.includes('only stitch'))
    // 'b' is the only leaf carrying both #search and #systems.
    expect(bridge?.id).toBe('b')
  })

  it('then the leaves barely held, and says which', () => {
    const g = buildBindery(vault)
    const loose = comingLoose(vault, g)
    const orphan = loose.find((l) => l.id === 'd')
    expect(orphan?.why).toBe('not sewn to anything')
  })
})

describe('the header census', () => {
  it('counts real leaves and stitches', () => {
    const g = buildBindery(vault)
    const line = binderyStats(vault, g)
    expect(line).toMatch(/^5 leaves · \d+ stitches · \d+ coming loose$/)
  })
})

describe('stitchedTo', () => {
  it('returns the gathering that did the stitching', () => {
    const g = buildBindery(vault)
    const kb = g.nodes.find((n) => n.ref === 'b' && n.kind === 'note')!.k
    const vias = stitchedTo(g, kb).map((x) => x.via).filter(Boolean).sort()
    expect(vias).toEqual(['search', 'systems'])
  })
})
