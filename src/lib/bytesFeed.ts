/*
 * The Bytes feed — "what do I show next, and as a read or a test?". Pure and
 * shared, so both the logic and the mobile reader agree and it's testable
 * off-device. Ties the three pieces together:
 *   · bytesMemory — is a card new / due / graduated?
 *   · bytesQuiz   — can we make a checkpoint for it?
 * A card is a READ while it's still learning (or has no question to ask), and a
 * CHECKPOINT once it has graduated, is due, and a question can be generated.
 */
import type { ByteCard } from './bytes';
import { type ByteMemory, newMemory, phase, isDue, strengthAt } from './bytesMemory';
import { checkpointFor, type Checkpoint } from './bytesQuiz';

export interface FeedItem {
  card: ByteCard;
  mode: 'read' | 'checkpoint';
  /** Present only when mode === 'checkpoint'. */
  checkpoint: Checkpoint | null;
}

/**
 * Build today's finite feed: eligible cards (unseen, or due), ranked new-and-
 * weakest-first, interleaved by topic, each tagged read or checkpoint.
 */
export function buildFeed(
  cards: ByteCard[],
  memories: Record<string, ByteMemory>,
  today: number,
  size = 20,
): FeedItem[] {
  if (!cards.length) return [];

  const eligible = cards.filter((c) => {
    const m = memories[c.id];
    return !m || m.sightings === 0 || isDue(m, today);
  });
  if (!eligible.length) return [];

  // Unseen first; then the more faded a card's memory, the higher it ranks.
  const score = (c: ByteCard): number => {
    const m = memories[c.id];
    if (!m || m.sightings === 0) return 3;
    return 1 + (1 - strengthAt(m, today)); // 1..2 — weaker memory rises
  };
  const ranked = eligible.slice().sort((a, b) => score(b) - score(a));

  // Greedy topic interleave, so no long run of one subject.
  const out: ByteCard[] = [];
  const pool = ranked.slice();
  let lastTopic = '';
  while (out.length < size && pool.length) {
    let idx = pool.findIndex((c) => c.topic !== lastTopic);
    if (idx === -1) idx = 0;
    const [c] = pool.splice(idx, 1);
    out.push(c);
    lastTopic = c.topic;
  }

  return out.map((card) => {
    const m = memories[card.id] ?? newMemory(card.id, today);
    const cp = phase(m) === 'review' ? checkpointFor(card) : null;
    return { card, mode: cp ? 'checkpoint' : 'read', checkpoint: cp };
  });
}
