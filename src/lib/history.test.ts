import { describe, it, expect } from 'vitest'
import { changeChars, shouldSnapshot, draftsToPrune, MIN_GAP_MS, MIN_CHANGE } from './history'
import type { Block } from './types'

const p = (text: string): Block[] => [{ t: 'p', text }]

describe('changeChars', () => {
  it('is 0 for identical content', () => {
    expect(changeChars(p('hello world'), p('hello world'))).toBe(0)
  })
  it('counts added characters', () => {
    expect(changeChars(p('hello'), p('hello there'))).toBe(6) // " there"
  })
  it('counts replaced characters (same length)', () => {
    expect(changeChars(p('cat'), p('bat'))).toBe(1)
  })
})

describe('shouldSnapshot', () => {
  const now = 1_000_000_000_000
  it('always saves the first draft', () => {
    expect(shouldSnapshot(p('anything'), null, now)).toBe(true)
  })
  it('refuses within the minimum gap', () => {
    const newest = { savedAt: now - 1000, blocks: p('old') }
    expect(shouldSnapshot(p('a totally different and much longer body of text here'), newest, now)).toBe(false)
  })
  it('after the gap, saves only if enough changed', () => {
    const base = 'the quick brown fox jumps over'
    const newest = { savedAt: now - MIN_GAP_MS - 1, blocks: p(base) }
    expect(shouldSnapshot(p(base), newest, now)).toBe(false) // nothing changed
    expect(shouldSnapshot(p(base + ' the'), newest, now)).toBe(false) // trivial (4 chars)
    const big = base + ' the lazy dog and then it keeps running far away across the whole meadow until the sun finally sets behind the hills'
    expect(changeChars(newest.blocks, p(big))).toBeGreaterThanOrEqual(MIN_CHANGE)
    expect(shouldSnapshot(p(big), newest, now)).toBe(true)
  })
})

describe('draftsToPrune (logarithmic thinning)', () => {
  const now = 10 * 24 * 3_600_000 // 10 days in ms, as "now"
  const min = 60_000
  const hour = 3_600_000
  const day = 24 * hour

  it('keeps everything within the last hour', () => {
    const drafts = [0, 10, 20, 30, 40, 50].map((m, i) => ({ id: i, savedAt: now - m * min }))
    expect(draftsToPrune(drafts, now)).toEqual([])
  })

  it('thins older drafts toward ~hourly / ~daily spacing', () => {
    // one draft every 10 min across the last 6 hours → recent hour kept dense,
    // older hours collapse to ~one per hour.
    const drafts = Array.from({ length: 36 }, (_, i) => ({ id: i, savedAt: now - i * 10 * min }))
    const del = draftsToPrune(drafts, now)
    const kept = drafts.filter((d) => !del.includes(d.id))
    // far fewer than the original 36, and always keeps the newest
    expect(kept.length).toBeLessThan(drafts.length)
    expect(kept.some((d) => d.id === 0)).toBe(true)
    // the last-hour drafts (ids 0..5, within 50 min) are all kept
    for (let i = 0; i <= 5; i++) expect(del).not.toContain(i)
  })

  it('always keeps the newest and never returns it for deletion', () => {
    const drafts = Array.from({ length: 20 }, (_, i) => ({ id: i, savedAt: now - i * day }))
    const del = draftsToPrune(drafts, now)
    expect(del).not.toContain(0)
  })
})
