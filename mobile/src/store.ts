import { create } from 'zustand';
import {
  openVault,
  uid,
  type FolderRow,
  type JournalRow,
  type LedgerRow,
  type ListName,
  type NoteRow,
  type TodoRow,
  type Vault,
  type WatchKind,
  type WatchRow,
} from './db';
import {
  cacheKey,
  cachedKey,
  hasCachedKey,
  checkVerifier,
  CURRENT_ITERATIONS,
  decryptJSON,
  DEFAULT_ITERATIONS,
  deriveKey,
  destroyLegacyKey,
  encryptJSON,
  isLegacyEnvelope,
  legacyKey,
  makeVerifier,
  openLegacy,
  randomSalt,
  type VaultCrypto,
} from './crypto';
import { runSync, type SyncOutcome } from './vault';
import { cancelNudges, fireTestNotify, scheduleNudges, syncBadge } from './badge';
import { haptics, setHapticStrength, type HapticLevel } from './motion';
import { bytes as bytesLib, bytesMemory, dates, format, fsrs, markdown, notify, sync } from '../core';
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

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
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

export interface JournalEntry {
  id: string;
  day: number;
  text: string;
  words: number;
  createdAt: number;
}

interface State {
  ready: boolean;
  notes: Note[];
  /** Note folders — the same tree the desktop keeps; every note has a folderId. */
  folders: Folder[];
  memory: Record<string, NoteMemory>;
  todos: Todo[];
  /** Whether the user pinned today's todos to the lock screen (session-only). */
  todosPinned: boolean;
  watch: WatchItem[];
  /** Decrypted, in memory only, and only while unlocked. */
  journal: JournalEntry[];
  journalUnlocked: boolean;
  /** How many sealed entries exist — visible even when locked. */
  journalCount: number;
  /** Null until a passphrase exists anywhere in the vault. */
  journalCrypto: VaultCrypto | null;
  /** True when the derived key is cached, so Face ID alone opens the journal. */
  journalCached: boolean;
  /** Face ID path. False means "no cached key" — ask for the passphrase. */
  unlockJournal: () => Promise<boolean>;
  /** Passphrase path: derive, verify, then cache behind Face ID. */
  unlockJournalWithPassphrase: (pass: string) => Promise<{ ok: boolean; error?: string }>;
  /** First passphrase for a vault that has none. Encrypts whatever is already here. */
  setJournalPassphrase: (pass: string) => Promise<{ ok: boolean; error?: string }>;
  lockJournal: () => void;
  addJournalEntry: (text: string) => Promise<void>;
  removeJournalEntry: (id: string) => Promise<void>;
  syncNow: () => Promise<SyncOutcome>;
  /** Sync automatically in the background after you make changes. */
  autoSyncOn: boolean;
  setAutoSync: (on: boolean) => Promise<void>;
  /** Your name for personalised nudges (set in settings; '' = a friendly stand-in). */
  userName: string;
  /** Notification personality: off · normal · high · obsessed. */
  notifyMode: notify.NotifyMode;
  /** Haptic strength (off/low/med/high), persisted; also drives motion.ts. */
  hapticLevel: HapticLevel;
  hydrate: () => Promise<void>;
  setUserName: (name: string) => Promise<void>;
  setNotifyMode: (mode: notify.NotifyMode) => Promise<void>;
  /** Fire one sample notification of a mode right now (settings test panel). */
  testNotify: (mode: Exclude<notify.NotifyMode, 'off'>) => Promise<boolean>;
  setHapticLevel: (level: HapticLevel) => Promise<void>;
  /** Bytes learning cards, synced from the desktop deck. */
  bytes: bytesLib.ByteCard[];
  /** Per-card memory (local; own spaced-rep, separate from notes' FSRS). */
  byteMemory: Record<string, bytesMemory.ByteMemory>;
  /** A read exposure — learning stage, bumps the sighting count. */
  seeByte: (id: string) => Promise<void>;
  /** A checkpoint answer — grades the card through the memory engine. */
  answerByte: (id: string, grade: bytesMemory.Grade) => Promise<void>;
  /** Consecutive-day study streak for Bytes. */
  byteStreak: { count: number; last: number };
  /** Mark today active — rolls the streak. Called when the reel opens. */
  markByteDay: () => Promise<void>;
  /** Push the open-todo count to the app icon (and re-arm the digest). */
  refreshSignals: () => Promise<void>;
  createNote: (title?: string, folderId?: string) => Promise<string>;
  saveNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  /** Move a note into another folder. */
  moveNote: (id: string, folderId: string) => Promise<void>;
  createFolder: (name: string) => Promise<string>;
  renameFolder: (id: string, name: string) => Promise<void>;
  /** Delete a folder; its notes move to another folder — never orphaned or lost. */
  deleteFolder: (id: string) => Promise<void>;
  review: (id: string, grade: Grade) => Promise<void>;
  addTodo: (raw: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  setTodosPinned: (v: boolean) => void;
  addWatch: (url: string) => Promise<string | null>;
  toggleWatch: (id: string) => Promise<void>;
  removeWatch: (id: string) => Promise<void>;
}

const WATCH_HUES = [358, 215, 165, 262, 32, 205];

const toTodo = (r: TodoRow): Todo => ({ id: r.id, text: r.text, tag: r.tag, done: !!r.done });
const toFolder = (r: FolderRow): Folder => ({ id: r.id, name: r.name, parentId: r.parentId, createdAt: r.createdAt });

/** A store Note back into the row shape the vault stores (tags are JSON on disk). */
const noteToRow = (n: Note): NoteRow => ({
  id: n.id,
  title: n.title,
  folderId: n.folderId,
  tags: JSON.stringify(n.tags),
  body: n.body,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});
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

/**
 * The journal key never enters the zustand store: state gets serialised by
 * devtools, logged, and inspected. It lives here, in module scope, and dies with
 * the process. Locking clears it and every decrypted string alongside it.
 */
let journalKey: Uint8Array | null = null;

/**
 * Rescue entries written before the journal used a passphrase.
 *
 * They are AES-GCM under a random Keychain key, hex-encoded, and their plaintext
 * is a bare string rather than `{text, words}`. They are readable exactly once:
 * now, while the old key still exists. Retiring that key without re-encrypting
 * them first would destroy every one of them, silently, with nothing to show for
 * it but an empty journal.
 */
async function migrateLegacyEntries(newKey: Uint8Array): Promise<number> {
  if (!vault) return 0;
  const rows = await vault.journal();
  const legacy = rows.filter((r) => isLegacyEnvelope(r.iv));
  if (!legacy.length) return 0;

  const old = await legacyKey();
  if (!old) return 0; // the key is gone; the ciphertext is already unrecoverable

  // The day is the identity now, but a legacy vault could hold two entries for
  // one day. Writing both to `j<day>` would silently destroy the first — and
  // then we'd delete the only key that could have read it back.
  const taken = new Set(rows.filter((r) => !isLegacyEnvelope(r.iv)).map((r) => r.id));

  let moved = 0;
  for (const r of legacy) {
    const text = openLegacy(old, { iv: r.iv, ct: r.ct });
    if (text === null) continue; // not ours, or tampered — leave it exactly as it is
    const words = text.trim().split(/\s+/).filter(Boolean).length;

    let id = sync.journalId(r.day);
    for (let n = 2; taken.has(id); n++) id = `${sync.journalId(r.day)}-${n}`;
    taken.add(id);

    // Write the re-sealed copy BEFORE dropping the old row. A crash between the
    // two must leave a duplicate, never a hole.
    await vault.putJournal({
      id,
      day: r.day,
      createdAt: r.createdAt,
      updatedAt: Date.now(),
      ...encryptJSON(newKey, { text, words }),
    });
    if (id !== r.id) await vault.deleteJournal(r.id);
    moved++;
  }

  // Only once every legacy entry is re-sealed. One unreadable row and we keep
  // the key: a duplicate is recoverable, a destroyed key is not.
  if (moved === legacy.length) await destroyLegacyKey();
  return moved;
}

/** Decrypt every entry we can and publish them. Blobs we can't open are skipped, not lost. */
async function openJournal(key: Uint8Array): Promise<void> {
  if (!vault) return;
  journalKey = key;

  const rows = await vault.journal();
  const entries: JournalEntry[] = [];
  for (const r of rows) {
    const payload = decryptJSON<{ text: string; words: number }>(key, { iv: r.iv, ct: r.ct });
    if (!payload || typeof payload.text !== 'string') continue; // wrong key or tampered — GCM caught it
    entries.push({ id: r.id, day: r.day, text: payload.text, words: payload.words, createdAt: r.createdAt });
  }
  entries.sort((a, b) => b.day - a.day);

  // The decrypt loop is async. If the user hit Lock while it ran, publishing now
  // would put every plaintext entry back on screen behind a "locked" badge.
  if (journalKey !== key) return;
  useData.setState({ journal: entries, journalUnlocked: true, journalCount: rows.length });
}

export const useData = create<State>((set, get) => ({
  ready: false,
  notes: [],
  folders: [],
  memory: {},
  todos: [],
  todosPinned: false,
  watch: [],
  journal: [],
  journalUnlocked: false,
  journalCount: 0,
  journalCrypto: null,
  journalCached: false,
  autoSyncOn: true,
  userName: '',
  notifyMode: 'normal',
  hapticLevel: 'high',
  bytes: [],
  byteMemory: {},
  byteStreak: { count: 0, last: 0 },

  hydrate: async () => {
    vault = await openVault();
    const [noteRows, folderRows, srsRows, ledger, todoRows, watchRows, journalRows, digest, cryptoRaw, hapticRaw, byteRows, byteMemRaw, byteStreakRaw, notifyRaw, userNameRaw] = await Promise.all([
      vault.notes(),
      vault.folders(),
      vault.srs(),
      vault.ledger(),
      vault.todos(),
      vault.watch(),
      vault.journal(),
      vault.getMeta('digest'),
      vault.getMeta('journalCrypto'),
      vault.getMeta('haptics'),
      vault.listRows('bytes' as ListName),
      vault.getMeta('byteMemory'),
      vault.getMeta('byteStreak'),
      vault.getMeta('notifyMode'),
      vault.getMeta('userName'),
    ]);

    const bytes = (byteRows as sync.SyncRow[]).map(bytesLib.toCard).filter((c): c is bytesLib.ByteCard => !!c);
    let byteMemory: Record<string, bytesMemory.ByteMemory> = {};
    try {
      byteMemory = byteMemRaw ? (JSON.parse(byteMemRaw) as Record<string, bytesMemory.ByteMemory>) : {};
    } catch {
      byteMemory = {};
    }
    let byteStreak = { count: 0, last: 0 };
    try {
      if (byteStreakRaw) byteStreak = JSON.parse(byteStreakRaw) as { count: number; last: number };
    } catch {
      byteStreak = { count: 0, last: 0 };
    }

    // Notification personality — migrate the old digest flag if no mode is saved.
    const isMode = (m: string | null): m is notify.NotifyMode => m === 'off' || m === 'normal' || m === 'high' || m === 'obsessed';
    const notifyMode: notify.NotifyMode = isMode(notifyRaw) ? notifyRaw : digest === '0' ? 'off' : 'normal';
    const userName = typeof userNameRaw === 'string' ? userNameRaw : '';

    // Apply the saved haptic strength to the motion engine before anything fires.
    const hapticLevel: HapticLevel = (hapticRaw as HapticLevel) || 'high';
    setHapticStrength(hapticLevel);

    let journalCrypto: VaultCrypto | null = null;
    try {
      journalCrypto = cryptoRaw ? (JSON.parse(cryptoRaw) as VaultCrypto) : null;
    } catch {
      journalCrypto = null;
    }

    set({
      ready: true,
      notes: noteRows.map(toNote),
      folders: folderRows.map(toFolder).sort((a, b) => a.createdAt - b.createdAt),
      memory: deriveMemory(ledger, srsRows),
      todos: todoRows.map(toTodo),
      watch: watchRows.map(toWatch),
      // Sealed rows are counted, never opened, until Face ID hands us the key.
      journal: [],
      journalUnlocked: false,
      journalCount: journalRows.length,
      journalCrypto,
      journalCached: journalCrypto ? await hasCachedKey(journalCrypto.salt) : false,
      // Auto-sync defaults ON; only an explicit '0' turns it off.
      autoSyncOn: (await vault.getMeta('autoSync')) !== '0',
      notifyMode,
      userName,
      hapticLevel,
      bytes,
      byteMemory,
      byteStreak,
    });
    void get().refreshSignals();
  },

  setAutoSync: async (on) => {
    if (vault) await vault.setMeta('autoSync', on ? '1' : '0');
    set({ autoSyncOn: on });
  },

  /** Reading the cached key IS the Face ID prompt. No cache -> ask the passphrase. */
  unlockJournal: async () => {
    const jc = get().journalCrypto;
    if (!vault || !jc) return false;
    const key = await cachedKey(jc.salt);
    if (!key) return false;
    await openJournal(key);
    return true;
  },

  /**
   * Six hundred thousand hash rounds on the JS thread. It is slow on purpose —
   * that cost is what a thief pays per guess — and it happens once per device,
   * because the derived key is then cached behind Face ID.
   */
  unlockJournalWithPassphrase: async (pass) => {
    const jc = get().journalCrypto;
    if (!vault || !jc) return { ok: false, error: 'This vault has no passphrase yet.' };

    const key = await deriveKey(pass, jc.salt, jc.iterations ?? DEFAULT_ITERATIONS);
    if (!checkVerifier(key, jc.verifier)) return { ok: false, error: 'Wrong passphrase.' };

    await cacheKey(key, jc.salt);
    await migrateLegacyEntries(key);
    await openJournal(key);
    set({ journalCached: true });
    return { ok: true };
  },

  /*
   * Order matters more than it looks.
   *
   * `migrateLegacyEntries` re-encrypts every old entry under the new key and then
   * destroys the random key that was the only way to read them. If the process
   * dies before `journalCrypto` is written, the salt and verifier for the new key
   * never existed: on relaunch the app sees a vault with no passphrase, offers to
   * set one, mints a *different* salt — and every entry is lost for good.
   *
   * So the key parameters are made durable first. A crash after that leaves a
   * journal that simply asks for the passphrase, which is the correct state.
   */
  setJournalPassphrase: async (pass) => {
    if (!vault) return { ok: false, error: 'Not ready.' };
    if (get().journalCrypto) return { ok: false, error: 'This vault already has a passphrase.' };
    if (pass.trim().length < 8) return { ok: false, error: 'Use at least 8 characters.' };

    const salt = randomSalt();
    const iterations = CURRENT_ITERATIONS;
    const key = await deriveKey(pass, salt, iterations);
    const jc: VaultCrypto = { salt, iterations, verifier: makeVerifier(key) };

    await vault.setMeta('journalCrypto', JSON.stringify(jc));
    await cacheKey(key, salt);
    set({ journalCrypto: jc, journalCached: true });

    await migrateLegacyEntries(key);
    await openJournal(key);
    return { ok: true };
  },

  lockJournal: () => {
    journalKey = null;
    set({ journal: [], journalUnlocked: false });
  },

  /*
   * One entry per day, exactly as on the desktop. The id is the day, so writing
   * on the phone at noon and the laptop at midnight edits the SAME entry rather
   * than leaving two copies of one Tuesday.
   */
  addJournalEntry: async (text) => {
    if (!vault || !journalKey || !text.trim()) return;
    const clean = text.trim();
    const words = clean.split(/\s+/).filter(Boolean).length;
    const day = dates.todayEpochDay();
    const id = sync.journalId(day);
    const existing = get().journal.find((e) => e.id === id);
    const now = Date.now();

    const row: JournalRow = {
      id,
      day,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...encryptJSON(journalKey, { text: clean, words }),
    };
    await vault.putJournal(row);

    const entry: JournalEntry = { id, day, text: clean, words, createdAt: row.createdAt };
    const rest = get().journal.filter((e) => e.id !== id);
    set({
      journal: [entry, ...rest].sort((a, b) => b.day - a.day),
      journalCount: rest.length + 1,
    });
  },

  removeJournalEntry: async (id) => {
    if (!vault) return;
    await vault.deleteJournal(id);
    await vault.tombstone(id, Date.now()); // or the laptop syncs it straight back
    set({ journal: get().journal.filter((e) => e.id !== id), journalCount: Math.max(0, get().journalCount - 1) });
  },

  syncNow: async () => {
    // One sync at a time — manual and auto share this lock, so a background sync
    // and a Sync-now tap can never run two concurrent pushes.
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      // `suspend` for the whole sync: the hydrate below changes state, and without
      // this its own changes would re-arm the auto-sync timer into a loop.
      suspend = true;
      try {
        const outcome = await runSync();
        lastSyncAt = Date.now(); // resets the auto-sync clock, manual or automatic
        // A passphrase conflict can't fix itself — stop auto-retrying it every
        // minute; a successful sync clears the block.
        autoBlocked = !!outcome.conflict;
        if (outcome.ok) {
          await get().hydrate();
          // Entries that arrived from the other device are still sealed; if the
          // journal is open, decrypt them now rather than showing a stale list.
          if (journalKey) await openJournal(journalKey);
        }
        return outcome;
      } finally {
        suspend = false;
        syncInFlight = null;
      }
    })();
    return syncInFlight;
  },

  /**
   * The badge is the free stand-in for a widget. Re-arm the digest too: its body
   * is fixed at schedule time, so stale counts would fire tomorrow otherwise.
   */
  refreshSignals: async () => {
    const s = get();
    const open = s.todos.filter((t) => !t.done).length;
    await syncBadge(open);
    const ctx: notify.NotifyCtx = { name: s.userName, due: dueCount(s.memory), todos: open, streak: s.byteStreak.count };
    await scheduleNudges(s.notifyMode, ctx, dates.todayEpochDay());
  },

  setUserName: async (name) => {
    set({ userName: name });
    if (vault) await vault.setMeta('userName', name);
    await get().refreshSignals(); // re-word the scheduled nudges with the new name
  },

  setNotifyMode: async (mode) => {
    set({ notifyMode: mode });
    if (vault) await vault.setMeta('notifyMode', mode);
    if (mode === 'off') await cancelNudges();
    else await get().refreshSignals();
  },

  testNotify: async (mode) => {
    const s = get();
    const open = s.todos.filter((t) => !t.done).length;
    const ctx: notify.NotifyCtx = { name: s.userName, due: dueCount(s.memory), todos: open, streak: s.byteStreak.count };
    return fireTestNotify(mode, ctx, Date.now()); // a fresh line each tap
  },

  setHapticLevel: async (level) => {
    setHapticStrength(level); // engine first, so the sample tap below uses it
    set({ hapticLevel: level });
    if (vault) await vault.setMeta('haptics', level);
    if (level !== 'off') haptics.commit(); // let them feel the new strength
  },

  // Bytes are their own world — reading and answering update only the Bytes
  // memory (own spaced-rep). Nothing here touches notes or the FSRS review.
  seeByte: async (id) => {
    const today = dates.todayEpochDay();
    const prev = get().byteMemory[id] ?? bytesMemory.newMemory(id, today);
    const next = { ...get().byteMemory, [id]: bytesMemory.see(prev, today) };
    set({ byteMemory: next });
    if (vault) await vault.setMeta('byteMemory', JSON.stringify(next));
  },

  answerByte: async (id, grade) => {
    const today = dates.todayEpochDay();
    const prev = get().byteMemory[id] ?? bytesMemory.newMemory(id, today);
    const next = { ...get().byteMemory, [id]: bytesMemory.review(prev, grade, today) };
    set({ byteMemory: next });
    if (vault) await vault.setMeta('byteMemory', JSON.stringify(next));
  },

  markByteDay: async () => {
    const today = dates.todayEpochDay();
    const s = get().byteStreak;
    if (s.last === today) return; // already counted today
    const count = s.last === today - 1 ? s.count + 1 : 1; // continue the run, or restart it
    const next = { count, last: today };
    set({ byteStreak: next });
    if (vault) await vault.setMeta('byteStreak', JSON.stringify(next));
  },

  createNote: async (title = 'Untitled note', folderId?) => {
    if (!vault) return '';
    const now = Date.now();
    const known = get().folders;

    // Put it in the requested folder if that folder exists, else the first one,
    // else a freshly-minted default so a brand-new vault always has a home.
    let target = folderId && known.some((f) => f.id === folderId) ? folderId : known[0]?.id;
    if (!target) {
      target = 'f_inbox';
      await vault.putFolder({ id: target, name: 'Notes', parentId: null, createdAt: now, updatedAt: now });
      set({ folders: [{ id: target, name: 'Notes', parentId: null, createdAt: now }] });
    }

    const row: NoteRow = { id: uid('n'), title, folderId: target, tags: '[]', body: '', createdAt: now, updatedAt: now };
    await vault.putNote(row);
    set({ notes: [toNote(row), ...get().notes] });
    return row.id;
  },

  moveNote: async (id, folderId) => {
    if (!vault) return;
    const cur = get().notes.find((n) => n.id === id);
    if (!cur || cur.folderId === folderId) return;
    const next: Note = { ...cur, folderId, updatedAt: Date.now() };
    await vault.putNote(noteToRow(next));
    set({ notes: get().notes.map((n) => (n.id === id ? next : n)) });
  },

  createFolder: async (name) => {
    if (!vault) return '';
    const clean = name.trim() || 'New folder';
    const now = Date.now();
    const id = uid('f');
    await vault.putFolder({ id, name: clean, parentId: null, createdAt: now, updatedAt: now });
    set({ folders: [...get().folders, { id, name: clean, parentId: null, createdAt: now }] });
    return id;
  },

  renameFolder: async (id, name) => {
    if (!vault) return;
    const clean = name.trim();
    const cur = get().folders.find((f) => f.id === id);
    if (!clean || !cur) return;
    await vault.putFolder({ id, name: clean, parentId: cur.parentId, createdAt: cur.createdAt, updatedAt: Date.now() });
    set({ folders: get().folders.map((f) => (f.id === id ? { ...f, name: clean } : f)) });
  },

  deleteFolder: async (id) => {
    if (!vault) return;
    const remaining = get().folders.filter((f) => f.id !== id);
    // Never delete the last folder — a note must always have a home.
    if (remaining.length === 0) return;

    const now = Date.now();
    const fallback = remaining[0].id;
    // Rehome this folder's notes BEFORE deleting it, so nothing is orphaned.
    const orphans = get().notes.filter((n) => n.folderId === id);
    for (const n of orphans) {
      await vault.putNote(noteToRow({ ...n, folderId: fallback, updatedAt: now }));
    }
    await vault.deleteFolder(id);
    await vault.tombstone(id, now); // the delete must propagate to the other devices

    set({
      folders: remaining,
      notes: get().notes.map((n) => (n.folderId === id ? { ...n, folderId: fallback, updatedAt: now } : n)),
    });
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

    // "Again" means see it again today. Scheduling it `ivl` days out would hide
    // the one note you just admitted you'd forgotten — and it would disagree with
    // `replayLedger`, so the next sync would silently pull the date back anyway.
    const dueDay = grade === 1 ? today : today + ivl;

    await vault.addLedger({ noteId: id, day: today, grade, ivl });
    await vault.putSrs({ noteId: id, ease: prev?.ease ?? 2.5, ivl, dueDay });

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
    await vault.tombstone(id, Date.now()); // else the laptop syncs it straight back
    set({ todos: get().todos.filter((t) => t.id !== id) });
    void get().refreshSignals();
  },

  // The widget-sync subscription (see widgetSync.ts) reacts to this to start or
  // end the today's-list Live Activity; the setter itself just flips the flag.
  setTodosPinned: (v) => set({ todosPinned: v }),

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
      updatedAt: Date.now(),
      // The desktop's card renders these; inventing them here beats it rendering blanks.
      hue: WATCH_HUES[Math.floor(Math.random() * WATCH_HUES.length)],
      tags: [],
      note: '',
      added: 'just now',
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
      updatedAt: Date.now(),
    });
    const rows = await vault.watch();
    set({ watch: rows.map(toWatch) });
  },

  removeWatch: async (id) => {
    if (!vault) return;
    await vault.deleteWatch(id);
    await vault.tombstone(id, Date.now());
    set({ watch: get().watch.filter((w) => w.id !== id) });
  },
}));

