import { describe, it, expect } from 'vitest';
import { composeNotify, variationCount, NOTIFY_MODE_INFO, NOTIFY_HOURS, type NotifyCtx } from './notify';

const ctx = (over: Partial<NotifyCtx> = {}): NotifyCtx => ({ name: 'Alex', due: 3, todos: 2, streak: 7, ...over });

describe('notify', () => {
  it('ships well over 100 variations', () => {
    expect(variationCount()).toBeGreaterThanOrEqual(100);
  });

  it('fills every placeholder — output never leaks a {token}', () => {
    for (const mode of ['normal', 'high', 'obsessed'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const { title, body } = composeNotify(mode, ctx(), seed);
        expect(title, `${mode}#${seed} title`).not.toMatch(/\{/);
        expect(body, `${mode}#${seed} body`).not.toMatch(/\{/);
        expect(body.length).toBeGreaterThan(0);
      }
    }
  });

  it('never says a count when nothing is pending', () => {
    const empty = ctx({ due: 0, todos: 0 });
    for (const mode of ['normal', 'high', 'obsessed'] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const { body } = composeNotify(mode, empty, seed);
        // no "0 reviews", "0 things", etc. — count-lines are filtered out
        expect(body, `${mode}#${seed}`).not.toMatch(/\b0\b/);
      }
    }
  });

  it('uses the name, and falls back gracefully when unset', () => {
    // across seeds at least one line uses the name
    const named = Array.from({ length: 60 }, (_, s) => composeNotify('normal', ctx({ name: 'Zoe' }), s).body);
    expect(named.some((b) => b.includes('Zoe'))).toBe(true);
    // empty name → the friendly stand-in, never an empty gap or a stray brace
    for (let s = 0; s < 60; s++) {
      const anon = composeNotify('obsessed', ctx({ name: '   ' }), s);
      expect(anon.body).not.toMatch(/\{/);
      expect(anon.body.includes('  ')).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = composeNotify('high', ctx(), 42);
    const b = composeNotify('high', ctx(), 42);
    expect(a).toEqual(b);
  });

  it('each mode has a distinct frequency + a description', () => {
    expect(NOTIFY_HOURS.normal.length).toBeLessThan(NOTIFY_HOURS.high.length);
    expect(NOTIFY_HOURS.high.length).toBeLessThan(NOTIFY_HOURS.obsessed.length);
    expect(NOTIFY_MODE_INFO.map((m) => m.key)).toEqual(['off', 'normal', 'high', 'obsessed']);
  });
});
