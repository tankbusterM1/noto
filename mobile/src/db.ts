import { Platform } from 'react-native';
import { dates } from '../core';

/*
 * Persistence.
 *
 * Two adapters behind one `Vault` interface:
 *   · SqliteVault  — expo-sqlite, on device (openDatabaseAsync/runAsync/getAllAsync)
 *   · MemoryVault  — the browser preview. expo-sqlite's web support is alpha and
 *                    needs COOP/COEP headers for SharedArrayBuffer, so we don't
 *                    pay that cost just to render a preview.
 *
 * Three deliberate schema decisions, each fixing a bug the desktop schema has
 * that would cause SILENT DATA LOSS once two devices sync:
 *
 *   1. `updatedAt` is epoch MILLISECONDS, not epoch days. Last-writer-wins at
 *      day granularity means two edits to one note on the same day from two
 *      devices is a coin flip.
 *   2. `uid()` carries a per-install device salt. The desktop's
 *      `Date.now()*1000 + idSeq++` restarts idSeq at 0 every session, so two
 *      devices creating their first note in the same millisecond mint the SAME
 *      id and the merge silently overwrites one.
 *   3. `tombstones` are durable and survive the 30-day purge, so a device that
 *      has been offline for longer can't resurrect a deleted note.
 */

export interface NoteRow {
  id: string;
  title: string;
  folderId: string;
  /** JSON-encoded string[] */
  tags: string;
  /** markdown */
  body: string;
  createdAt: number;
  /** epoch ms — see decision (1) */
  updatedAt: number;
}

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
}

export interface SrsRow {
  noteId: string;
  ease: number;
  ivl: number;
  dueDay: number;
}

/** Append-only. This is the source of truth: FSRS memory is *derived* from it. */
export interface LedgerRow {
  id?: number;
  noteId: string;
  day: number;
  grade: number;
  ivl: number;
}

export interface TombstoneRow {
  id: string;
  deletedAt: number;
  /** Set when the note leaves the bin for good; the row itself never dies. */
  purgedAt: number | null;
}

export interface TodoRow {
  id: string;
  text: string;
  tag: string | null;
  /** 0/1 — SQLite has no boolean. */
  done: number;
  createdAt: number;
  updatedAt: number;
}

/** Only ciphertext ever touches disk. There is no plaintext column, by design. */
export interface JournalRow {
  id: string;
  /** Absolute epoch-day, so entries age correctly across timezones. */
  day: number;
  iv: string;
  ct: string;
  createdAt: number;
}

export type WatchKind = 'video' | 'article' | 'paper';

export interface WatchRow {
  id: string;
  kind: WatchKind;
  title: string;
  source: string;
  url: string;
  /** 0 = unknown; we don't fake a duration we couldn't read. */
  mins: number;
  done: number;
  addedAt: number;
}

