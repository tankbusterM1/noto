/*
 * The Bytes scheduler — "when to show what". Pure and shared, so it's testable
 * off-device and identical on both platforms. Deterministic: the same cards +
 * state + day always build the same deck, so a session is stable but tomorrow
 * differs. No model, no black box — just an explainable score.
 */
import type { ByteCard } from './bytes';

export interface ByteState {
  seen: boolean;
  kept: boolean;
  /** epoch ms of the last time it was shown */
  seenAt: number;
}

const DAY_MS = 86_400_000;

/** Deterministic 0..1 from a string (FNV-1a). Day-seeded jitter for stable variety. */
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function scoreCard(c: ByteCard, state: Record<string, ByteState>, weakness: (t: string) => number, dayEpoch: number): number {
  const st = state[c.id];
  let s = 0;
  if (!st?.seen) s += 3; // unseen first
  s += 1.6 * weakness(c.topic); // weak topics rise
  s += 0.8 * ((3 - Math.min(Math.max(c.level, 1), 3)) / 2); // level ramp: 1 before 2 before 3
  if (st?.seenAt && dayEpoch - Math.floor(st.seenAt / DAY_MS) < 3) s -= 2; // shown in the last 3 days
  s += 0.3 * hash01(`${c.id}:${dayEpoch}`); // stable day-seeded jitter
  return s;
}

/**
 * Build today's finite deck. Ranks by score, then interleaves topics so you
 * never get a long run of one subject.
 */
export function buildDeck(cards: ByteCard[], state: Record<string, ByteState>, dayEpoch: number, size = 20): ByteCard[] {
  if (!cards.length) return [];

  // Per-topic keep-rate → weakness. An unseen topic is "wanted" (weakness 1).
  const per: Record<string, { seen: number; kept: number }> = {};
  for (const c of cards) {
    const st = state[c.id];
    if (!st?.seen) continue;
    const t = (per[c.topic] ??= { seen: 0, kept: 0 });
    t.seen++;
    if (st.kept) t.kept++;
  }
  const weakness = (topic: string): number => {
    const t = per[topic];
    if (!t || t.seen === 0) return 1;
    return 1 - t.kept / t.seen; // low keep-rate → weak → shown more
  };

  const ranked = cards.slice().sort((a, b) => scoreCard(b, state, weakness, dayEpoch) - scoreCard(a, state, weakness, dayEpoch));

  // Greedy interleave: take the highest-ranked card whose topic differs from the
  // last one placed; fall back to the top of the pool when every remainder matches.
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
  return out;
}
