/*
 * The vault wire format, and the merge.
 *
 * This module is deliberately PURE and self-contained: no fetch, no storage, no
 * imports. It lives in src/lib so Metro shares it verbatim with the iOS app, so
 * both platforms encode and merge by *construction* rather than by discipline.
 * If they ever disagreed, sync would silently corrupt the vault.
 *
 * Layout in the repo:
 *
 *   manifest.json           schema version
 *   notes/<id>.md           JSON-valued front matter, then the markdown body
 *   folders.json            the tree
 *   state/ledger.jsonl      APPEND-ONLY review events, one JSON object per line
 *   state/srs.json          scheduling state
 *   lists/<name>.json       todos, goals, week, rituals, ranged, watch
 *   prefs.json              the tag vocabulary
 *   journal/crypto.json     PUBLIC key parameters — salt, iterations, verifier
 *   journal/<id>.json       { iv, ct } — ciphertext only; GitHub sees noise
 *   journal/scratchpad.json ciphertext, likewise
 *   tombstones.json         deletions, so they propagate instead of resurrecting
 *
 * Why the ledger is a separate append-only file: FSRS state is DERIVED. Both
 * devices replay the same ledger and land on identical stability/difficulty, so
 * the schedule never needs conflict resolution — the ledger just union-merges.
 *
 * Why front matter uses JSON values: a title containing `: ` or a quote breaks
 * naive YAML. `title: "a: b"` parses with JSON.parse and stays diffable.
 *
 * Why the lists are untyped pass-through rows: the phone has no Goals screen. If
 * this module insisted on knowing every field, the phone would push a vault with
 * `goals: []` and quietly delete them. Instead a row is `{id, updatedAt, ...}` and
 * the fields it doesn't understand ride along untouched.
 */

/** Bumped to 2 when the lists, prefs and scratchpad joined the format. */
export const SCHEMA = 2;

export interface SyncNote {
  id: string;
  title: string;
  folderId: string;
  tags: string[];
  /** markdown */
  body: string;
  /** epoch MILLISECONDS. Day granularity would coin-flip same-day edits. */
  createdAt: number;
  updatedAt: number;
}

export interface SyncFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** Creation order. Travels because the sidebar sorts on it. */
  createdAt: number;
  /** 0 when the platform never tracked it; LWW then always prefers a real edit. */
  updatedAt: number;
}

export interface LedgerEntry {
  noteId: string;
  /** absolute epoch-day */
  day: number;
  grade: number;
  ivl: number;
}

/*
 * Scheduling state. `ease` and `ivl` are replayable from the ledger, but the
 * ledger cannot say "this note is in review and has never been reviewed" — that
 * note has no events. So membership travels explicitly.
 */
export interface SyncSrs {
  noteId: string;
  ease: number;
  ivl: number;
  /** absolute epoch-day */
  dueDay: number;
}

/*
 * One journal entry, encrypted.
 *
 * The id is derived from the day, not minted randomly, because the app's model
 * is one entry per day — "today's entry". Two devices writing on the same day
 * must land on the same id, or the journal shows the day twice and neither copy
 * is the truth. `updatedAt` then decides which text survives.
 */
export interface JournalBlob {
  id: string;
  day: number;
  iv: string;
  ct: string;
  createdAt: number;
  updatedAt: number;
}

/** The one and only id for a given day's entry, on every device. */
export const journalId = (day: number): string => `j${day}`;

/** An AES-GCM envelope. Both fields are standard base64 (see lib/b64). */
export interface Cipher {
  iv: string;
  ct: string;
}

/**
 * Public key-derivation parameters for the journal. Salt, iteration count and a
 * verifier token — no key, no passphrase. Syncing these is what lets a second
 * device derive the SAME key from the same passphrase and actually read what the
 * first device wrote. Without them, every device's ciphertext is a private island.
 *
 * The verifier is `AES-GCM(key, JSON.stringify("noto-journal-ok"))`: decrypting
 * it is how a device knows the passphrase was right before it touches an entry.
 */
export interface VaultCrypto {
  salt: string;
  iterations: number;
  verifier: Cipher;
}

