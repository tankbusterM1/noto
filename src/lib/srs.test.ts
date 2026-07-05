import { describe, it, expect } from 'vitest'
import {
  applyGrade,
  previewInterval,
  isDue,
  dueLabel,
  inkOpacity,
  gradeName,
  gradeColor,
  dueNotes,
  forecastCounts,
  memoryBands,
  reviewTotal,
  longestReviewStreak,
  reviewsLastWeek,
  EASE_FLOOR,
} from './srs'
import type { Note, SrsState } from './types'

const base = (over: Partial<SrsState> = {}): SrsState => ({
  ease: 2.5,
  ivl: 10,
  due: 0,
  hist: [],
  ...over,
})

describe('applyGrade — interval math (README "SRS algorithm")', () => {
  it('1 Again: ease −0.2, ivl ×0.5, due 0, requeues', () => {
    const { state, requeue, toast } = applyGrade(base(), 1)
    expect(state.ease).toBeCloseTo(2.3, 10)
    expect(state.ivl).toBe(5) // round(10 × 0.5)
    expect(state.due).toBe(0)
    expect(requeue).toBe(true)
    expect(toast).toMatch(/again/i)
  })

  it('2 Hard: ease −0.15, ivl ×1.2, due = ivl', () => {
    const { state, requeue } = applyGrade(base(), 2)
    expect(state.ease).toBeCloseTo(2.35, 10)
    expect(state.ivl).toBe(12) // round(10 × 1.2)
    expect(state.due).toBe(12)
    expect(requeue).toBe(false)
  })

  it('3 Good: ease unchanged, ivl ×ease, due = ivl', () => {
    const { state } = applyGrade(base(), 3)
    expect(state.ease).toBeCloseTo(2.5, 10)
    expect(state.ivl).toBe(25) // round(10 × 2.5)
    expect(state.due).toBe(25)
  })

  it('4 Easy: ease +0.1 first, then ivl ×ease×1.3', () => {
    const { state } = applyGrade(base(), 4)
    expect(state.ease).toBeCloseTo(2.6, 10)
    expect(state.ivl).toBe(34) // round(10 × 2.6 × 1.3) = round(33.8)
    expect(state.due).toBe(34)
  })

  it('appends one history entry with d:0 and the new interval', () => {
    const prev = base({ hist: [{ d: -7, g: 3, ivl: 6 }] })
    const { state } = applyGrade(prev, 3)
    expect(state.hist).toHaveLength(2)
    expect(state.hist[1]).toEqual({ d: 0, g: 3, ivl: 25 })
    expect(prev.hist).toHaveLength(1) // input not mutated
  })

  it('clamps ease to the 1.3 floor', () => {
    expect(applyGrade(base({ ease: 1.4 }), 1).state.ease).toBe(EASE_FLOOR)
    expect(applyGrade(base({ ease: 1.4 }), 2).state.ease).toBe(EASE_FLOOR)
  })

  it('honors interval floors (Again ≥ 1, Easy ≥ 2)', () => {
    expect(applyGrade(base({ ivl: 1 }), 1).state.ivl).toBe(1) // round(0.5)=1
    expect(applyGrade(base({ ivl: 1, ease: 1.3 }), 4).state.ivl).toBe(2) // round(1.69)=2 → ≥2
  })

  it('matches the seeded n2 note (ease 2.35, ivl 4) on Good', () => {
    const { state } = applyGrade(base({ ease: 2.35, ivl: 4, due: 0 }), 3)
    expect(state.ivl).toBe(9) // round(4 × 2.35) = round(9.4)
    expect(state.due).toBe(9)
  })
})

describe('previewInterval — grade-button hints', () => {
  it('Again is always "10 min"', () => {
    expect(previewInterval(base(), 1)).toBe('10 min')
  })
  it('Hard/Good/Easy hints', () => {
    const s = base({ ease: 2.5, ivl: 10 })
    expect(previewInterval(s, 2)).toBe('12d') // round(10 × 1.2)
    expect(previewInterval(s, 3)).toBe('25d') // round(10 × 2.5)
    expect(previewInterval(s, 4)).toBe('33d') // round(10 × 2.5 × 1.3) — current ease
  })
  it('Easy hint uses current ease, so it can read 1d under the real result', () => {
    const s = base({ ease: 2.5, ivl: 10 })
    expect(previewInterval(s, 4)).toBe('33d')
    expect(applyGrade(s, 4).state.ivl).toBe(34) // actual uses ease + 0.1
  })
})

