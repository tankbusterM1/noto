import { create } from 'zustand';
import { openVault, uid, type LedgerRow, type NoteRow, type Vault } from './db';
import { dates, format, fsrs, markdown } from '../core';
import type { Grade, HistEntry } from '../core';

export interface Note {
  id: string;
  title: string;
  folderId: string;
  tags: string[];
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface NoteMemory {
  ease: number;
  ivl: number;
  /** Day offset: <= 0 means due. */
  due: number;
  hist: HistEntry[];
  /** FSRS stability in days, derived from the ledger. */
  stab: number | null;
  /** Predicted recall right now, 0..1. Null when never reviewed. */
  recall: number | null;
}

interface State {
  ready: boolean;
  notes: Note[];
  memory: Record<string, NoteMemory>;
  hydrate: () => Promise<void>;
  createNote: (title?: string) => Promise<string>;
  saveNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  review: (id: string, grade: Grade) => Promise<void>;
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  folderId: r.folderId,
  tags: JSON.parse(r.tags) as string[],
  body: r.body,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/**
 * Rebuild every note's memory from the append-only ledger.
 *
 * This is the property that makes GitHub sync tractable: FSRS state is DERIVED,
 * never authoritative. `replayMemory` folds the history *and sorts it first*, so
 * two devices holding the same ledger rows — in any order — compute identical
 * stability and difficulty. Union-merge the ledger and the schedule agrees.
 */
function deriveMemory(ledger: LedgerRow[], srsRows: { noteId: string; ease: number; ivl: number; dueDay: number }[]) {
  const today = dates.todayEpochDay();
  const byNote = new Map<string, HistEntry[]>();
  for (const l of ledger) {
    const arr = byNote.get(l.noteId) ?? [];
    arr.push({ d: l.day - today, g: l.grade as Grade, ivl: l.ivl });
    byNote.set(l.noteId, arr);
  }

  const out: Record<string, NoteMemory> = {};
  for (const row of srsRows) {
    const hist = byNote.get(row.noteId) ?? [];
    const mem = fsrs.replayMemory(hist);
    const lastSeen = hist.length ? Math.max(...hist.map((h) => h.d)) : 0;
    const elapsed = Math.max(0, 0 - lastSeen);
    out[row.noteId] = {
      ease: row.ease,
      ivl: row.ivl,
      due: row.dueDay - today,
      hist,
      stab: mem?.stab ?? null,
      recall: mem ? fsrs.retrievability(elapsed, mem.stab) : null,
    };
  }
  return out;
}

let vault: Vault | null = null;

export const useData = create<State>((set, get) => ({
  ready: false,
  notes: [],
  memory: {},

  hydrate: async () => {
    vault = await openVault();
    const [noteRows, srsRows, ledger] = await Promise.all([vault.notes(), vault.srs(), vault.ledger()]);
    set({
      ready: true,
      notes: noteRows.map(toNote),
      memory: deriveMemory(ledger, srsRows),
    });
  },

  createNote: async (title = 'Untitled note') => {
    if (!vault) return '';
    const now = Date.now();
    const folders = await vault.folders();
    const folderId = folders[0]?.id ?? 'f_inbox';
    if (!folders.length) await vault.putFolder({ id: folderId, name: 'Notes', parentId: null });

    const row: NoteRow = {
      id: uid('n'),
      title,
      folderId,
      tags: '[]',
      body: '',
      createdAt: now,
      updatedAt: now,
    };
    await vault.putNote(row);
    set({ notes: [toNote(row), ...get().notes] });
    return row.id;
  },

  saveNote: async (id, patch) => {
    if (!vault) return;
    const cur = get().notes.find((n) => n.id === id);
    if (!cur) return;
    const next: Note = { ...cur, ...patch, updatedAt: Date.now() };
    await vault.putNote({
      ...next,
      tags: JSON.stringify(next.tags),
    });
    set({ notes: get().notes.map((n) => (n.id === id ? next : n)) });
  },

  deleteNote: async (id) => {
    if (!vault) return;
    await vault.trashNote(id, Date.now());
    const memory = { ...get().memory };
    delete memory[id];
    set({ notes: get().notes.filter((n) => n.id !== id), memory });
  },

  review: async (id, grade) => {
    if (!vault) return;
    const today = dates.todayEpochDay();
    const prev = get().memory[id];
    const hist: HistEntry[] = [...(prev?.hist ?? []), { d: 0, g: grade, ivl: prev?.ivl ?? 1 }];

    const mem = fsrs.replayMemory(hist);
    const ivl = mem ? Math.max(1, Math.min(fsrs.MAX_IVL, fsrs.scheduleInterval(mem.stab))) : 1;

    await vault.addLedger({ noteId: id, day: today, grade, ivl });
    await vault.putSrs({ noteId: id, ease: prev?.ease ?? 2.5, ivl, dueDay: today + ivl });

    const [srsRows, ledger] = await Promise.all([vault.srs(), vault.ledger()]);
    set({ memory: deriveMemory(ledger, srsRows) });
  },
}));

/** Snippet via the shared markdown -> blocks -> snippet path. */
export function snippet(body: string): string {
  if (!body.trim()) return 'empty note';
  return format.blocksSnippet(markdown.markdownToBlocks(body));
}

export function editedAgo(ms: number): string {
  return dates.agoMs(ms);
}

export function dueCount(memory: Record<string, NoteMemory>): number {
  return Object.values(memory).filter((m) => m.due <= 0).length;
}