/** The scratchpad, encrypted. Carries its own stamp because there is only one. */
export type SyncScratchpad = Cipher & { updatedAt: number };

/**
 * A row in one of the small collections. Only `id` and `updatedAt` are load-
 * bearing; everything else is carried verbatim so a device that has never heard
 * of a field cannot destroy it.
 */
export interface SyncRow {
  id: string;
  /** epoch MILLISECONDS */
  updatedAt: number;
  [field: string]: unknown;
}

export const LIST_NAMES = ['todos', 'goals', 'week', 'rituals', 'ranged', 'watch'] as const;
export type ListName = (typeof LIST_NAMES)[number];
export type Lists = Record<ListName, SyncRow[]>;

export const emptyLists = (): Lists => ({ todos: [], goals: [], week: [], rituals: [], ranged: [], watch: [] });

export interface Tombstone {
  id: string;
  deletedAt: number;
}

export interface Vault {
  notes: SyncNote[];
  folders: SyncFolder[];
  srs: SyncSrs[];
  ledger: LedgerEntry[];
  journal: JournalBlob[];
  scratchpad: SyncScratchpad | null;
  lists: Lists;
  tagsPool: string[];
  tombstones: Tombstone[];
  crypto: VaultCrypto | null;
}

/*
 * Only the schema version. It is tempting to record the device and a timestamp
 * here, but that would make the tree differ on every sync even when nothing
 * changed, and two idle devices would trade empty commits forever. Git already
 * stores who wrote and when; the commit message carries the device.
 */
export interface Manifest {
  schema: number;
}

export const emptyVault = (): Vault => ({
  notes: [],
  folders: [],
  srs: [],
  ledger: [],
  journal: [],
  scratchpad: null,
  lists: emptyLists(),
  tagsPool: [],
  tombstones: [],
  crypto: null,
});

// ── note serialisation ────────────────────────────────────────────────
const FM = '---';

export function serializeNote(n: SyncNote): string {
  const head = [
    `id: ${JSON.stringify(n.id)}`,
    `title: ${JSON.stringify(n.title)}`,
    `folder: ${JSON.stringify(n.folderId)}`,
    `tags: ${JSON.stringify(n.tags)}`,
    `created: ${n.createdAt}`,
    `updated: ${n.updatedAt}`,
  ].join('\n');
  return `${FM}\n${head}\n${FM}\n\n${n.body}`;
}

/** Returns null when the file isn't a note we wrote. Never throws on junk. */
export function parseNote(text: string): SyncNote | null {
  if (!text.startsWith(`${FM}\n`)) return null;
  const end = text.indexOf(`\n${FM}\n`, FM.length);
  if (end === -1) return null;

  const head = text.slice(FM.length + 1, end);
  const body = text.slice(end + FM.length + 2).replace(/^\n/, '');

  const field: Record<string, unknown> = {};
  for (const line of head.split('\n')) {
    const colon = line.indexOf(': ');
    if (colon === -1) continue;
    try {
      field[line.slice(0, colon)] = JSON.parse(line.slice(colon + 2));
    } catch {
      return null;
    }
  }

  const id = field.id;
  const title = field.title;
  const created = field.created;
  const updated = field.updated;
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  if (typeof created !== 'number' || typeof updated !== 'number') return null;

  return {
    id,
    title,
    folderId: typeof field.folder === 'string' ? field.folder : '',
    tags: Array.isArray(field.tags) ? (field.tags as string[]) : [],
    body,
    createdAt: created,
    updatedAt: updated,
  };
}

// ── ledger (JSON Lines) ───────────────────────────────────────────────
/** Identity of a review event. Two devices that saw the same review agree here. */
export const ledgerKey = (l: LedgerEntry): string => `${l.noteId}|${l.day}|${l.grade}|${l.ivl}`;

export function serializeLedger(rows: LedgerEntry[]): string {
  // Sorted so the file is stable across devices; an unstable order would make
  // every sync look like a change and produce an empty commit each time.
  const sorted = rows.slice().sort((a, b) => ledgerKey(a).localeCompare(ledgerKey(b)));
  return sorted.map((l) => JSON.stringify(l)).join('\n') + (sorted.length ? '\n' : '');
}

