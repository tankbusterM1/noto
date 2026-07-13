import { describe, it, expect } from 'vitest';
import { buildFeed } from './bytesFeed';
import { newMemory, see, review, type ByteMemory } from './bytesMemory';
import type { ByteCard } from './bytes';

const card = (id: string, topic = 'sql', over: Partial<ByteCard> = {}): ByteCard => ({
  id, updatedAt: 0, pack: 'p', topic, level: 1, title: id, blurb: '', ...over,
});
// a card whose code has a blank-able keyword, so a checkpoint can be generated
const quizCard = (id: string, topic = 'sql'): ByteCard =>
  card(id, topic, { title: 'GROUP BY buckets rows', code: 'SELECT dept FROM emp GROUP BY dept' });

const DAY = 100;

describe('buildFeed', () => {
  it('shows a brand-new card as a READ', () => {
    const feed = buildFeed([quizCard('a')], {}, DAY);
    expect(feed).toHaveLength(1);
    expect(feed[0].mode).toBe('read');
  });

  it('a graduated + due card with a question becomes a CHECKPOINT', () => {
    let m = newMemory('a', DAY);
    m = see(m, DAY); // 1
    m = see(m, DAY); // 2 → graduated
    m = { ...m, due: DAY }; // force due today
    const feed = buildFeed([quizCard('a')], { a: m }, DAY);
    expect(feed[0].mode).toBe('checkpoint');
    expect(feed[0].checkpoint?.answer).toBe('GROUP BY');
  });

  it('a graduated card with no question stays a READ', () => {
    let m = newMemory('a', DAY);
    m = see(m, DAY);
    m = see(m, DAY); // graduated
    m = { ...m, due: DAY };
    const noCode = card('a', 'stats', { title: 'Correlation is not causation', blurb: 'no code' });
    const feed = buildFeed([noCode], { a: m }, DAY);
    expect(feed[0].mode).toBe('read'); // never invents a junk question
  });

  it('excludes cards that are seen but not yet due', () => {
    const m: ByteMemory = { ...newMemory('a', DAY), sightings: 2, due: DAY + 5 };
    expect(buildFeed([card('a')], { a: m }, DAY)).toHaveLength(0);
  });

  it('ranks unseen ahead of a faded due card', () => {
    const faded: ByteMemory = { ...newMemory('old', 0), sightings: 3, due: DAY, last: 0, stability: 2 };
    const feed = buildFeed([card('old'), card('new')], { old: faded }, DAY, 10);
    expect(feed[0].card.id).toBe('new');
  });

  it('interleaves topics and respects the cap', () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => card('ml' + i, 'ml')),
      ...Array.from({ length: 6 }, (_, i) => card('sql' + i, 'sql')),
    ];
    const feed = buildFeed(cards, {}, DAY, 8);
    expect(feed).toHaveLength(8);
    let run = 1;
    for (let i = 1; i < feed.length; i++) {
      run = feed[i].card.topic === feed[i - 1].card.topic ? run + 1 : 1;
      expect(run).toBeLessThan(3);
    }
  });

  it('end-to-end: a card learns, then tests, then spaces out', () => {
    const c = quizCard('a');
    const memories: Record<string, ByteMemory> = {};
    let today = DAY;
    const modes: string[] = [];

    // Simulate a week of daily sessions; answer checkpoints correctly.
    for (let session = 0; session < 5; session++) {
      const feed = buildFeed([c], memories, today);
      if (!feed.length) { today += 1; continue; } // nothing due — skip a day
      const item = feed[0];
      modes.push(item.mode);
      const m = memories['a'] ?? newMemory('a', today);
      memories['a'] = item.mode === 'read' ? see(m, today) : review(m, 'good', today);
      today = memories['a'].due; // jump to when it's next due
    }

    // First two touches are reads (learning), then it graduates to checkpoints.
    expect(modes.slice(0, 2)).toEqual(['read', 'read']);
    expect(modes).toContain('checkpoint');
    // Spacing really expanded: the last due date is well beyond where we started.
    expect(memories['a'].due).toBeGreaterThan(DAY + 5);
  });
});
