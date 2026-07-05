import type { Grade, HistEntry, Note, SrsState } from './types'

/**
 * Noto's own note-level SRS scheduler (Anki-inspired). Reviews are
 * whole-note, not flashcards. This module is pure — no storage, no dates
 * beyond day offsets — so the interval math is unit-testable in isolation.
 * Every formula here is reproduced verbatim from README "SRS algorithm".
 */

export const EASE_FLOOR = 1.3
export const DEFAULT_EASE = 2.5

export interface GradeResult {
  /** New scheduling state, with the review appended to history (`d: 0`). */
  state: SrsState
  /** Grade 1 (Again) requeues the note later in the same session. */
  requeue: boolean
  toast: string
}

/**
 * Apply a grade (1 Again · 2 Hard · 3 Good · 4 Easy) to a note's SRS state.
 * `due` in the result is a day offset (0 = due today, `ivl` = due in ivl days).
 */
export function applyGrade(prev: SrsState, g: Grade): GradeResult {
  let ease = prev.ease
  let ivl = prev.ivl
  let due: number
  let requeue = false
  let toast: string

  if (g === 1) {
    ease = Math.max(EASE_FLOOR, ease - 0.2)
    ivl = Math.max(1, Math.round(ivl * 0.5))
    due = 0
    requeue = true
    toast = 'Again — queued for later this session'
  } else {
    if (g === 2) {
      ease = Math.max(EASE_FLOOR, ease - 0.15)
      ivl = Math.max(1, Math.round(ivl * 1.2))
    } else if (g === 3) {
      ivl = Math.max(1, Math.round(Math.max(ivl, 1) * ease))
    } else {
      // g === 4 (Easy): ease bumps first, then feeds the interval.
      ease = ease + 0.1
      ivl = Math.max(2, Math.round(Math.max(ivl, 1) * ease * 1.3))
    }
    due = ivl
    toast = 'Re-inked · next review in ' + ivl + 'd'
  }

  const entry: HistEntry = { d: 0, g, ivl }
  const state: SrsState = { ease, ivl, due, hist: [...prev.hist, entry] }
  return { state, requeue, toast }
}

/**
 * The predicted-next-interval hint shown on each grade button. Note the Easy
 * hint uses the *current* ease (not ease + 0.1), matching the prototype — it's
 * a deliberate approximation, so it can read one day short of the real result.
 */
export function previewInterval(srs: SrsState, g: Grade): string {
  if (g === 1) return '10 min'
  const e = srs.ease
  const i = Math.max(srs.ivl, 1)
  const n =
    g === 2
      ? Math.max(1, Math.round(i * 1.2))
      : g === 3
        ? Math.max(1, Math.round(i * e))
        : Math.max(2, Math.round(i * e * 1.3))
  return n + 'd'
}

/** A note is due when its offset has reached (or passed) today. */
export function isDue(srs: SrsState): boolean {
  return srs.due <= 0
}

/** Human label for a due offset. */
export function dueLabel(due: number): string {
  if (due < 0) return Math.abs(due) + 'd overdue'
  if (due === 0) return 'due today'
  if (due === 1) return 'tomorrow'
  return 'in ' + due + 'd'
}

/**
 * Ink opacity — the signature "memory fades as a note decays" metaphor.
 * Due (≤0) notes sit at 0.55; otherwise ink ramps back toward full as the
 * next review recedes. Returns 1 when fade is off or the note isn't in review.
 */
export function inkOpacity(
  srs: SrsState | null | undefined,
  inkFade: boolean,
): number {
  if (!inkFade || !srs) return 1
  if (srs.due <= 0) return 0.55
  return Math.min(1, 0.55 + 0.45 * (srs.due / Math.max(srs.ivl, 1)))
}

/** The little SRS status pill shown on note cards. */
export function srsPill(srs: SrsState | null | undefined): {
  label: string
  color: string
  bold: boolean
} {
  if (!srs) return { label: 'not in review', color: 'var(--ink3)', bold: false }
  if (srs.due <= 0)
    return { label: '◆ ' + dueLabel(srs.due), color: 'var(--am)', bold: true }
  return { label: '◇ review ' + dueLabel(srs.due), color: 'var(--ink3)', bold: false }
}

export function gradeName(g: Grade): string {
  return ['', 'Again', 'Hard', 'Good', 'Easy'][g]
}

export function gradeColor(g: Grade): string {
  return ['', 'var(--g1)', 'var(--g2)', 'var(--ac)', 'var(--g4)'][g]
}

// ── Collection-level derivations (forecast / band / due set) ──────────

/** In-review notes that are due, most overdue first. */
export function dueNotes(
  notes: Note[],
  srs: Record<string, SrsState>,
): Note[] {
  return notes
    .filter((n) => {
      const s = srs[n.id]
      return s && s.due <= 0
    })
    .sort((a, b) => srs[a.id].due - srs[b.id].due)
}

/** Counts of notes coming due over the next 7 days, bucketed by max(0, due). */
export function forecastCounts(
  notes: Note[],
  srs: Record<string, SrsState>,
): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const n of notes) {
    const s = srs[n.id]
    if (!s) continue
    const k = Math.max(0, s.due)
    if (k < 7) counts[k]++
  }
  return counts
}

/** Total reviews recorded across the ledger. */
export function reviewTotal(byDay: Record<number, number>): number {
  return Object.values(byDay).reduce((a, b) => a + b, 0)
}

/** Longest run of consecutive days that had at least one review. */
export function longestReviewStreak(byDay: Record<number, number>): number {
  const days = Object.keys(byDay)
    .map(Number)
    .filter((d) => byDay[d] > 0)
    .sort((a, b) => a - b)
  let longest = 0
  let cur = 0
  let prev: number | null = null
  for (const d of days) {
    cur = prev !== null && d === prev + 1 ? cur + 1 : 1
    longest = Math.max(longest, cur)
    prev = d
  }
  return longest
}

/** Reviews over the last 7 days (today + 6 back). */
export function reviewsLastWeek(byDay: Record<number, number>, todayEpochDay: number): number {
  let sum = 0
  for (let k = 0; k < 7; k++) sum += byDay[todayEpochDay - k] ?? 0
  return sum
}

export interface Band {
  name: string
  color: string
  n: number
}

/** Memory-health band segments: overdue / due now / this week / settled. */
export function memoryBands(
  notes: Note[],
  srs: Record<string, SrsState>,
): Band[] {
  const defs: { name: string; color: string; test: (d: number) => boolean }[] = [
    { name: 'overdue', color: 'var(--g1)', test: (d) => d < 0 },
    { name: 'due now', color: 'var(--am)', test: (d) => d === 0 },
    { name: 'this week', color: 'var(--ac)', test: (d) => d >= 1 && d <= 7 },
    { name: 'settled', color: 'var(--g4)', test: (d) => d > 7 },
  ]
  return defs.map((b) => ({
    name: b.name,
    color: b.color,
    n: notes.filter((x) => {
      const s = srs[x.id]
      return s && b.test(s.due)
    }).length,
  }))
}