/*
 * Auto-sync.
 *
 * When you make changes, a background sync is scheduled — debounced, so a burst
 * of edits settles into ONE sync rather than a storm of commits, and rate-capped
 * so it never runs more than once a minute.
 *
 * The loop it must avoid: sync -> hydrate -> state changes -> schedule -> sync…
 * `suspend` is raised for the whole duration of an auto-sync, so the state
 * changes its own hydrate produces do not re-arm the timer. The subscription
 * fires only on genuine user edits.
 */
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<SyncOutcome> | null = null;
let suspend = false;
// A crypto-conflict blocks auto-retries until a manual sync resolves it.
let autoBlocked = false;
// Seeded to "now" so the initial hydrate on launch does NOT trigger a sync 12s
// after every start — the first auto-sync waits out the min-gap like any other.
let lastSyncAt = Date.now();

const AUTO_DEBOUNCE = 12_000; // let a burst of edits settle
const AUTO_MIN_GAP = 60_000; // and never sync more than once a minute

async function runAutoSync() {
  autoTimer = null;
  if (autoBlocked || !useData.getState().autoSyncOn) return;

  const since = Date.now() - lastSyncAt;
  if (since < AUTO_MIN_GAP) {
    autoTimer = setTimeout(runAutoSync, AUTO_MIN_GAP - since); // too soon — wait it out
    return;
  }
  // syncNow carries the mutex + suspend and no-ops cleanly when unconnected.
  await useData.getState().syncNow();
}

function scheduleAutoSync() {
  if (suspend || syncInFlight || autoBlocked) return;
  if (!useData.getState().autoSyncOn) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(runAutoSync, AUTO_DEBOUNCE);
}

// Re-arm on any real change to synced data — never on the sync's own writes.
useData.subscribe((s, prev) => {
  if (
    s.notes !== prev.notes ||
    s.folders !== prev.folders ||
    s.todos !== prev.todos ||
    s.watch !== prev.watch ||
    s.journalCount !== prev.journalCount ||
    s.memory !== prev.memory
  ) {
    scheduleAutoSync();
  }
});

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
