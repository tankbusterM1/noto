/*
 * Date helpers. Two layers:
 *  - "epoch-day" integers for durable storage (days since 1970-01-01, computed
 *    from the local calendar date so DST never shifts a day). These anchor SRS
 *    scheduling so a note that is "2 days overdue" today is "3 days overdue"
 *    tomorrow — real decay, not a frozen prototype.
 *  - offset/formatting helpers that mirror the prototype's display logic.
 */

const MS_PER_DAY = 86_400_000

/** Epoch-day for a Date's local calendar date (tz/DST-safe). */
export function epochDayOf(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  )
}

export function todayEpochDay(): number {
  return epochDayOf(new Date())
}

/** Epoch-day integer → local Date at that calendar date. */
export function dateFromEpochDay(n: number): Date {
  const utc = new Date(n * MS_PER_DAY)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

/** Today + n days as a Date (matches the prototype's addDays). */
export function addDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/** "Jul 5" */
export function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Relative label for a day offset (0 = today, -1 = yesterday, …). */
export function ago(offset: number): string {
  if (offset === 0) return 'today'
  if (offset === -1) return 'yesterday'
  return Math.abs(offset) + 'd ago'
}

/** Relative label for a ms timestamp ("just now", "3h ago", "2d ago", "3w ago"). */
export function agoMs(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 60) return 'just now'
  const h = Math.round(mins / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  if (d < 7) return d + 'd ago'
  const w = Math.round(d / 7)
  if (w < 5) return w + 'w ago'
  return Math.round(d / 30) + 'mo ago'
}
