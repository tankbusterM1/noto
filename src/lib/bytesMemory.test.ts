import { describe, it, expect } from 'vitest';
import { newMemory, see, review, phase, strengthAt, isDue, strengthBand, GRADUATE_AT, type ByteMemory } from './bytesMemory';

const mem = (over: Partial<ByteMemory> = {}): ByteMemory => ({
  id: 'a', sightings: 0, stability: 10, difficulty: 3, due: 0, last: 0, streak: 0, lapses: 0, ...over,
});

describe('bytesMemory', () => {
  it('strength follows the forgetting curve', () => {
    expect(strengthAt(mem({ last: 5 }), 5)).toBeCloseTo(1, 5); // just seen
    expect(strengthAt(mem({ stability: 10, last: 0 }), 10)).toBeCloseTo(Math.exp(-1), 2); // ~0.37 at t=stability
    expect(strengthAt(mem({ stability: 10, last: 0 }), 40)).toBeLessThan(0.05); // long gone
  });

  it('learns first, then tests: phase flips only after GRADUATE_AT reads', () => {
    let m = newMemory('a', 0);
    expect(phase(m)).toBe('learning');
    for (let i = 0; i < GRADUATE_AT; i++) {
      expect(phase(m)).toBe('learning'); // still reading up to graduation
      m = see(m, m.due);
    }
    expect(phase(m)).toBe('review'); // now it may test you
  });

  it('a read (see) counts a sighting and never lapses', () => {
    const m = newMemory('a', 0);
    const s = see(m, 0);
    expect(s.sightings).toBe(1);
    expect(s.lapses).toBe(0);
    expect(s.stability).toBeGreaterThanOrEqual(m.stability);
  });

  it('a good review grows stability and pushes due out', () => {
    const m = mem({ sightings: 2, stability: 2 });
    const r = review(m, 'good', 1);
    expect(r.stability).toBeGreaterThan(m.stability);
    expect(r.due).toBeGreaterThan(1);
    expect(r.streak).toBe(1);
    expect(r.sightings).toBe(3);
  });

  it('again collapses stability, logs a lapse, resets the streak', () => {
    const m = review(mem({ sightings: 2, stability: 2 }), 'good', 1);
    const again = review(m, 'again', 2);
    expect(again.stability).toBeLessThan(m.stability);
    expect(again.lapses).toBe(1);
    expect(again.streak).toBe(0);
    expect(again.difficulty).toBeGreaterThan(m.difficulty);
  });

  it('spacing effect: recalling later (more forgotten) grows memory more', () => {
    const base = mem({ sightings: 2, stability: 10, last: 0 });
    const soon = review(base, 'good', 1); // strength still high
    const late = review(base, 'good', 8); // strength low
    expect(late.stability).toBeGreaterThan(soon.stability);
  });

  it('easy grows faster than good grows faster than hard', () => {
    const base = mem({ sightings: 2, stability: 1, last: 0 });
    const hard = review(base, 'hard', 1).stability;
    const good = review(base, 'good', 1).stability;
    const easy = review(base, 'easy', 1).stability;
    expect(easy).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(hard);
  });

  it('isDue flips once today reaches due', () => {
    const m = mem({ due: 3 });
    expect(isDue(m, 2)).toBe(false);
    expect(isDue(m, 3)).toBe(true);
  });

  it('strengthBand buckets for the meter', () => {
    expect(strengthBand(0.95)).toBe('fresh');
    expect(strengthBand(0.7)).toBe('solid');
    expect(strengthBand(0.4)).toBe('fading');
    expect(strengthBand(0.1)).toBe('cold');
  });

  it('repeated good reviews expand the interval (real spacing)', () => {
    let m = mem({ sightings: 2, stability: 1, due: 0, last: 0 });
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const day = m.due;
      m = review(m, 'good', day);
      intervals.push(m.due - day);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
  });
});
