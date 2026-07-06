import type { Grade, HistEntry, SrsState } from './types'

/*
 * Adaptive scheduling — an FSRS-based memory model layered on the classic
 * engine (srs.ts). FSRS (Free Spaced Repetition Scheduler) models each note's
 * memory with two numbers:
 *
 *   difficulty D (1–10)  — how hard this note is for *you*
 *   stability  S (days)  — how long the memory holds before recall drops to 90%
 *
 * The update rules below are the FSRS v4 equations with the published default
 * weights `W`, which were machine-learned from ~700M real reviews — that's the
 * "ML" in the scheduler. On top of that, `calibration()` watches the user's own
 * review history: if they recall better than the 90% target, intervals stretch;
 * if they lapse more, intervals shrink. Together: each grade replays into the
 * model, the model predicts recall probability, and the next review lands where
 * predicted recall crosses the target.
 *
 * Pure module — day offsets only, no storage — so it's unit-testable like srs.ts.
 */

/** FSRS v4 default weights (w0–w16), learned from large-scale review data. */
export const W = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
  0.34, 1.26, 0.29, 2.61,
] as const

/** Target recall probability at review time (FSRS "request retention"). */
export const TARGET_RETENTION = 0.9
/** Scheduling bounds, in days. */
export const MIN_IVL = 1
export const MAX_IVL = 365

export interface Memory {
  /** Stability: days until predicted recall decays to 90%. */
  stab: number
  /** Difficulty 1–10. */
  diff: number
}

const clampD = (d: number) => Math.min(10, Math.max(1, d))

/** Initial difficulty after the first-ever grade. */
function initDifficulty(g: Grade): number {
  return clampD(W[4] - (g - 3) * W[5])
}

/** Memory state after the first-ever review of a note. */
export function initMemory(g: Grade): Memory {
  return { stab: W[g - 1], diff: initDifficulty(g) }
}

/**
 * Predicted recall probability after `elapsed` days at stability `stab`
 * (the FSRS forgetting curve; R(stab) = 0.9 by construction).
 */
export function retrievability(elapsed: number, stab: number): number {
  return Math.pow(1 + Math.max(0, elapsed) / (9 * Math.max(stab, 0.1)), -1)
}

/**
 * Update the memory model with one review: grade `g` given `elapsed` days
 * after the previous review. This is the FSRS v4 state transition.
 */
export function reviewMemory(mem: Memory, g: Grade, elapsed: number): Memory {
  const R = retrievability(elapsed, mem.stab)

  // Difficulty: move with the grade, then mean-revert toward "Good" difficulty.
  const moved = mem.diff - W[6] * (g - 3)
  const diff = clampD(W[7] * initDifficulty(3) + (1 - W[7]) * moved)

  let stab: number
  if (g === 1) {
    // Lapse: stability collapses (never above its prior value).
    stab = Math.min(
      mem.stab,
      W[11] *
        Math.pow(mem.diff, -W[12]) *
        (Math.pow(mem.stab + 1, W[13]) - 1) *
        Math.exp(W[14] * (1 - R)),
    )
  } else {
    // Successful recall: growth scales with surprise (low R = spaced further =
    // bigger boost), eased by difficulty; Hard is penalized, Easy boosted.
    const hard = g === 2 ? W[15] : 1
    const easy = g === 4 ? W[16] : 1
    const growth =
      Math.exp(W[8]) *
      (11 - mem.diff) *
      Math.pow(mem.stab, -W[9]) *
      (Math.exp(W[10] * (1 - R)) - 1) *
      hard *
      easy
    stab = mem.stab * (1 + growth)
  }
  return { stab: Math.max(0.1, stab), diff }
}

/**
 * Rebuild a note's memory state by replaying its entire review history
 * (offsets `d` ≤ 0, oldest first after sort). Null when never reviewed.
 */
export function replayMemory(hist: HistEntry[]): Memory | null {
  if (!hist.length) return null
  const sorted = hist.slice().sort((a, b) => a.d - b.d)
  let mem = initMemory(sorted[0].g)
  for (let i = 1; i < sorted.length; i++) {
    const elapsed = Math.max(0, sorted[i].d - sorted[i - 1].d)
    mem = reviewMemory(mem, sorted[i].g, elapsed)
  }
  return mem
}

/** Days until predicted recall drops to the target — the next interval. */
export function scheduleInterval(stab: number, factor = 1): number {
  // With the v4 curve, interval at 90% retention is exactly the stability.
  const days = 9 * stab * (1 / TARGET_RETENTION - 1) * factor
  return Math.min(MAX_IVL, Math.max(MIN_IVL, Math.round(days)))
}

export interface Calibration {
  /** Interval multiplier fitted to the user's own recall rate (≈1 = on target). */
  factor: number
  /** Reviews the estimate is based on. */
  n: number
  /** Observed success rate (grade ≥ 2) over those reviews. */
  success: number
}

/**
 * Personal calibration from the user's recent review history (most recent 50
 * reviews across all notes). Solves the forgetting curve for the time-scale
 * that would have made their observed recall hit the 90% target, then blends
 * toward neutral when the sample is small. Clamped so one bad week can't
 * swing the schedule wildly.
 */
export function calibration(allHist: HistEntry[]): Calibration {
  const recent = allHist
    .slice()
    .sort((a, b) => b.d - a.d)
    .slice(0, 50)
  const n = recent.length
  if (n === 0) return { factor: 1, n: 0, success: TARGET_RETENTION }
  const success = recent.filter((h) => h.g >= 2).length / n
  const p = Math.min(0.98, Math.max(0.6, success))
  // On the R(t) curve: scaling time by k changes recall from p to target when
  // k = (1/target − 1) / (1/p − 1).
  const raw = (1 / TARGET_RETENTION - 1) / (1 / p - 1)
  const clamped = Math.min(1.6, Math.max(0.6, raw))
  const factor = 1 + (clamped - 1) * Math.min(1, n / 40)
  return { factor, n, success }
}

/** Flatten every note's history for calibration. */
export function allHistory(srs: Record<string, SrsState>): HistEntry[] {
  const out: HistEntry[] = []
  for (const id in srs) out.push(...srs[id].hist)
  return out
}

/**
 * Predicted recall for a note *right now* (from its last review to today).
 * Null when the model has nothing to go on yet.
 */
export function recallNow(sr: SrsState): number | null {
  if (sr.stab === undefined || !sr.hist.length) return null
  const last = sr.hist[sr.hist.length - 1]
  return retrievability(Math.max(0, -last.d), sr.stab)
}

/** Memory state for a note: stored if present, else replayed from history. */
export function memoryOf(sr: SrsState): Memory | null {
  if (sr.stab !== undefined && sr.diff !== undefined)
    return { stab: sr.stab, diff: sr.diff }
  return replayMemory(sr.hist)
}

/**
 * The per-grade "next interval" hint for the session grade bar — what the
 * adaptive scheduler would actually do, not the classic formula.
 */
export function previewNext(sr: SrsState, g: Grade, factor: number): string {
  if (g === 1) return '10 min'
  const mem = memoryOf(sr)
  const last = sr.hist[sr.hist.length - 1]
  const elapsed = last ? Math.max(0, -last.d) : 0
  const next = mem ? reviewMemory(mem, g, elapsed) : initMemory(g)
  return scheduleInterval(next.stab, factor) + 'd'
}
