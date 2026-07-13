import { describe, it, expect } from 'vitest';
import { relatedFor } from './bytesRelated';
import type { ByteCard } from './bytes';

const card = (id: string, over: Partial<ByteCard> = {}): ByteCard => ({
  id, updatedAt: 0, pack: 'p', topic: 'sql', level: 1, title: id, blurb: '', ...over,
});

describe('relatedFor', () => {
  it('finds the next level up in the same topic', () => {
    const a = card('a', { topic: 'sql', level: 1 });
    const b = card('b', { topic: 'sql', level: 2 });
    const other = card('c', { topic: 'ml', level: 2 });
    expect(relatedFor(a, [a, b, other]).deeper?.id).toBe('b');
  });

  it('connects cards that share vocabulary', () => {
    const a = card('a', { title: 'GROUP BY buckets rows', blurb: 'folds rows into groups by a key' });
    const b = card('b', { title: 'HAVING filters groups', blurb: 'filters grouped results after group by' });
    const far = card('c', { title: 'Correlation is not causation', blurb: 'two things moving together' });
    const rel = relatedFor(a, [a, b, far]);
    expect(rel.connects.map((c) => c.id)).toContain('b');
    expect(rel.connects.map((c) => c.id)).not.toContain('c');
  });

  it('is deterministic and never links a card to itself', () => {
    const cards = [
      card('a', { title: 'window function partition', blurb: 'partition by restarts the window' }),
      card('b', { title: 'partition window frame', blurb: 'the window partition frame' }),
    ];
    const r1 = relatedFor(cards[0], cards).connects.map((c) => c.id);
    const r2 = relatedFor(cards[0], cards).connects.map((c) => c.id);
    expect(r1).toEqual(r2);
    expect(r1).not.toContain('a');
  });

  it('returns empties when nothing is related', () => {
    const a = card('a', { topic: 'sql', level: 3, title: 'zeta', blurb: 'lone' });
    const b = card('b', { topic: 'ml', level: 1, title: 'omega', blurb: 'apart' });
    const rel = relatedFor(a, [a, b]);
    expect(rel.deeper).toBeNull();
    expect(rel.connects).toEqual([]);
  });
});
