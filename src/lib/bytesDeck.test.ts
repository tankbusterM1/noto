import { describe, it, expect } from 'vitest';
import { buildDeck, isEligible, type ByteState } from './bytesDeck';
import type { ByteCard } from './bytes';

const card = (id: string, topic: string, level = 1): ByteCard => ({
  id, updatedAt: 0, pack: 'p', topic, level, title: id, blurb: '',
});

const DAY_MS = 86_400_000;
const DAY = 20000; // arbitrary epoch-day
const atDay = (d: number): number => d * DAY_MS;
/** Seen `ago` days before DAY, unkept by default, shown `count` times. */
const seen = ({ kept = false, ago = 0, count = 1 }: { kept?: boolean; ago?: number; count?: number } = {}): ByteState => ({
  seen: true,
  kept,
  seenAt: atDay(DAY - ago),
  seenCount: count,
});

describe('buildDeck', () => {
  it('is finite and never exceeds the cap', () => {
    const cards = Array.from({ length: 60 }, (_, i) => card('c' + i, ['ml', 'sql', 'py'][i % 3]));
    expect(buildDeck(cards, {}, DAY, 20)).toHaveLength(20);
    expect(buildDeck(cards, {}, DAY, 5)).toHaveLength(5);
  });

  it('puts unseen cards ahead of seen-but-due ones', () => {
    const cards = [card('seen1', 'ml'), card('fresh', 'ml'), card('seen2', 'ml')];
    const state: Record<string, ByteState> = { seen1: seen({ ago: 10 }), seen2: seen({ ago: 10 }) };
    const deck = buildDeck(cards, state, DAY, 10);
    expect(deck[0].id).toBe('fresh');
  });

  it('interleaves topics — no 3-in-a-row when other topics remain', () => {
    const cards = [
      ...Array.from({ length: 5 }, (_, i) => card('ml' + i, 'ml')),
      ...Array.from({ length: 5 }, (_, i) => card('sql' + i, 'sql')),
    ];
    const deck = buildDeck(cards, {}, DAY, 10);
    let run = 1;
    for (let i = 1; i < deck.length; i++) {
      run = deck[i].topic === deck[i - 1].topic ? run + 1 : 1;
      expect(run).toBeLessThan(3);
    }
  });

  it('is deterministic — same input, same deck', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card('c' + i, ['ml', 'sql', 'py', 'stats'][i % 4], (i % 3) + 1));
    const a = buildDeck(cards, {}, DAY, 20).map((c) => c.id);
    const b = buildDeck(cards, {}, DAY, 20).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('a different day reshuffles otherwise-equal cards', () => {
    // Same topic + level + unseen → order is pure day-seeded jitter.
    const cards = Array.from({ length: 20 }, (_, i) => card('c' + i, 'ml', 1));
    const d1 = buildDeck(cards, {}, DAY, 20).map((c) => c.id);
    const d2 = buildDeck(cards, {}, DAY + 7, 20).map((c) => c.id);
    expect(d1).not.toEqual(d2);
  });

  it('empty deck for no cards', () => {
    expect(buildDeck([], {}, DAY)).toEqual([]);
  });

  // ── v2: graduation, spacing, frontier ──────────────────────────────────
  it('kept cards leave the discovery feed (they graduate to review)', () => {
    const cards = [card('a', 'ml'), card('b', 'ml')];
    const deck = buildDeck(cards, { a: seen({ kept: true }) }, DAY, 10);
    expect(deck.map((c) => c.id)).toEqual(['b']);
  });

  it('a seen-but-unkept card resurfaces only after its spacing interval', () => {
    const cards = [card('x', 'ml')];
    // seenCount 1 → ladder interval 1 day.
    expect(buildDeck(cards, { x: seen({ ago: 0, count: 1 }) }, DAY, 10)).toHaveLength(0); // 0 < 1
    expect(buildDeck(cards, { x: seen({ ago: 2, count: 1 }) }, DAY, 10).map((c) => c.id)).toEqual(['x']); // 2 ≥ 1
  });

  it('the spacing ladder widens with each unkept sighting', () => {
    const cards = [card('x', 'ml')];
    // seenCount 3 → ladder interval LADDER[2] = 7 days.
    expect(buildDeck(cards, { x: seen({ ago: 5, count: 3 }) }, DAY, 10)).toHaveLength(0); // 5 < 7
    expect(buildDeck(cards, { x: seen({ ago: 8, count: 3 }) }, DAY, 10)).toHaveLength(1); // 8 ≥ 7
  });

  it('difficulty frontier ramps to the next level once you keep one', () => {
    const cards = [card('l1', 'sql', 1), card('l2', 'sql', 2), card('l3', 'sql', 3), card('k1', 'sql', 1)];
    // Keeping a level-1 sql card pushes the sql frontier to 2, so the unseen
    // level-2 card should outrank the level-3 one.
    const deck = buildDeck(cards, { k1: seen({ kept: true }) }, DAY, 10).map((c) => c.id);
    expect(deck).not.toContain('k1'); // graduated
    expect(deck.indexOf('l2')).toBeLessThan(deck.indexOf('l3'));
  });

  it('back-compat: state without seenCount is treated as seen once', () => {
    const cards = [card('x', 'ml')];
    const legacy: Record<string, ByteState> = { x: { seen: true, kept: false, seenAt: atDay(DAY - 2) } };
    expect(isEligible(cards[0], legacy, DAY)).toBe(true); // 2 days ≥ interval 1
  });
});
