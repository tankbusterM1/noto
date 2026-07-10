import { create } from 'zustand';
import {
  openVault,
  uid,
  type LedgerRow,
  type NoteRow,
  type TodoRow,
  type Vault,
  type WatchKind,
  type WatchRow,
} from './db';
import { cancelDigest, scheduleDigest, syncBadge } from './badge';
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

export interface Todo {
  id: string;
  text: string;
  tag: string | null;
  done: boolean;
}

export interface WatchItem {
  id: string;
  kind: WatchKind;
  title: string;
  source: string;
  url: string;
  mins: number;
  done: boolean;
  addedAt: number;
}

interface State {
  ready: boolean;
  notes: Note[];
  memory: Record<string, NoteMemory>;
  todos: Todo[];
  watch: WatchItem[];
  /** Daily local reminder naming what's waiting. */
  digestOn: boolean;
  hydrate: () => Promise<void>;
  setDigest: (on: boolean) => Promise<void>;
  /** Push the open-todo count to the app icon (and re-arm the digest). */
  refreshSignals: () => Promise<void>;
  createNote: (title?: string) => Promise<string>;
  saveNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  review: (id: string, grade: Grade) => Promise<void>;
  addTodo: (raw: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  addWatch: (url: string) => Promise<string | null>;
  toggleWatch: (id: string) => Promise<void>;
  removeWatch: (id: string) => Promise<void>;
}

const toTodo = (r: TodoRow): Todo => ({ id: r.id, text: r.text, tag: r.tag, done: !!r.done });
const toWatch = (r: WatchRow): WatchItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  source: r.source,
  url: r.url,
  mins: r.mins,
  done: !!r.done,
  addedAt: r.addedAt,
});

/** `buy milk #errand` -> { text: 'buy milk', tag: 'errand' } — same rule as desktop. */
function extractTag(raw: string): { text: string; tag: string | null } {
  const m = raw.match(/#([a-z0-9][a-z0-9-]*)/i);
  if (!m) return { text: raw.trim(), tag: null };
  const text = raw.replace(m[0], '').replace(/\s+/g, ' ').trim() || raw.trim();
  return { text, tag: m[1].toLowerCase() };
}

function classify(url: string): WatchKind {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv/.test(u)) return 'video';
  if (/arxiv\.org|\.pdf($|\?)|doi\.org|acm\.org|ieee\.org/.test(u)) return 'paper';
  return 'article';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Fetch a title for a pasted link. React Native's fetch has no CORS wall, so
 * unlike the web app we can hit noembed directly — no proxy. Any failure is
 * non-fatal: we fall back to the hostname rather than refusing to save.
 */
async function lookupTitle(url: string, signalMs = 6000): Promise<{ title: string; mins: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), signalMs);
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { title?: string; error?: string; duration?: number };
    if (j.error || !j.title) throw new Error(j.error ?? 'no title');
    return { title: j.title, mins: j.duration ? Math.round(j.duration / 60) : 0 };
  } catch {
    return { title: hostOf(url), mins: 0 };
  } finally {
    clearTimeout(t);
  }
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
  todos: [],
  watch: [],
  digestOn: false,

  hydrate: async () => {
    vault = await openVault();
    const [noteRows, srsRows, ledger, todoRows, watchRows, digest] = await Promise.all([
      vault.notes(),
      vault.srs(),
      vault.ledger(),
      vault.todos(),
      vault.watch(),
      vault.getMeta('digest'),
    ]);
    set({
      ready: true,
      notes: noteRows.map(toNote),
      memory: deriveMemory(ledger, srsRows),
      todos: todoRows.map(toTodo),
      watch: watchRows.map(toWatch),
      digestOn: digest === '1',
    });
    void get().refreshSignals();
  },

  /**
   * The badge is the free stand-in for a widget. Re-arm the digest too: its body
   * is fixed at schedule time, so stale counts would fire tomorrow otherwise.
   */
  refreshSignals: async () => {
    const s = get();
    const open = s.todos.filter((t) => !t.done).length;
    await syncBadge(open);
    if (s.digestOn) await scheduleDigest(open, dueCount(s.memory));
  },

  setDigest: async (on) => {
    if (!vault) return;
    await vault.setMeta('digest', on ? '1' : '0');
    set({ digestOn: on });
    if (!on) await cancelDigest();
    else await get().refreshSignals();
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

  addTodo: async (raw) => {
    if (!vault || !raw.trim()) return;
    const { text, tag } = extractTag(raw);
    if (!text) return;
    const now = Date.now();
    const row: TodoRow = { id: uid('t'), text, tag, done: 0, createdAt: now, updatedAt: now };
    await vault.putTodo(row);
    set({ todos: [toTodo(row), ...get().todos] });
    void get().refreshSignals();
  },

  toggleTodo: async (id) => {
    if (!vault) return;
    const cur = get().todos.find((t) => t.id === id);
    if (!cur) return;
    const next = { ...cur, done: !cur.done };
    await vault.putTodo({
      id: next.id,
      text: next.text,
      tag: next.tag,
      done: next.done ? 1 : 0,
      createdAt: 0,
      updatedAt: Date.now(),
    });
    // Re-read so ordering (open first) matches the DB, not just local state.
    const rows = await vault.todos();
    set({ todos: rows.map(toTodo) });
    void get().refreshSignals();
  },

  removeTodo: async (id) => {
    if (!vault) return;
    await vault.deleteTodo(id);
    set({ todos: get().todos.filter((t) => t.id !== id) });
    void get().refreshSignals();
  },

  addWatch: async (rawUrl) => {
    if (!vault) return null;
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) return null;
    const { title, mins } = await lookupTitle(url);
    const row: WatchRow = {
      id: uid('w'),
      kind: classify(url),
      title,
      source: hostOf(url),
      url,
      mins,
      done: 0,
      addedAt: Date.now(),
    };
    await vault.putWatch(row);
    set({ watch: [toWatch(row), ...get().watch] });
    return row.id;
  },

  toggleWatch: async (id) => {
    if (!vault) return;
    const cur = get().watch.find((w) => w.id === id);
    if (!cur) return;
    await vault.putWatch({
      id: cur.id,
      kind: cur.kind,
      title: cur.title,
      source: cur.source,
      url: cur.url,
      mins: cur.mins,
      done: cur.done ? 0 : 1,
      addedAt: cur.addedAt,
    });
    const rows = await vault.watch();
    set({ watch: rows.map(toWatch) });
  },

  removeWatch: async (id) => {
    if (!vault) return;
    await vault.deleteWatch(id);
    set({ watch: get().watch.filter((w) => w.id !== id) });
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
