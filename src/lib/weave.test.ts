import { describe, it, expect } from 'vitest'
import { fuzzyScore, rankWeave } from './weave'
import type { Note } from './types'

const note = (id: string, title: string, tags: string[] = [], folderId = 'f1', updated = -30): Note => ({
  id,
  title,
  folderId,
  tags,
  created: -30,
  updated,
  blocks: [],
})

describe('fuzzyScore', () => {
  it('matches word initials — "tsa" finds "Transformer Self-Attention"', () => {
    expect(fuzzyScore('tsa', 'Transformer Self-Attention')).toBeGreaterThan(0)
    expect(fuzzyScore('xyzq', 'Transformer Self-Attention')).toBe(-1)
  })

  it('ranks a prefix run above scattered letters', () => {
    expect(fuzzyScore('cap', 'CAP Theorem, honestly')).toBeGreaterThan(fuzzyScore('cap', 'TCP and Paging'))
  })

  it('empty query matches everything, neutrally', () => {
    expect(fuzzyScore('', 'Anything')).toBe(1)
  })

  it('shorter titles win ties', () => {
    expect(fuzzyScore('sql', 'SQL Joins')).toBeGreaterThan(fuzzyScore('sql', 'SQL Joins and the long tale of databases'))
  })
})

describe('rankWeave', () => {
  const cur = note('me', 'Current', ['ml', 'nets'], 'fA')
  const tagSib = note('a', 'Attention Is All You Need', ['ml'], 'fB', -30)
  const folderSib = note('b', 'Backprop Basics', [], 'fA', -30)
  const trailNote = note('c', 'CAP Theorem', [], 'fB', -30)
  const freshNote = note('d', 'Docker Layers', [], 'fB', -1)
  const stranger = note('e', 'Etruscan Pottery', [], 'fB', -300)

  const all = [cur, tagSib, folderSib, trailNote, freshNote, stranger]

  it('with an empty query, context orders the list: tag > folder > trail/fresh > archive', () => {
    const r = rankWeave('', cur, all, ['c'])
    const ids = r.map((x) => x.note.id)
    expect(ids[0]).toBe('a') // shared #ml
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('e'))
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('e'))
    expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('e'))
  })

  it('labels the reason and group', () => {
    const r = rankWeave('', cur, all, ['c'])
    const by = Object.fromEntries(r.map((x) => [x.note.id, x]))
    expect(by['a'].detail).toBe('#ml')
    expect(by['a'].group).toBe('nearby')
    expect(by['b'].group).toBe('nearby')
    expect(by['c'].detail).toBe('on your trail')
    expect(by['c'].group).toBe('fresh')
    expect(by['d'].detail).toBe('edited 1d ago')
    expect(by['d'].group).toBe('fresh')
    expect(by['e'].group).toBe('archive')
  })

  it('typing filters and outweighs context', () => {
    const r = rankWeave('etru', cur, all, [])
    expect(r).toHaveLength(1)
    expect(r[0].note.id).toBe('e')
  })

  it('excludes the current note and respects the cap', () => {
    const r = rankWeave('', cur, all, [])
    expect(r.find((x) => x.note.id === 'me')).toBeUndefined()
    expect(rankWeave('', cur, all, [], 2)).toHaveLength(2)
  })
})
