import type { SVGProps } from 'react'

/*
 * Custom inline-SVG icon set — 1.5–1.6 stroke, rounded caps/joins, hand-drawn
 * feel (README "Iconography"). No icon font, no emoji. Paths are lifted
 * verbatim from the prototype so the silhouettes match 1:1. Each icon inherits
 * color via `currentColor` and takes a `size` (applied to width + height).
 *
 * This file grows as later screens need more glyphs; for now it carries the
 * app-shell set plus a couple of common primitives.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Collapse caret — points left when expanded; rotate 180° for the slim rail. */
export function Caret({ size = 10, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="6.5,1.5 2.5,5 6.5,8.5" />
    </svg>
  )
}

/** Today — a sunrise. */
export function TodayIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      {...props}
    >
      <path d="M4.2 11.6a4.8 4.8 0 019.6 0" />
      <line x1="2" y1="14.4" x2="16" y2="14.4" />
      <line x1="9" y1="2.2" x2="9" y2="4.4" />
      <line x1="3.6" y1="4.8" x2="5.1" y2="6.3" />
      <line x1="14.4" y1="4.8" x2="12.9" y2="6.3" />
    </svg>
  )
}

/** Notes — a pen nib. */
export function NotesIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 2.4l4.6 4.6-3.2 8.4H7.6L4.4 7z" />
      <line x1="9" y1="7.6" x2="9" y2="11" />
    </svg>
  )
}

/** Journal — an open book / ribbon-bookmark. */
export function JournalIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 4.4C7.5 3.2 5.2 3.1 3.4 3.9V14.4C5.2 13.6 7.5 13.7 9 14.9C10.5 13.7 12.8 13.6 14.6 14.4V3.9C12.8 3.1 10.5 3.2 9 4.4z" />
      <line x1="9" y1="4.6" x2="9" y2="14.7" />
    </svg>
  )
}

/** Todos — a checkbox. */
export function TodosIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2.5" y="2.5" width="13" height="13" rx="3.5" />
      <polyline points="6,9.2 8.2,11.4 12.2,6.8" />
    </svg>
  )
}

/** Watch Later — a play button. */
export function WatchIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="9" cy="9" r="6.8" />
      <polygon points="7.6,6.4 12,9 7.6,11.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Review — a diamond (memory / spaced review). */
export function ReviewIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 2.2L15.8 9L9 15.8L2.2 9L9 2.2z" />
      <path d="M9 6.2L11.8 9L9 11.8L6.2 9L9 6.2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Search — a magnifier. */
export function SearchIcon({ size = 13, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      {...props}
    >
      <circle cx="6" cy="6" r="4.5" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" />
    </svg>
  )
}

/** Appearance — a half-filled circle (light/dark). */
export function AppearanceIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      {...props}
    >
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 2.5a6.5 6.5 0 010 13z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Plus — used by "New note" / "New folder" (added here for reuse later). */
export function PlusIcon({ size = 11, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      {...props}
    >
      <line x1="6" y1="1" x2="6" y2="11" />
      <line x1="1" y1="6" x2="11" y2="6" />
    </svg>
  )
}
