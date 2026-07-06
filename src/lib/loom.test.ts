import { describe, it, expect } from 'vitest'
import { tagHue, wikiTitles, outboundIds, buildLoom, localLoom, unwovenMentions } from './loom'
import type { Note } from './types'

const note = (id: string, title: string, tags: string[] = [], body = ''): Note => ({
  id,
  title,
  folderId: 'f1',
  tags,
  created: 0,
  updated: 0,
  blocks: [{ id: id + 'b', t: 'p', text: body }],
})

describe('tagHue / thread colors', () => {
  it('is stable and in range', () => {
    expect(tagHue('ml')).toBe(tagHue('ml'))
    for (const t of ['ml', 'systems', 'databases', 'graphs']) {
      expect(tagHue(t)).toBeGreaterThanOrEqual(0)
      expect(tagHue(t)).toBeLessThan(360)
    }
  })

  it('different tags usually get different hues', () => {
    expect(tagHue('ml')).not.toBe(tagHue('systems'))
  })
})

describe('wikiTitles / outboundIds', () => {
  it('finds [[titles]] in text and list items', () => {
    const n: Note = {
      ...note('a', 'A'),
      blocks: [
        { id: '1', t: 'p', text: 'see [[B-Trees]] and [[TCP]]' },
        { id: '2', t: 'ul', items: ['also [[B-Trees]]'] },
      ],
    }
    expect(wikiTitles(n)).toEqual(['B-Trees', 'TCP', 'B-Trees'])
  })

  it('resolves titles case-insensitively, dedupes, ignores self/missing', () => {
    const a = note('a', 'Alpha', [], 'links [[beta]] and [[BETA]] and [[Alpha]] and [[Nope]]')
    const b = note('b', 'Beta')
    expect(outboundIds(a, [a, b])).toEqual(['b'])
  })
})

describe('buildLoom', () => {
  const a = note('a', 'Alpha', ['ml'], 'see [[Beta]]')
  const b = note('b', 'Beta', ['ml'])
  const c = note('c', 'Gamma', ['solo-tag'])
  const d = note('d', 'Delta') // no tags, no links

  it('weaves note knots, shared-tag knots, tag threads and link strokes', () => {
    const { nodes, edges, loose } = buildLoom([a, b, c, d], {})
    // 4 note knots + 1 shared tag (#ml); #solo-tag has one note → no knot
    expect(nodes.filter((n) => n.kind === 'note')).toHaveLength(4)
    expect(nodes.filter((n) => n.kind === 'tag').map((n) => n.ref)).toEqual(['ml'])
    expect(edges.filter((e) => e.kind === 'tag')).toHaveLength(2) // a–ml, b–ml
    expect(edges.filter((e) => e.kind === 'link')).toHaveLength(1) // a–b
    // Gamma's tag is unshared and Delta has nothing — both are loose threads
    expect(loose.map((n) => n.id).sort()).toEqual(['c', 'd'])
  })

  it('does not duplicate a mutual link', () => {
    const x = note('x', 'X', [], '[[Y]]')
    const y = note('y', 'Y', [], '[[X]]')
    const { edges } = buildLoom([x, y], {})
    expect(edges.filter((e) => e.kind === 'link')).toHaveLength(1)
  })
})

describe('unwovenMentions', () => {
  it('spots plain-text titles that are not yet [[linked]]', () => {
    const btrees = note('b', 'B-Trees')
    const tcp = note('t', 'TCP Congestion')
    const me = note('m', 'Indexes', [], 'B-Trees beat hashes on range scans; see also [[TCP Congestion]]')
    const found = unwovenMentions(me, [me, btrees, tcp])
    expect(found.map((n) => n.id)).toEqual(['b']) // TCP already woven, B-Trees not
  })

  it('ignores very short titles and self', () => {
    const tiny = note('x', 'SQL') // < 4 chars
    const me = note('m', 'Note', [], 'SQL everywhere')
    expect(unwovenMentions(me, [me, tiny])).toEqual([])
  })
})

describe('localLoom', () => {
  const a = note('a', 'Alpha', ['ml', 'nets'], '[[Beta]]')
  const b = note('b', 'Beta', [])
  const c = note('c', 'Gamma', ['ml'])
  const d = note('d', 'Delta', [], 'links [[Alpha]]')

  it('collects wikilinks (both directions) and tag siblings, link wins', () => {
    const links = localLoom(a, [a, b, c, d])
    const byId = Object.fromEntries(links.map((l) => [l.note.id, l.via]))
    expect(byId['b']).toBe('link') // outbound
    expect(byId['d']).toBe('link') // inbound
    expect(byId['c']).toBe('ml') // shared thread
    expect(links).toHaveLength(3)
  })
})
