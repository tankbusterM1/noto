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

/** Draft history — a clock wound back. */
export function HistoryIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3.2 9a5.8 5.8 0 1 0 1.9-4.3" />
      <polyline points="2.4 3.1 2.4 5.4 4.7 5.4" />
      <polyline points="9 5.6 9 9 11.4 10.4" />
    </svg>
  )
}

/** The Loom — a constellation: three knots woven by threads. */
export function LoomIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="4" cy="5" r="1.7" />
      <circle cx="13.5" cy="3.8" r="1.7" />
      <circle cx="9.5" cy="13.5" r="1.7" />
      <line x1="5.6" y1="5.4" x2="11.9" y2="4.2" />
      <line x1="4.8" y1="6.6" x2="8.7" y2="12" />
      <line x1="12.7" y1="5.3" x2="10.3" y2="12" />
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

/** A folder. */
export function FolderIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" {...props}>
      <path d="M2.4 6A1.6 1.6 0 014 4.4h3.4L9 6h5a1.6 1.6 0 011.6 1.6v5.2A1.6 1.6 0 0114 14.4H4a1.6 1.6 0 01-1.6-1.6V6z" />
    </svg>
  )
}

/** Four-square grid — "All notes". */
export function GridIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <rect x="2.5" y="2.5" width="5.4" height="5.4" rx="1.6" />
      <rect x="10.1" y="2.5" width="5.4" height="5.4" rx="1.6" />
      <rect x="2.5" y="10.1" width="5.4" height="5.4" rx="1.6" />
      <rect x="10.1" y="10.1" width="5.4" height="5.4" rx="1.6" />
    </svg>
  )
}

/** Tree caret — points right; rotate 90° when the folder is open. */
export function TreeCaret({ size = 8, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3,1.5 7.5,5 3,8.5" />
    </svg>
  )
}

/** Image / photo. */
export function ImageIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" {...props}>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" />
      <circle cx="5.6" cy="6.4" r="1.2" />
      <path d="M2.4 12l3.8-3.6 2.6 2.4 2.8-2.8 2.6 2.4" />
    </svg>
  )
}

/** Chain link. */
export function LinkIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" {...props}>
      <path d="M6.5 9.5l3-3" />
      <path d="M7.5 4.8l1.2-1.2a2.6 2.6 0 013.7 3.7L11.2 8.5" />
      <path d="M8.5 11.2l-1.2 1.2a2.6 2.6 0 01-3.7-3.7l1.2-1.2" />
    </svg>
  )
}

/** External-link arrow (out of box). */
export function ExternalArrow({ size = 13, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 2.5h6.5V9" />
      <line x1="11.5" y1="2.5" x2="3" y2="11" />
    </svg>
  )
}

/** Lightbulb — callout blocks. */
export function LightbulbIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" {...props}>
      <path d="M6.5 12.5a4.5 4.5 0 115 0" />
      <line x1="7.2" y1="14.6" x2="10.8" y2="14.6" />
      <line x1="7.8" y1="16.4" x2="10.2" y2="16.4" />
    </svg>
  )
}

/** Padlock — journal privacy. `locked` toggles the shackle. */
export function LockIcon({ size = 10, locked = true, ...props }: IconProps & { locked?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <rect x="2" y="5" width="8" height="5.5" rx="1.5" />
      <path d={locked ? 'M4 5V3.6a2 2 0 014 0V5' : 'M4 5V3.6a2 2 0 014-0.6'} />
    </svg>
  )
}

/** Quill / pen — journal scratchpad. */
export function QuillIcon({ size = 13, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" {...props}>
      <path d="M2.5 13.5c3-0.5 4-1 5.5-2.5l4.5-4.5a1.9 1.9 0 00-2.7-2.7L5.3 8.3c-1.5 1.5-2 2.5-2.8 5.2z" />
    </svg>
  )
}

/** Spark / star — rituals. */
export function StarIcon({ size = 12, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8.5 1.5l4 4-2.2 0.6-2.6 2.6-0.4 3.3-2.4-2.4L1.5 12.5l3-3.4-2.4-2.4 3.3-0.4 2.6-2.6z" />
    </svg>
  )
}

/** Filled play triangle — watch tiles / references. */
export function PlayTriangle({ size = 10, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" {...props}>
      <polygon points="3,1.5 10.5,6 3,10.5" fill="currentColor" />
    </svg>
  )
}

/** Pen nib (no inner line) — todo → note reference chip. */
export function NibIcon({ size = 9, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" {...props}>
      <path d="M9 2.4l4.6 4.6-3.2 8.4H7.6L4.4 7z" />
    </svg>
  )
}

/** Article — horizontal rules. */
export function ArticleIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" {...props}>
      <line x1="2" y1="3" x2="12" y2="3" />
      <line x1="2" y1="7" x2="12" y2="7" />
      <line x1="2" y1="11" x2="8" y2="11" />
    </svg>
  )
}

/** Paper / document. */
export function PaperIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2} {...props}>
      <rect x="2.5" y="1.5" width="9" height="11" rx="1.5" />
      <line x1="5" y1="5" x2="9" y2="5" />
      <line x1="5" y1="8" x2="9" y2="8" />
    </svg>
  )
}

/** Trash — delete. */
export function TrashIcon({ size = 13, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" {...props}>
      <path d="M2.5 3.5h9" />
      <path d="M5.5 3.5V2.2h3v1.3" />
      <path d="M3.5 3.5l0.7 8h5.6l0.7-8" />
    </svg>
  )
}

/** Close (X). */
export function CloseIcon({ size = 11, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...props}>
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}

/** Needle + thread — tag threads. */
export function ThreadIcon({ size = 17, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" {...props}>
      <path d="M3 15L13.2 4.8" />
      <path d="M13.2 4.8a2.1 2.1 0 103-3 2.1 2.1 0 00-3 3z" />
      <path d="M3 15c3.4 1.1 5.9-0.4 8.4-1.9" />
    </svg>
  )
}

/** Gear — settings. */
export function GearIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M9 1.6v2M9 14.4v2M1.6 9h2M14.4 9h2M3.8 3.8l1.4 1.4M12.8 12.8l1.4 1.4M14.2 3.8l-1.4 1.4M5.2 12.8l-1.4 1.4" />
    </svg>
  )
}

/** Checkmark polyline (used inside todo/watch checkboxes). */
export function CheckMark({ size = 10, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="2,6.5 4.8,9 10,3.5" />
    </svg>
  )
}
