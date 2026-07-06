import { describe, it, expect } from 'vitest'
import {
  W,
  initMemory,
  reviewMemory,
  replayMemory,
  retrievability,
  scheduleInterval,
  calibration,
  recallNow,
  previewNext,
} from './adaptive'
import type { Grade, HistEntry, SrsState } from './types'

const h = (d: number, g: Grade): HistEntry => ({ d, g, ivl: 1 })

describe('initMemory (first review)', () => {
  it('orders initial stability Again < Hard < Good < Easy', () => {
    const s = ([1, 2, 3, 4] as Grade[]).map((g) => initMemory(g).stab)
    expect(s).toEqual([W[0], W[1], W[2], W[3]])
    expect(s[0]).toBeLessThan(s[1])
    expect(s[1]).toBeLessThan(s[2])
    expect(s[2]).toBeLessThan(s[3])
  })

  it('orders initial difficulty Again > Good > Easy, clamped to [1,10]', () => {
    const d = ([1, 2, 3, 4] as Grade[]).map((g) => initMemory(g).diff)
    expect(d[0]).toBeGreaterThan(d[2])
    expect(d[2]).toBeGreaterThan(d[3])
    d.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(1)
      expect(x).toBeLessThanOrEqual(10)
    })
  })
})

describe('retrievability (forgetting curve)', () => {
  it('starts at 1 and decays with time', () => {
    expect(retrievability(0, 2.4)).toBe(1)
    expect(retrievability(1, 2.4)).toBeGreaterThan(retrievability(5, 2.4))
  })

  it('hits ~90% exactly at t = stability (the curve definition)', () => {
    expect(retrievability(2.4, 2.4)).toBeCloseTo(0.9, 6)
    expect(retrievability(30, 30)).toBeCloseTo(0.9, 6)
  })
})

describe('reviewMemory (FSRS state transition)', () => {
  const mem = { stab: 5, diff: 5 }

  it('successful recall grows stability: Easy > Good > Hard', () => {
    const [hard, good, easy] = ([2, 3, 4] as Grade[]).map(
      (g) => reviewMemory(mem, g, 5).stab,
    )
    expect(good).toBeGreaterThan(mem.stab)
    expect(easy).toBeGreaterThan(good)
    expect(good).toBeGreaterThan(hard)
  })

  it('a same-day re-review (elapsed 0) does not inflate stability', () => {
    const next = reviewMemory(mem, 3, 0)
    expect(next.stab).toBeCloseTo(mem.stab, 6)
  })

  it('a lapse collapses stability and raises difficulty', () => {
    const next = reviewMemory(mem, 1, 5)
    expect(next.stab).toBeLessThan(mem.stab)
    expect(next.diff).toBeGreaterThan(mem.diff)
  })

  it('Easy lowers difficulty', () => {
    expect(reviewMemory(mem, 4, 5).diff).toBeLessThan(mem.diff)
  })

  it('difficulty stays clamped to [1,10] at the extremes', () => {
    let d10 = { stab: 1, diff: 10 }
    for (let i = 0; i < 10; i++) d10 = reviewMemory(d10, 1, 1)
    expect(d10.diff).toBeLessThanOrEqual(10)
    let d1 = { stab: 1, diff: 1 }
    for (let i = 0; i < 10; i++) d1 = reviewMemory(d1, 4, 1)
    expect(d1.diff).toBeGreaterThanOrEqual(1)
  })
})

describe('replayMemory (history → memory state)', () => {
  it('returns null for an empty history', () => {
    expect(replayMemory([])).toBeNull()
  })

  it('matches a manual sequential fold', () => {
    const hist = [h(-10, 3), h(-4, 3), h(0, 4)]
    const manual = reviewMemory(reviewMemory(initMemory(3), 3, 6), 4, 4)
    expect(replayMemory(hist)).toEqual(manual)
  })

  it('sorts unordered history before replaying', () => {
    const shuffled = [h(0, 4), h(-10, 3), h(-4, 3)]
    expect(replayMemory(shuffled)).toEqual(replayMemory([h(-10, 3), h(-4, 3), h(0, 4)]))
  })
})

describe('scheduleInterval', () => {
  it('equals stability (rounded) at the 90% retention target', () => {
    expect(scheduleInterval(2.4)).toBe(2)
    expect(scheduleInterval(14.6)).toBe(15)
  })

  it('applies the personal factor and clamps to [1, 365]', () => {
    expect(scheduleInterval(10, 1.5)).toBe(15)
    expect(scheduleInterval(0.2)).toBe(1)
    expect(scheduleInterval(9999)).toBe(365)
  })
})

describe('calibration (learns from the user’s history)', () => {
  const run = (n: number, successEvery: number) =>
    calibration(
      Array.from({ length: n }, (_, i) =>
        h(-i, i % successEvery === 0 ? 1 : (3 as Grade)),
      ),
    )

  it('is neutral with no history', () => {
    expect(calibration([]).factor).toBe(1)
  })

  it('is ~neutral at exactly the 90% target', () => {
    // 45 successes, 5 lapses out of 50 = 90%
    const hist = Array.from({ length: 50 }, (_, i) => h(-i, i < 5 ? 1 : (3 as Grade)))
    expect(calibration(hist).factor).toBeCloseTo(1, 5)
  })

  it('stretches intervals when the user recalls better than target', () => {
    const allGood = Array.from({ length: 50 }, (_, i) => h(-i, 3 as Grade))
    const c = calibration(allGood)
    expect(c.success).toBe(1)
    expect(c.factor).toBeGreaterThan(1.4)
    expect(c.factor).toBeLessThanOrEqual(1.6)
  })

  it('shrinks intervals when the user lapses a lot', () => {
    const c = run(50, 2) // every other review is a lapse
    expect(c.factor).toBeLessThan(1)
    expect(c.factor).toBeGreaterThanOrEqual(0.6)
  })

  it('blends toward neutral on a small sample', () => {
    const four = Array.from({ length: 4 }, (_, i) => h(-i, 3 as Grade))
    const c = calibration(four)
    expect(c.factor).toBeGreaterThan(1)
    expect(c.factor).toBeLessThan(1.1)
  })
})

describe('recallNow + previewNext (UI surfaces)', () => {
  const sr: SrsState = {
    ease: 2.5,
    ivl: 2,
    due: 0,
    hist: [h(-2, 3)],
    stab: 2.4,
    diff: 4.93,
  }

  it('predicts recall from the last review to today', () => {
    // 2 days elapsed at stab 2.4: (1 + 2/21.6)^-1 ≈ 0.915
    expect(recallNow(sr)!).toBeCloseTo(0.915, 2)
  })

  it('returns null when the model has no data yet', () => {
    expect(recallNow({ ease: 2.5, ivl: 1, due: 1, hist: [] })).toBeNull()
  })

  it('previews "10 min" for Again and adaptive days otherwise', () => {
    expect(previewNext(sr, 1, 1)).toBe('10 min')
    expect(previewNext(sr, 3, 1)).toMatch(/^\d+d$/)
    // a fresh note falls back to first-review stability (Good = 2.4d → "2d")
    expect(previewNext({ ease: 2.5, ivl: 1, due: 0, hist: [] }, 3, 1)).toBe('2d')
  })

  it('grade ordering carries through to the previewed interval', () => {
    const days = (g: Grade) => parseInt(previewNext(sr, g, 1), 10)
    expect(days(4)).toBeGreaterThan(days(3))
    expect(days(3)).toBeGreaterThan(days(2))
  })
})