describe('inkOpacity — the memory-fade function', () => {
  it('returns 1 when fade is off or the note is not in review', () => {
    expect(inkOpacity(base(), false)).toBe(1)
    expect(inkOpacity(null, true)).toBe(1)
    expect(inkOpacity(undefined, true)).toBe(1)
  })
  it('due notes (≤0) sit at 0.55', () => {
    expect(inkOpacity(base({ due: 0 }), true)).toBe(0.55)
    expect(inkOpacity(base({ due: -3 }), true)).toBe(0.55)
  })
  it('ramps 0.55 → 1 across the interval', () => {
    expect(inkOpacity(base({ due: 5, ivl: 10 }), true)).toBeCloseTo(0.775, 10)
    expect(inkOpacity(base({ due: 10, ivl: 10 }), true)).toBe(1) // clamped
    expect(inkOpacity(base({ due: 20, ivl: 10 }), true)).toBe(1)
  })
})

describe('labels & colors', () => {
  it('dueLabel', () => {
    expect(dueLabel(-2)).toBe('2d overdue')
    expect(dueLabel(0)).toBe('due today')
    expect(dueLabel(1)).toBe('tomorrow')
    expect(dueLabel(5)).toBe('in 5d')
  })
  it('isDue', () => {
    expect(isDue(base({ due: 0 }))).toBe(true)
    expect(isDue(base({ due: -1 }))).toBe(true)
    expect(isDue(base({ due: 1 }))).toBe(false)
  })
  it('gradeName / gradeColor', () => {
    expect(([1, 2, 3, 4] as const).map((g) => gradeName(g))).toEqual([
      'Again',
      'Hard',
      'Good',
      'Easy',
    ])
    expect(gradeColor(1)).toBe('var(--g1)')
    expect(gradeColor(3)).toBe('var(--ac)') // Good uses the primary accent
  })
})

describe('collection derivations', () => {
  const notes = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
    { id: 'e' },
  ] as Note[]
  const srs: Record<string, SrsState> = {
    a: base({ due: -2, ivl: 7 }),
    b: base({ due: 0, ivl: 4 }),
    c: base({ due: 5, ivl: 6 }),
    d: base({ due: 8, ivl: 9 }),
    // e: not in review
  }

  it('dueNotes: only due, most overdue first', () => {
    expect(dueNotes(notes, srs).map((n) => n.id)).toEqual(['a', 'b'])
  })
  it('forecastCounts: buckets by max(0, due) over 7 days', () => {
    // a,b → bucket 0 ; c → bucket 5 ; d (8) out of range ; e none
    expect(forecastCounts(notes, srs)).toEqual([2, 0, 0, 0, 0, 1, 0])
  })
  it('memoryBands: overdue / due now / this week / settled', () => {
    expect(memoryBands(notes, srs).map((b) => b.n)).toEqual([1, 1, 1, 1])
  })
})

describe('review stats from the ledger', () => {
  it('reviewTotal sums all days', () => {
    expect(reviewTotal({ 100: 2, 101: 3, 105: 1 })).toBe(6)
    expect(reviewTotal({})).toBe(0)
  })
  it('longestReviewStreak finds the longest consecutive run', () => {
    expect(longestReviewStreak({ 10: 1, 11: 2, 12: 1, 20: 1, 21: 1 })).toBe(3)
    expect(longestReviewStreak({ 5: 1 })).toBe(1)
    expect(longestReviewStreak({})).toBe(0)
  })
  it('reviewsLastWeek sums today..today-6 (inclusive)', () => {
    // today = 100: days 100, 99, 94 are in range; 93 (=100-7) is not.
    expect(reviewsLastWeek({ 100: 1, 99: 2, 94: 5, 93: 9 }, 100)).toBe(8)
  })
})
