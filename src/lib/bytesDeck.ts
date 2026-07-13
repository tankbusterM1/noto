/*
 * The Bytes scheduler — "when to show what". Pure and shared, so it's testable
 * off-device and identical on both platforms. Deterministic: the same cards +
 * state + day always build the same deck, so a session is stable but tomorrow
 * differs. No model, no black box — just an explainable score.
 *
 * v2 — the feed now models three things it used to ignore:
 *   · Kept cards GRADUATE. Once you Keep a card it becomes a note in FSRS review,
 *     so it leaves the discovery feed instead of cluttering it forever.
 *   · Seen-but-unkept cards RESURFACE on a Leitner ladder (1→3→7→16→35 days),
 *     so something you glanced at but didn't bank comes back before you forget it
 *     — spaced reinforcement inside discovery, not "seen once, gone".
 *   · Difficulty RAMPS per topic. Keep a level-1 card and the feed starts aiming
 *     you at level 2 in that topic — a moving frontier, not a static ramp.
 */
import type { ByteCard } from './bytes';

export interface ByteState {
  seen: boolean;
  kept: boolean;
  /** epoch ms of the last time it was shown */
  seenAt: number;
  /** how many times it's been shown — drives the spacing ladder. Optional for
   *  back-compat with state written before v2 (treated as 1 when seen). */
  seenCount?: number;
}

const DAY_MS = 86_400_000;

/**
 * Leitner-style expanding intervals (in days) for re-surfacing a card you saw
 * but didn't Keep. Each further sighting without a Keep waits longer before the
 * card is due again — the classic spaced-repetition curve.
 */
const LADDER = [1, 3, 7, 16, 35];

/** Deterministic 0..1 from a string (FNV-1a). Day-seeded jitter for stable variety. */
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const clampLevel = (l: number): number => Math.min(Math.max(l, 1), 3);
const seenCountOf = (st: ByteState | undefined): number => st?.seenCount ?? (st?.seen ? 1 : 0);

/** Whole days since a card was last shown; Infinity if it never was. */
function daysSince(st: ByteState | undefined, dayEpoch: number): number {
  return st?.seenAt ? dayEpoch - Math.floor(st.seenAt / DAY_MS) : Infinity;
}

/** A seen-but-unkept card is due to resurface once its ladder interval elapses. */
function dueForResurface(st: ByteState | undefined, dayEpoch: number): boolean {
  const interval = LADDER[Math.min(seenCountOf(st) - 1, LADDER.length - 1)];
  return daysSince(st, dayEpoch) >= interval;
}

/**
 * Is a card eligible for today's discovery feed? Unseen cards always are; a card
 * you Kept has graduated to spaced review and leaves; a seen-but-unkept card
 * returns only when its spacing interval is up.
 */
export function isEligible(c: ByteCard, state: Record<string, ByteState>, dayEpoch: number): boolean {
  const st = state[c.id];
  if (!st?.seen) return true;
  if (st.kept) return false;
  return dueForResurface(st, dayEpoch);
}

export interface DeckContext {
  /** 0..1 — a topic's keep-rate inverted, so weak topics rise. Unseen topic = 1. */
  weakness: (topic: string) => number;
  /** 1..3 — the level to aim for in a topic, one above the highest you've kept. */
  frontier: (topic: string) => number;
}

/** The explainable per-card score. Higher sorts earlier. */
export function scoreCard(c: ByteCard, state: Record<string, ByteState>, ctx: DeckContext, dayEpoch: number): number {
  const st = state[c.id];

  // 1. Discovery. Brand-new leads; a due resurfacing card still earns its place.
  //    (Kept cards are filtered out before scoring, so `seen` here means unkept.)
  const discovery = !st?.seen ? 3.0 : 1.8;

  // 2. Weak topics rise.
  const weak = 1.6 * ctx.weakness(c.topic);

  // 3. Level frontier — cards near your current depth in the topic score highest;
  //    ones two levels off fall to zero.
  const fit = 1.0 * Math.max(0, 1 - Math.abs(clampLevel(c.level) - ctx.frontier(c.topic)) / 2);

  // 4. Stable day-seeded jitter for variety without churn.
  const jit = 0.35 * hash01(`${c.id}:${dayEpoch}`);

  return discovery + weak + fit + jit;
}

/**
 * Build today's finite deck. Filters to eligible cards (novelty + spacing),
 * ranks by score, then interleaves topics so you never get a long run of one
 * subject.
 */
export function buildDeck(cards: ByteCard[], state: Record<string, ByteState>, dayEpoch: number, size = 20): ByteCard[] {
  if (!cards.length) return [];

  // Per-topic stats over what's been SEEN: keep-rate → weakness, and the highest
  // level you've KEPT → your frontier (difficulty ramps as you bank cards).
  const per: Record<string, { seen: number; kept: number; keptMaxLevel: number }> = {};
  for (const c of cards) {
    const st = state[c.id];
    if (!st?.seen) continue;
    const t = (per[c.topic] ??= { seen: 0, kept: 0, keptMaxLevel: 0 });
    t.seen++;
    if (st.kept) {
      t.kept++;
      t.keptMaxLevel = Math.max(t.keptMaxLevel, clampLevel(c.level));
    }
  }
  const ctx: DeckContext = {
    weakness: (topic) => {
      const t = per[topic];
      if (!t || t.seen === 0) return 1; // untouched topic — wanted
      return 1 - t.kept / t.seen; // low keep-rate → weak → shown more
    },
    frontier: (topic) => {
      const t = per[topic];
      if (!t || t.kept === 0) return 1; // nothing kept yet — start at basics
      return Math.min(t.keptMaxLevel + 1, 3); // keep a level, aim one higher
    },
  };

  const eligible = cards.filter((c) => isEligible(c, state, dayEpoch));
  if (!eligible.length) return [];

  const ranked = eligible.slice().sort((a, b) => scoreCard(b, state, ctx, dayEpoch) - scoreCard(a, state, ctx, dayEpoch));

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
