import type { Note } from './types'

/** Minutes → "1h 56m" / "26m". */
export function fmtMins(m: number): string {
  return m >= 60
    ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '')
    : m + 'm'
}

/** Bare domain from a pasted URL. */
export function domainOf(url: string): string {
  const m = (url || '').match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/)
  return m ? m[1] : 'link'
}

/** First paragraph (or first list item) as a card snippet. */
export function snippet(note: Note): string {
  const p = note.blocks.find((b) => b.t === 'p')
  return p?.text ?? note.blocks[0]?.items?.[0] ?? ''
}

/** Rough word count across all block text. */
export function words(note: Note): number {
  return note.blocks
    .map((b) => (b.text || '') + (b.items || []).join(' '))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
}

/** Consecutive-day journal streak, counting from today (or yesterday, grace). */
export function journalStreak(entries: { off: number }[]): number {
  const set = new Set(entries.map((e) => e.off))
  let d = set.has(0) ? 0 : set.has(-1) ? -1 : null
  if (d === null) return 0
  let streak = 0
  while (set.has(d)) {
    streak++
    d--
  }
  return streak
}