export function parseLedger(text: string): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const l = JSON.parse(s) as LedgerEntry;
      if (typeof l.noteId === 'string' && typeof l.day === 'number') out.push(l);
    } catch {
      // A single corrupt line must not cost the whole review history.
    }
  }
  return out;
}

// ── merge ─────────────────────────────────────────────────────────────
/**
 * Deterministic last-writer-wins.
 *
 * On an exact `updatedAt` tie we compare the serialised record, so merge(a,b)
 * and merge(b,a) agree. Without that, two devices could converge on different
 * states and each would keep "fixing" the other forever.
 */
function pickNewer<T extends { updatedAt: number }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export interface MergeStats {
  notes: number;
  folders: number;
  srs: number;
  ledger: number;
  journal: number;
  /** Rows across todos, goals, week, rituals, ranged and watch. */
  lists: number;
  deleted: number;
  /**
   * Both sides encrypted the journal under different passphrases. Neither can
   * read the other's entries; the app must ask which one the vault keeps.
   */
  cryptoConflict: boolean;
}

/** Last-writer-wins over an id-keyed collection, minus anything tombstoned. */
function mergeRows(a: SyncRow[], b: SyncRow[], tombs: Map<string, number>): SyncRow[] {
  const rows = new Map<string, SyncRow>();
  for (const r of [...a, ...b]) {
    const cur = rows.get(r.id);
    rows.set(r.id, cur ? pickNewer(cur, r) : r);
  }
  for (const [id, deletedAt] of tombs) {
    const row = rows.get(id);
    // Same rule as notes: an edit after the delete is a change of mind, not a bug.
    if (row && row.updatedAt <= deletedAt) rows.delete(id);
  }
  return [...rows.values()].sort((x, y) => x.id.localeCompare(y.id));
}

