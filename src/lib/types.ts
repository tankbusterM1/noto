/*
 * Shared domain types for Noto.
 *
 * A note about time: the prototype models SRS scheduling and note dates as
 * *offsets from today* (e.g. `due: -2` = 2 days overdue, `updated: -1` =
 * yesterday). We keep that exact in-memory model so the screen logic ports
 * verbatim, but persist absolute "epoch-day" integers in Dexie (see data/db.ts)
 * and convert at the boundary on hydrate / write. This is what makes the SRS
 * scheduler real instead of frozen.
 */

export type Grade = 1 | 2 | 3 | 4

export type BlockType =
  | 'p'
  | 'h2'
  | 'ul'
  | 'code'
  | 'q'
  | 'img'
  | 'link'
  | 'call'

export interface Block {
  /** Stable id so the editor can keep uncontrolled DOM across inserts/merges. */
  id?: string
  t: BlockType
  /** Heading level 1–3 (for `h2` blocks); defaults to 2. */
  level?: number
  text?: string
  items?: string[]
  lang?: string
  domain?: string
  /** Link blocks: the full href (path/query/fragment preserved for round-trips). */
  url?: string
  /** Image blocks: an uploaded data-URL (local-first). */
  src?: string
}

/** Fresh block id. */
export function blockId(): string {
  return 'b' + Math.random().toString(36).slice(2, 10)
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
}

/** In-memory note. `created`/`updated` are offsets from today (days). */
export interface Note {
  id: string
  title: string
  folderId: string
  tags: string[]
  created: number
  updated: number
  blocks: Block[]
}

/** One past review, `d` = day offset from today (0 = today, negative = past). */
export interface HistEntry {
  d: number
  g: Grade
  ivl: number
}

/** In-memory SRS state for a note. `due` is an offset (≤0 means due). */
export interface SrsState {
  ease: number
  ivl: number
  due: number
  hist: HistEntry[]
  /** FSRS memory model (lib/adaptive.ts): stability in days. Derived from
   * history on hydrate; undefined until the note's first review. */
  stab?: number
  /** FSRS difficulty 1–10. */
  diff?: number
}

export interface Todo {
  id: string
  text: string
  tag?: string
  done: boolean
  ref?: { type: 'note' | 'watch'; id: string }
}

export interface Goal {
  id: string
  text: string
  done: boolean
}

export interface WeekItem {
  id: string
  day: number // 0 = Monday … 6 = Sunday
  text: string
  done: boolean
  tag?: string
}

export interface Ritual {
  id: string
  text: string
  streak: number
  done: boolean
}

export interface Ranged {
  id: string
  text: string
  from: number // day-of-month
  to: number // day-of-month
  hue: number
}

export type WatchKind = 'video' | 'article' | 'paper'

export interface Watch {
  id: string
  kind: WatchKind
  title: string
  source: string
  mins: number
  url: string
  added: string
  done: boolean
  hue: number
  tags: string[]
  note: string
  loading?: boolean
  /** Scraped thumbnail URL (falls back to the hue gradient). */
  thumb?: string
}

export interface JournalEntry {
  id?: number
  off: number // day offset from today (negative = past)
  words: number
  text: string
}
