/*
 * The Bytes memory model — a self-contained, explainable spaced-repetition
 * engine for the learning reel. Bytes are their OWN world: a card never becomes
 * a note, and this scheduling is entirely separate from the notes' FSRS.
 *
 * Grounded in the forgetting curve — memory strength decays as
 *   strength(t) = exp(-elapsed / stability)
 * Each successful retrieval lengthens `stability` (the spacing effect), and the
 * boost is larger when you'd mostly forgotten the card (desirable difficulty);
 * a miss collapses it. `due` is the day strength is predicted to fall to the
 * review threshold. Pure + deterministic → fully testable off-device, and the
 * same "strength" value drives the on-card memory meter.
 */

export interface ByteMemory {
  id: string;
  /** Days for strength to decay to ~1/e (37%). Grows as you remember it. */
  stability: number;
  /** 1..5 — intrinsic hardness; higher grows stability more slowly. */
  difficulty: number;
  /** Epoch day this card is next due for retrieval. */
  due: number;
  /** Epoch day of the last touch (read or retrieval). */
  last: number;
  /** Correct retrievals in a row (resets to 0 on a miss). */
  streak: number;
  /** Lifetime misses — feeds the "weak spots" shelf. */
  lapses: number;
}

/** A retrieval outcome. `again` = missed; the rest are increasing confidence. */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

const MIN_STABILITY = 0.5; // half-a-day floor, so nothing is due "yesterday"
const RECALL_THRESHOLD = 0.5; // schedule the next review near 50% strength
/** −ln(threshold): converts a stability into a days-to-threshold interval. */
const DECAY = -Math.log(RECALL_THRESHOLD); // ≈ 0.693

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/** Current memory strength (retrievability), 0..1 — this is the meter value. */
export function strengthAt(m: ByteMemory, today: number): number {
  const elapsed = Math.max(0, today - m.last);
  return Math.exp(-elapsed / Math.max(m.stability, MIN_STABILITY));
}

/** Days until strength decays to the review threshold. */
function intervalFrom(stability: number): number {
  return Math.max(1, Math.round(DECAY * stability));
}

export function isDue(m: ByteMemory, today: number): boolean {
  return today >= m.due;
}

/** First encounter — a read, not yet retrieved. Weak, and due tomorrow. */
export function firstSight(id: string, today: number): ByteMemory {
  return { id, stability: 1, difficulty: 3, due: today + 1, last: today, streak: 0, lapses: 0 };
}

/**
 * Apply a retrieval outcome. A correct answer multiplies stability by a factor
 * that grows with how much you'd forgotten (1 + (1 − strength)); a miss collapses
 * stability and bumps difficulty. Difficulty gently eases toward the middle so a
 * card doesn't get stuck hard or trivial forever.
 */
export function review(m: ByteMemory, g: Grade, today: number): ByteMemory {
  const r = strengthAt(m, today); // how well you still held it, before this answer
  let { stability, difficulty, streak, lapses } = m;

  if (g === 'again') {
    lapses += 1;
    streak = 0;
    difficulty = clamp(difficulty + 1, 1, 5);
    stability = Math.max(MIN_STABILITY, stability * 0.4); // collapse — see it again soon
  } else {
    streak += 1;
    difficulty = clamp(difficulty + (g === 'hard' ? 0.15 : g === 'easy' ? -0.3 : -0.05), 1, 5);
    const gradeMult = g === 'hard' ? 1.2 : g === 'good' ? 1.7 : 2.6;
    const forgetBonus = 1 + (1 - r); // 1..2 — bigger when you'd forgotten more
    const easeMod = 1.1 - (difficulty - 3) * 0.12; // harder cards grow slower
    stability = Math.max(MIN_STABILITY, stability * gradeMult * forgetBonus * easeMod);
  }

  return { ...m, stability, difficulty, streak, lapses, last: today, due: today + intervalFrom(stability) };
}

/** A passive re-read (no retrieval) — a gentle nudge, never a lapse. */
export function reread(m: ByteMemory, today: number): ByteMemory {
  const stability = Math.max(m.stability, m.stability * 1.1);
  return { ...m, stability, last: today, due: today + intervalFrom(stability) };
}

/** Bucketed strength for the meter UI, so a card reads at a glance. */
export function strengthBand(strength: number): 'fresh' | 'solid' | 'fading' | 'cold' {
  if (strength >= 0.85) return 'fresh';
  if (strength >= 0.6) return 'solid';
  if (strength >= 0.3) return 'fading';
  return 'cold';
}
