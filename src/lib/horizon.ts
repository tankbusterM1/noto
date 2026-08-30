import { todayEpochDay } from './dates'
import type { Note, SrsState } from './types'

/*
 * Shared review-shape derivations — the numbers behind Today's memory horizon
 * and Review's forecast, share bars and year grid.
 *
 * Kept out of srs.ts (the scheduling maths is frozen) and out of ink.ts (that's
 * the highlighter pens). Pure functions, so both screens read the same truth.
 *
 * `SrsState.due` is a day offset from today and may be negative — overdue notes
 * fold into day 0 everywhere here, because "you should already have read it"
 * and "read it today" are the same instruction.
 */

/** Notes surfacing on each of the next `days` days, index 0 = today. */
export function forecastDays(notes: Note[], srs: Record<string, SrsState>, days = 14): number[] {
  const counts = new Array<number>(days).fill(0)
  for (const n of notes) {
    const s = srs[n.id]
    if (!s) continue
    const k = Math.max(0, s.due)
    if (k < days) counts[k]++
  }
  return counts
}

export interface InkShare {
  key: 'overdue' | 'today' | 'soon' | 'later'
  label: string
  count: number
  /** 0–1 share of the notes in review, for the track fill. */
  share: number
}

/** How the ink sits right now: overdue / due today / next three days / later. */
export function inkSits(notes: Note[], srs: Record<string, SrsState>): InkShare[] {
  const defs: { key: InkShare['key']; label: string; test: (d: number) => boolean }[] = [
    { key: 'overdue', label: 'overdue', test: (d) => d < 0 },
    { key: 'today', label: 'due today', test: (d) => d === 0 },
    { key: 'soon', label: 'next 3 days', test: (d) => d >= 1 && d <= 3 },
    { key: 'later', label: 'later', test: (d) => d > 3 },
  ]
  const dues = notes.map((n) => srs[n.id]).filter((s): s is SrsState => !!s).map((s) => s.due)
  const total = Math.max(1, dues.length)
  return defs.map((d) => {
    const count = dues.filter(d.test).length
    return { key: d.key, label: d.label, count, share: count / total }
  })
}

export interface GridCell {
  /** Absolute epoch day. */
  day: number
  count: number
  /** 0 = none, 1–3 = increasing volume. */
  level: 0 | 1 | 2 | 3
  /** Column (week) and row (weekday) in the grid. */
  col: number
  row: number
}

/**
 * "Year in ink" — `weeks` columns × 7 rows of review volume, ending on today.
 * The last column holds today, so the grid always reads right-to-now.
 */
export function yearGrid(ledgerByDay: Record<number, number>, weeks = 26, cap = Infinity): GridCell[] {
  const today = todayEpochDay()
  // Walk back to the start of today's week so rows line up as weekdays.
  const todayRow = ((today % 7) + 7) % 7
  const start = today - todayRow - (weeks - 1) * 7
  const cells: GridCell[] = []
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const day = start + col * 7 + row
      if (day > today) continue // never draw the future
      // Capped by how many notes are actually in review: a vault of 8 notes
      // cannot have produced 13 reviews in a day, and the grid must not claim it.
      const count = Math.min(cap, ledgerByDay[day] ?? 0)
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : 3
      cells.push({ day, count, level, col, row })
    }
  }
  return cells
}
