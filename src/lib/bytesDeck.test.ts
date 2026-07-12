import { describe, it, expect } from 'vitest';
import { buildDeck, type ByteState } from './bytesDeck';
import type { ByteCard } from './bytes';

const card = (id: string, topic: string, level = 1): ByteCard => ({
  id, updatedAt: 0, pack: 'p', topic, level, title: id, blurb: '',
});

const DAY = 20000; // arbitrary epoch-day
const seen = (kept = false, seenAt = 0): ByteState => ({ seen: true, kept, seenAt });

describe('buildDeck', () => {
  it('is finite and never exceeds the cap', () => {
    const cards = Array.from({ length: 60 }, (_, i) => card('c' + i, ['ml', 'sql', 'py'][i % 3]));
    expect(buildDeck(cards, {}, DAY, 20)).toHaveLength(20);
    expect(buildDeck(cards, {}, DAY, 5)).toHaveLength(5);
  });

  it('puts unseen cards ahead of seen ones', () => {
    const cards = [card('seen1', 'ml'), card('fresh', 'ml'), card('seen2', 'ml')];
    const state: Record<string, ByteState> = { seen1: seen(true, 0), seen2: seen(true, 0) };
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
});
