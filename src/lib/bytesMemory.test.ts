import { describe, it, expect } from 'vitest';
import { firstSight, review, reread, strengthAt, isDue, strengthBand, type ByteMemory } from './bytesMemory';

const mem = (over: Partial<ByteMemory> = {}): ByteMemory => ({
  id: 'a', stability: 10, difficulty: 3, due: 0, last: 0, streak: 1, lapses: 0, ...over,
});

describe('bytesMemory', () => {
  it('strength follows the forgetting curve', () => {
    expect(strengthAt(mem({ last: 5 }), 5)).toBeCloseTo(1, 5); // just seen
    expect(strengthAt(mem({ stability: 10, last: 0 }), 10)).toBeCloseTo(Math.exp(-1), 2); // ~0.37 at t=stability
    expect(strengthAt(mem({ stability: 10, last: 0 }), 40)).toBeLessThan(0.05); // long gone
  });

  it('a good review grows stability and pushes due out', () => {
    const m = firstSight('a', 0);
    const r = review(m, 'good', 1);
    expect(r.stability).toBeGreaterThan(m.stability);
    expect(r.due).toBeGreaterThan(1);
    expect(r.streak).toBe(1);
    expect(r.lapses).toBe(0);
  });

  it('again collapses stability, logs a lapse, resets the streak', () => {
    const m = review(firstSight('a', 0), 'good', 1);
    const again = review(m, 'again', 2);
    expect(again.stability).toBeLessThan(m.stability);
    expect(again.lapses).toBe(1);
    expect(again.streak).toBe(0);
    expect(again.difficulty).toBeGreaterThan(m.difficulty);
  });

  it('spacing effect: recalling later (more forgotten) grows memory more', () => {
    const base = mem({ stability: 10, last: 0 });
    const soon = review(base, 'good', 1); // strength still high
    const late = review(base, 'good', 8); // strength low
    expect(late.stability).toBeGreaterThan(soon.stability);
  });

  it('easy grows faster than good grows faster than hard', () => {
    const base = firstSight('a', 0);
    const hard = review(base, 'hard', 1).stability;
    const good = review(base, 'good', 1).stability;
    const easy = review(base, 'easy', 1).stability;
    expect(easy).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(hard);
  });

  it('isDue flips once today reaches due', () => {
    const m = firstSight('a', 0); // due tomorrow
    expect(isDue(m, 0)).toBe(false);
    expect(isDue(m, 1)).toBe(true);
  });

  it('reread nudges stability without a lapse', () => {
    const m = firstSight('a', 0);
    const rr = reread(m, 0);
    expect(rr.stability).toBeGreaterThanOrEqual(m.stability);
    expect(rr.lapses).toBe(m.lapses);
    expect(rr.streak).toBe(m.streak);
  });

  it('strengthBand buckets for the meter', () => {
    expect(strengthBand(0.95)).toBe('fresh');
    expect(strengthBand(0.7)).toBe('solid');
    expect(strengthBand(0.4)).toBe('fading');
    expect(strengthBand(0.1)).toBe('cold');
  });

  it('repeated good reviews expand the interval (real spacing)', () => {
    let m = firstSight('a', 0);
    const intervals: number[] = [];
    let day = 0;
    for (let i = 0; i < 4; i++) {
      day = m.due;
      m = review(m, 'good', day);
      intervals.push(m.due - day);
    }
    // each successful review should schedule the next one further out
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
  });
});
