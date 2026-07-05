import Dexie, { type EntityTable } from 'dexie'
import type {
  Block,
  Goal,
  Grade,
  Ranged,
  Ritual,
  Todo,
  Watch,
  WeekItem,
} from '../lib/types'

/*
 * Local-first persistence (IndexedDB via Dexie). No server.
 *
 * Notes are stored as records; the review history lives in a dedicated
 * `ledger` table (one row per review event) rather than embedded in the srs
 * record — the in-memory `hist[]` is reconstructed from it on hydrate.
 *
 * Dates are stored as absolute epoch-days (createdDay / updatedDay / dueDay /
 * ledger.day) so scheduling is anchored in real time.
 */

export interface FolderRow {
  id: string
  name: string
  parentId: string | null
}

export interface NoteRow {
  id: string
  title: string
  folderId: string
  tags: string[]
  createdDay: number
  updatedDay: number
  blocks: Block[]
}

/** Current scheduling state for an in-review note. */
export interface SrsRow {
  noteId: string
  ease: number
  ivl: number
  dueDay: number
}

/** One review event — the SRS ledger. */
export interface LedgerRow {
  id?: number
  noteId: string
  day: number
  grade: Grade
  ivl: number
}

export interface JournalRow {
  id?: number
  off: number
  words: number
  text: string
}

/** Watch item + a monotonic sort key so newest-first order survives reloads. */
export type WatchRow = Watch & { addedAt: number }

/** Key/value bag for shared bits (tag vocabulary, install marker, …). */
export interface MetaRow {
  key: string
  value: unknown
}

export const db = new Dexie('noto') as Dexie & {
  folders: EntityTable<FolderRow, 'id'>
  notes: EntityTable<NoteRow, 'id'>
  srs: EntityTable<SrsRow, 'noteId'>
  ledger: EntityTable<LedgerRow, 'id'>
  todos: EntityTable<Todo, 'id'>
  goals: EntityTable<Goal, 'id'>
  week: EntityTable<WeekItem, 'id'>
  rituals: EntityTable<Ritual, 'id'>
  ranged: EntityTable<Ranged, 'id'>
  watch: EntityTable<WatchRow, 'id'>
  journal: EntityTable<JournalRow, 'id'>
  meta: EntityTable<MetaRow, 'key'>
}

db.version(1).stores({
  folders: 'id, parentId',
  notes: 'id, folderId',
  srs: 'noteId',
  ledger: '++id, noteId',
  todos: 'id',
  goals: 'id',
  week: 'id, day',
  rituals: 'id',
  ranged: 'id',
  watch: 'id',
  journal: '++id',
  meta: 'key',
})