export interface Vault {
  init(): Promise<void>;
  notes(): Promise<NoteRow[]>;
  folders(): Promise<FolderRow[]>;
  srs(): Promise<SrsRow[]>;
  ledger(): Promise<LedgerRow[]>;
  tombstones(): Promise<TombstoneRow[]>;
  putNote(n: NoteRow): Promise<void>;
  putFolder(f: FolderRow): Promise<void>;
  putSrs(s: SrsRow): Promise<void>;
  addLedger(l: LedgerRow): Promise<void>;
  trashNote(id: string, at: number): Promise<void>;
  todos(): Promise<TodoRow[]>;
  putTodo(t: TodoRow): Promise<void>;
  deleteTodo(id: string): Promise<void>;
  watch(): Promise<WatchRow[]>;
  putWatch(w: WatchRow): Promise<void>;
  deleteWatch(id: string): Promise<void>;
  journal(): Promise<JournalRow[]>;
  putJournal(j: JournalRow): Promise<void>;
  deleteJournal(id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

// ── ids ───────────────────────────────────────────────────────────────
// Not cryptographic — it only has to make cross-device collisions impossible.
let salt = 'zzzz';
let seq = 0;

export function deviceSalt(): string {
  return salt;
}

export function uid(prefix: string): string {
  const ms = Date.now().toString(36);
  const n = (seq++ % 1296).toString(36).padStart(2, '0');
  return `${prefix}_${ms}${n}_${salt}`;
}

function randomSalt(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

// ── SQLite (device) ───────────────────────────────────────────────────
const DDL = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, parentId TEXT);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, folderId TEXT NOT NULL,
  tags TEXT NOT NULL, body TEXT NOT NULL,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS srs (
  noteId TEXT PRIMARY KEY NOT NULL, ease REAL NOT NULL,
  ivl INTEGER NOT NULL, dueDay INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, noteId TEXT NOT NULL,
  day INTEGER NOT NULL, grade INTEGER NOT NULL, ivl INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT PRIMARY KEY NOT NULL, deletedAt INTEGER NOT NULL, purgedAt INTEGER);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, tag TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS watch (
  id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  source TEXT NOT NULL, url TEXT NOT NULL, mins INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0, addedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS journal (
  id TEXT PRIMARY KEY NOT NULL, day INTEGER NOT NULL,
  iv TEXT NOT NULL, ct TEXT NOT NULL, createdAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_note ON ledger(noteId);
`;

type SqliteDb = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
};

class SqliteVault implements Vault {
  private db!: SqliteDb;

  async init() {
    // Imported lazily so the web bundle never pulls the wasm build.
    const SQLite = await import('expo-sqlite');
    this.db = (await SQLite.openDatabaseAsync('noto.db')) as unknown as SqliteDb;
    await this.db.execAsync(DDL);
  }

  notes = () => this.db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY updatedAt DESC');
  folders = () => this.db.getAllAsync<FolderRow>('SELECT * FROM folders');
  srs = () => this.db.getAllAsync<SrsRow>('SELECT * FROM srs');
  ledger = () => this.db.getAllAsync<LedgerRow>('SELECT * FROM ledger');
  tombstones = () => this.db.getAllAsync<TombstoneRow>('SELECT * FROM tombstones');

  async putNote(n: NoteRow) {
    await this.db.runAsync(
      `INSERT INTO notes (id,title,folderId,tags,body,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, folderId=excluded.folderId, tags=excluded.tags,
         body=excluded.body, updatedAt=excluded.updatedAt`,
      [n.id, n.title, n.folderId, n.tags, n.body, n.createdAt, n.updatedAt],
    );
  }

  async putFolder(f: FolderRow) {
    await this.db.runAsync(
      `INSERT INTO folders (id,name,parentId) VALUES (?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, parentId=excluded.parentId`,
      [f.id, f.name, f.parentId],
    );
  }

  async putSrs(s: SrsRow) {
    await this.db.runAsync(
      `INSERT INTO srs (noteId,ease,ivl,dueDay) VALUES (?,?,?,?)
       ON CONFLICT(noteId) DO UPDATE SET ease=excluded.ease, ivl=excluded.ivl, dueDay=excluded.dueDay`,
      [s.noteId, s.ease, s.ivl, s.dueDay],
    );
  }

  async addLedger(l: LedgerRow) {
    await this.db.runAsync('INSERT INTO ledger (noteId,day,grade,ivl) VALUES (?,?,?,?)', [
      l.noteId,
      l.day,
      l.grade,
      l.ivl,
    ]);
  }

  async trashNote(id: string, at: number) {
    // The ledger rows stay: review history must survive a restore, and the
    // append-only ledger is what makes sync conflict-free.
    await this.db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    await this.db.runAsync('DELETE FROM srs WHERE noteId = ?', [id]);
    await this.db.runAsync(
      'INSERT INTO tombstones (id,deletedAt,purgedAt) VALUES (?,?,NULL) ON CONFLICT(id) DO NOTHING',
      [id, at],
    );
  }

  todos = () => this.db.getAllAsync<TodoRow>('SELECT * FROM todos ORDER BY done ASC, createdAt DESC');

  async putTodo(t: TodoRow) {
    await this.db.runAsync(
      `INSERT INTO todos (id,text,tag,done,createdAt,updatedAt) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET text=excluded.text, tag=excluded.tag,
         done=excluded.done, updatedAt=excluded.updatedAt`,
      [t.id, t.text, t.tag, t.done, t.createdAt, t.updatedAt],
    );
  }

  async deleteTodo(id: string) {
    await this.db.runAsync('DELETE FROM todos WHERE id = ?', [id]);
  }

  watch = () => this.db.getAllAsync<WatchRow>('SELECT * FROM watch ORDER BY done ASC, addedAt DESC');

  async putWatch(w: WatchRow) {
    await this.db.runAsync(
      `INSERT INTO watch (id,kind,title,source,url,mins,done,addedAt) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title,
         source=excluded.source, url=excluded.url, mins=excluded.mins, done=excluded.done`,
      [w.id, w.kind, w.title, w.source, w.url, w.mins, w.done, w.addedAt],
    );
  }

  async deleteWatch(id: string) {
    await this.db.runAsync('DELETE FROM watch WHERE id = ?', [id]);
  }

  journal = () => this.db.getAllAsync<JournalRow>('SELECT * FROM journal ORDER BY createdAt DESC');

  async putJournal(j: JournalRow) {
    await this.db.runAsync(
      `INSERT INTO journal (id,day,iv,ct,createdAt) VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET iv=excluded.iv, ct=excluded.ct, day=excluded.day`,
      [j.id, j.day, j.iv, j.ct, j.createdAt],
    );
  }

  async deleteJournal(id: string) {
    await this.db.runAsync('DELETE FROM journal WHERE id = ?', [id]);
  }

  async getMeta(key: string) {
    const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.runAsync(
      'INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value],
    );
  }
}

// ── Memory (web preview) ──────────────────────────────────────────────
class MemoryVault implements Vault {
  private n = new Map<string, NoteRow>();
  private f = new Map<string, FolderRow>();
  private s = new Map<string, SrsRow>();
  private l: LedgerRow[] = [];
  private tomb = new Map<string, TombstoneRow>();
  private m = new Map<string, string>();
  private td = new Map<string, TodoRow>();
  private wt = new Map<string, WatchRow>();
  private jr = new Map<string, JournalRow>();
  private autoId = 1;

  async init() {}
  async notes() {
    return [...this.n.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async folders() {
    return [...this.f.values()];
  }
  async srs() {
    return [...this.s.values()];
  }
  async ledger() {
    return [...this.l];
  }
  async tombstones() {
    return [...this.tomb.values()];
  }
  async putNote(n: NoteRow) {
    this.n.set(n.id, { ...n });
  }
  async putFolder(f: FolderRow) {
    this.f.set(f.id, { ...f });
  }
  async putSrs(s: SrsRow) {
    this.s.set(s.noteId, { ...s });
  }
  async addLedger(l: LedgerRow) {
    this.l.push({ ...l, id: this.autoId++ });
  }
  async trashNote(id: string, at: number) {
    this.n.delete(id);
    this.s.delete(id);
    if (!this.tomb.has(id)) this.tomb.set(id, { id, deletedAt: at, purgedAt: null });
  }
  async todos() {
    return [...this.td.values()].sort((a, b) => a.done - b.done || b.createdAt - a.createdAt);
  }
  async putTodo(t: TodoRow) {
    this.td.set(t.id, { ...t });
  }
  async deleteTodo(id: string) {
    this.td.delete(id);
  }
  async watch() {
    return [...this.wt.values()].sort((a, b) => a.done - b.done || b.addedAt - a.addedAt);
  }
  async putWatch(w: WatchRow) {
    this.wt.set(w.id, { ...w });
  }
  async deleteWatch(id: string) {
    this.wt.delete(id);
  }
  async journal() {
    return [...this.jr.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  async putJournal(j: JournalRow) {
    this.jr.set(j.id, { ...j });
  }
  async deleteJournal(id: string) {
    this.jr.delete(id);
  }
  async getMeta(key: string) {
    return this.m.get(key) ?? null;
  }
  async setMeta(key: string, value: string) {
    this.m.set(key, value);
  }
}

// ── seed + open ───────────────────────────────────────────────────────
const SEED_FOLDER = 'f_seed_cs';

const SEED_NOTES: { title: string; tags: string[]; body: string; reviews?: number[] }[] = [
  {
    title: 'B-Trees',
    tags: ['systems', 'data-structures'],
    body: '## Why B-Trees\n\nDisk seeks dominate. A B-Tree keeps the fan-out high so the tree stays shallow — fewer seeks per lookup.\n\n- order *m* → up to *m* children\n- all leaves at the same depth\n- splits propagate upward',
    reviews: [3, 3, 4],
  },
  {
    title: 'Self-Attention',
    tags: ['ai', 'transformers'],
    body: '## Scaled dot-product\n\n`softmax(QKᵀ / √d) · V`\n\nThe √d divisor keeps the logits out of softmax saturation as dimension grows.',
    reviews: [3, 2],
  },
  {
    title: 'Consistent Hashing',
    tags: ['systems', 'distributed'],
    body: 'Map both nodes and keys onto a ring. Adding a node only moves the keys between it and its predecessor — *K/n* instead of *K*.',
    reviews: [4],
  },
  {
    title: 'Raft — leader election',
    tags: ['distributed'],
    body: 'Randomised election timeouts break symmetry so two candidates rarely split the vote twice in a row.',
  },
];

async function seedIfEmpty(v: Vault) {
  const existing = await v.notes();
  if (existing.length) return;

  const today = dates.todayEpochDay();
  await v.putFolder({ id: SEED_FOLDER, name: 'Computer Science', parentId: null });

  for (const seed of SEED_NOTES) {
    const id = uid('n');
    const now = Date.now();
    await v.putNote({
      id,
      title: seed.title,
      folderId: SEED_FOLDER,
      tags: JSON.stringify(seed.tags),
      body: seed.body,
      createdAt: now,
      updatedAt: now,
    });
    if (seed.reviews?.length) {
      let day = today - seed.reviews.length * 5;
      let ivl = 1;
      for (const grade of seed.reviews) {
        await v.addLedger({ noteId: id, day, grade, ivl });
        day += 5;
        ivl *= 2;
      }
      await v.putSrs({ noteId: id, ease: 2.5, ivl, dueDay: today + (Math.random() > 0.5 ? 0 : 3) });
    }
  }
}

let vault: Vault | null = null;

export async function openVault(): Promise<Vault> {
  if (vault) return vault;
  const v: Vault = Platform.OS === 'web' ? new MemoryVault() : new SqliteVault();
  await v.init();

  // One stable salt per install — the thing that makes ids collision-proof.
  let s = await v.getMeta('deviceSalt');
  if (!s) {
    s = randomSalt();
    await v.setMeta('deviceSalt', s);
  }
  salt = s;

  await seedIfEmpty(v);
  vault = v;
  return v;
}
