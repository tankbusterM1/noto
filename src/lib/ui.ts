import type { CSSProperties } from 'react'

/** Shared inline-style atoms so screens can port the prototype's markup 1:1. */

export const MONO = "'JetBrains Mono', ui-monospace, monospace"
export const SERIF = "'Newsreader', Georgia, serif"

/** Folder pill used on note cards. */
export const chip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--ink2)',
  background: 'var(--sf2)',
  borderRadius: 999,
  padding: '3px 9px',
}

/** Uppercase mono section label. */
export const kicker: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}

/** Multi-line ellipsis clamp. */
export function clamp(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
}

/** Staggered rise-in for cards/rows (delay capped at 0.4s). */
export function rise(index = 0, dur = 0.4): CSSProperties {
  return {
    animation: `rise ${dur}s ease both`,
    animationDelay: `${Math.min(index * 0.045, 0.4)}s`,
  }
}
