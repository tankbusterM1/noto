import type { Note } from './types'

/** Minutes → "1h 56m" / "26m". Guards NaN / negative / fractional input. */
export function fmtMins(m: number): string {
  const n = Number.isFinite(m) && m > 0 ? Math.floor(m) : 0
  return n >= 60
    ? Math.floor(n / 60) + 'h' + (n % 60 ? ' ' + (n % 60) + 'm' : '')
    : n + 'm'
}

/**
 * Bare host from a pasted URL — case-insensitive, scheme-agnostic, `www.`
 * stripped. Uses the URL parser first (handles paths, ports, uppercase and
 * protocol-relative links) and falls back to a permissive parse.
 */
export function domainOf(url: string): string {
  const raw = (url || '').trim()
  if (!raw) return 'link'
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? raw
      : raw.startsWith('//')
        ? 'https:' + raw
        : 'https://' + raw
    const host = new URL(withProto).hostname.replace(/^www\./i, '')
    if (host) return host
  } catch {
    /* fall through to a permissive parse */
  }
  const cleaned = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^[a-z][a-z0-9+.-]*:/i, '')
    .replace(/^\/\//, '')
    .replace(/^www\./i, '')
  const m = cleaned.match(/^([^/\s?#]+)/)
  return m ? m[1] : 'link'
}

/**
 * Strip inline markdown markers for read surfaces (card snippets): keeps the
 * words, drops **, *, ~~, backticks, link targets and leading heading hashes.
 * Content symbols that aren't markdown (a literal #tag, math, code text) pass
 * through untouched.
 */
export function stripInline(s: string): string {
  return s
    .replace(/\[\[([^[\]]+)\]\]/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
}

/** First paragraph (or first list item) as a card snippet — markers stripped. */
export function snippet(note: Note): string {
  const p = note.blocks.find((b) => b.t === 'p')
  return stripInline(p?.text ?? note.blocks[0]?.items?.[0] ?? '')
}

/** All searchable text for a note — title, tags, and every block body. */
export function noteFullText(note: Note): string {
  const body = note.blocks
    .map((b) => (b.text || '') + ' ' + (b.items || []).join(' '))
    .join(' ')
  return (note.title + ' ' + note.tags.join(' ') + ' ' + body).toLowerCase()
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