export function mergeVaults(local: Vault, remote: Vault): { vault: Vault; stats: MergeStats } {
  // 1. Deletions first — a tombstone outranks any note older than it.
  const tombs = new Map<string, number>();
  for (const t of [...local.tombstones, ...remote.tombstones]) {
    tombs.set(t.id, Math.max(tombs.get(t.id) ?? 0, t.deletedAt));
  }

  const notes = new Map<string, SyncNote>();
  for (const n of [...local.notes, ...remote.notes]) {
    const cur = notes.get(n.id);
    notes.set(n.id, cur ? pickNewer(cur, n) : n);
  }
  for (const [id, deletedAt] of tombs) {
    const n = notes.get(id);
    // An edit *after* the delete resurrects it on purpose: you changed your mind.
    if (n && n.updatedAt <= deletedAt) notes.delete(id);
  }

  const folders = new Map<string, SyncFolder>();
  for (const f of [...local.folders, ...remote.folders]) {
    const cur = folders.get(f.id);
    folders.set(f.id, cur ? pickNewer(cur, f) : f);
  }
  for (const [id, deletedAt] of tombs) {
    const f = folders.get(id);
    if (f && f.updatedAt <= deletedAt) folders.delete(id);
  }

  // 2. The ledger is append-only, so union by identity. No conflicts, ever.
  const ledger = new Map<string, LedgerEntry>();
  for (const l of [...local.ledger, ...remote.ledger]) ledger.set(ledgerKey(l), l);

  // 3. Scheduling: the sooner due date wins, so a note never hides from review
  // because the other device happened to push it further out. The numbers are
  // recomputed from the merged ledger anyway; this only decides notes with no
  // review history yet.
  const srs = new Map<string, SyncSrs>();
  for (const s of [...local.srs, ...remote.srs]) {
    const cur = srs.get(s.noteId);
    if (!cur) srs.set(s.noteId, s);
    else if (cur.dueDay !== s.dueDay) srs.set(s.noteId, cur.dueDay < s.dueDay ? cur : s);
    else srs.set(s.noteId, JSON.stringify(cur) <= JSON.stringify(s) ? cur : s);
  }
  // Follow the note, not the tombstone. A note edited after its delete comes back;
  // dropping its schedule anyway would silently retire it from review forever.
  for (const id of tombs.keys()) if (!notes.has(id)) srs.delete(id);

  // 4. The journal is editable — today's entry gets rewritten as you type — so it
  // is last-writer-wins, not a union. Union would let a stale device's morning
  // draft overwrite the evening's finished entry.
  const journal = new Map<string, JournalBlob>();
  for (const j of [...local.journal, ...remote.journal]) {
    const cur = journal.get(j.id);
    journal.set(j.id, cur ? pickNewer(cur, j) : j);
  }
  for (const [id, deletedAt] of tombs) {
    const j = journal.get(id);
    if (j && j.updatedAt <= deletedAt) journal.delete(id);
  }

  // 5. Key parameters. Two salts means two passphrases and two unreadable halves,
  // so we pick one deterministically and shout about it rather than pretending.
  const salts = [local.crypto, remote.crypto].filter((c): c is VaultCrypto => !!c);
  const cryptoConflict = salts.length === 2 && salts[0].salt !== salts[1].salt;
  const crypto = salts.length ? salts.slice().sort((a, b) => a.salt.localeCompare(b.salt))[0] : null;

  // 6. Todos, goals, week, rituals, ranged, watch — plain last-writer-wins.
  const lists = emptyLists();
  let listRows = 0;
  for (const name of LIST_NAMES) {
    lists[name] = mergeRows(local.lists?.[name] ?? [], remote.lists?.[name] ?? [], tombs);
    listRows += lists[name].length;
  }

  // 7. The tag vocabulary only ever grows; a union needs no timestamps.
  const tagsPool = [...new Set([...local.tagsPool, ...remote.tagsPool])].sort();

  const pads = [local.scratchpad, remote.scratchpad].filter((s): s is SyncScratchpad => !!s);
  const scratchpad = pads.length ? pads.reduce((a, b) => pickNewer(a, b)) : null;

  const tombstones = [...tombs].map(([id, deletedAt]) => ({ id, deletedAt })).sort((a, b) => a.id.localeCompare(b.id));

  const vault: Vault = {
    notes: [...notes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    folders: [...folders.values()].sort((a, b) => a.id.localeCompare(b.id)),
    srs: [...srs.values()].sort((a, b) => a.noteId.localeCompare(b.noteId)),
    ledger: [...ledger.values()].sort((a, b) => ledgerKey(a).localeCompare(ledgerKey(b))),
    journal: [...journal.values()].sort((a, b) => a.id.localeCompare(b.id)),
    scratchpad,
    lists,
    tagsPool,
    tombstones,
    crypto,
  };

  return {
    vault,
    stats: {
      notes: vault.notes.length,
      folders: vault.folders.length,
      srs: vault.srs.length,
      ledger: vault.ledger.length,
      journal: vault.journal.length,
      lists: listRows,
      deleted: tombstones.length,
      cryptoConflict,
    },
  };
}

// ── repo <-> vault ────────────────────────────────────────────────────
/** Path -> file contents. Exactly what gets committed. */
export type RepoFiles = Map<string, string>;

export function vaultToFiles(v: Vault): RepoFiles {
  const files: RepoFiles = new Map();
  files.set('manifest.json', JSON.stringify({ schema: SCHEMA } satisfies Manifest, null, 2) + '\n');
  files.set('folders.json', JSON.stringify(v.folders, null, 2) + '\n');
  files.set('tombstones.json', JSON.stringify(v.tombstones, null, 2) + '\n');
  files.set('state/ledger.jsonl', serializeLedger(v.ledger));
  files.set('state/srs.json', JSON.stringify(v.srs, null, 2) + '\n');
  files.set('prefs.json', JSON.stringify({ tagsPool: v.tagsPool }, null, 2) + '\n');
  for (const name of LIST_NAMES) files.set(`lists/${name}.json`, JSON.stringify(v.lists[name], null, 2) + '\n');
  if (v.crypto) files.set('journal/crypto.json', JSON.stringify(v.crypto, null, 2) + '\n');
  if (v.scratchpad) files.set('journal/scratchpad.json', JSON.stringify(v.scratchpad, null, 2) + '\n');
  for (const n of v.notes) files.set(`notes/${n.id}.md`, serializeNote(n));
  for (const j of v.journal) files.set(`journal/${j.id}.json`, JSON.stringify(j, null, 2) + '\n');
  return files;
}

/** The two journal files that are not entries. Skipped when scanning `journal/`. */
const JOURNAL_META = new Set(['journal/crypto.json', 'journal/scratchpad.json']);

const OWNED_FILES = new Set(['manifest.json', 'folders.json', 'tombstones.json', 'prefs.json', 'state/srs.json', 'state/ledger.jsonl']);

/**
 * Does the vault own this path?
 *
 * The push replaces the tree wholesale, which is how a deleted note actually
 * disappears. But the repo is a real repo: it can hold a README, a LICENSE, a
 * CI workflow. Anything this predicate rejects is carried forward untouched
 * rather than quietly deleted by a device that never heard of it.
 */
export function isVaultPath(path: string): boolean {
  if (OWNED_FILES.has(path)) return true;
  if (path.startsWith('lists/') && path.endsWith('.json')) return true;
  if (path.startsWith('notes/') && path.endsWith('.md')) return true;
  if (path.startsWith('journal/') && path.endsWith('.json')) return true;
  return false;
}

function safeJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** JSON that parses but isn't the shape we asked for is junk, not data. */
function safeArray<T>(text: string | undefined): T[] {
  const parsed = safeJson<unknown>(text, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

/**
 * The schema the remote vault was written with. A newer number means an app we
 * don't understand wrote it; syncing anyway would drop the fields we can't parse.
 *
 * A manifest that is missing, corrupt, or holds a non-number reads as OUR schema
 * rather than as 0 — a `0 > SCHEMA` comparison would fail open and let this
 * build happily overwrite a vault written by a newer one.
 */
export function readSchema(files: RepoFiles): number {
  const m = safeJson<Partial<Manifest> | null>(files.get('manifest.json'), null);
  return typeof m?.schema === 'number' && Number.isFinite(m.schema) ? m.schema : SCHEMA;
}

export function filesToVault(files: RepoFiles): Vault {
  const v = emptyVault();
  // A schema-1 vault has no folder `createdAt` and no journal `updatedAt`.
  // Defaulting them to 0 keeps every comparison a number: `undefined > n` is
  // false and `undefined - n` is NaN, either of which makes merge order random.
  v.folders = safeArray<SyncFolder>(files.get('folders.json'))
    .filter((f) => f && typeof f.id === 'string')
    .map((f) => ({ ...f, createdAt: f.createdAt ?? 0, updatedAt: f.updatedAt ?? 0 }));
  v.tombstones = safeArray<Tombstone>(files.get('tombstones.json')).filter(
    (t) => t && typeof t.id === 'string' && typeof t.deletedAt === 'number',
  );
  v.srs = safeArray<SyncSrs>(files.get('state/srs.json')).filter((s) => s && typeof s.noteId === 'string');
  v.ledger = parseLedger(files.get('state/ledger.jsonl') ?? '');
  v.crypto = safeJson<VaultCrypto | null>(files.get('journal/crypto.json'), null);
  v.scratchpad = safeJson<SyncScratchpad | null>(files.get('journal/scratchpad.json'), null);

  const prefs = safeJson<{ tagsPool?: unknown }>(files.get('prefs.json'), {});
  v.tagsPool = Array.isArray(prefs.tagsPool) ? prefs.tagsPool.filter((t): t is string => typeof t === 'string') : [];

  for (const name of LIST_NAMES) {
    // A row without an id or a stamp cannot be merged, only guessed at.
    v.lists[name] = safeArray<SyncRow>(files.get(`lists/${name}.json`)).filter(
      (r) => r && typeof r.id === 'string' && typeof r.updatedAt === 'number',
    );
  }

  for (const [path, text] of files) {
    if (path.startsWith('notes/') && path.endsWith('.md')) {
      const n = parseNote(text);
      if (n) v.notes.push(n);
    } else if (path.startsWith('journal/') && path.endsWith('.json') && !JOURNAL_META.has(path)) {
      const j = safeJson<JournalBlob | null>(text, null);
      if (j && j.id && j.ct) v.journal.push({ ...j, updatedAt: j.updatedAt ?? j.createdAt ?? 0 });
    }
  }
  return v;
}
