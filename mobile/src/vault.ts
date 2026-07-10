import { openVault, type ListName, type ListRow, type Vault } from './db';
import { isLegacyEnvelope } from './crypto';
import { savedRepo, token as githubToken } from './github';
import { gitapi, srs as srsLib, sync, vaultSync } from '../core';

/*
 * The phone's half of the sync translation. Twin of `src/data/vault.ts`.
 *
 * The rules it exists to enforce:
 *
 *   · Rows this app doesn't render still round-trip untouched. The phone has no
 *     Goals screen, so goals are carried verbatim rather than pushed as `[]`,
 *     which the merge would read as "still there" but the file write would erase.
 *
 *   · Only ciphertext the *desktop can read* is uploaded. Entries still sealed
 *     under the pre-sync random key are hex-encoded and hold a bare string; they
 *     are held back until they're migrated, not shipped as unreadable noise.
 *
 *   · Scheduling is replayed from the merged ledger with the SAME function the
 *     desktop uses, so `state/srs.json` converges instead of ping-ponging.
 */

const REPO_META = 'githubRepo';

export interface SyncOutcome {
  ok: boolean;
  message: string;
  /** Journal entries not uploaded because they're still in the legacy format. */
  legacyHeld?: number;
}

async function deviceName(v: Vault): Promise<string> {
  const saved = await v.getMeta('deviceName');
  if (saved) return saved;
  const name = `iphone-${Math.random().toString(36).slice(2, 8)}`;
  await v.setMeta('deviceName', name);
  return name;
}

const readJson = async <T>(v: Vault, key: string, fallback: T): Promise<T> => {
  const raw = await v.getMeta(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

// ── read ──────────────────────────────────────────────────────────────
export async function readVault(v: Vault): Promise<{ vault: sync.Vault; legacyHeld: number }> {
  const [noteRows, folderRows, srsRows, ledgerRows, journalRows, tombRows] = await Promise.all([
    v.notes(),
    v.folders(),
    v.srs(),
    v.ledger(),
    v.journal(),
    v.tombstones(),
  ]);

  let legacyHeld = 0;
  const journal: sync.JournalBlob[] = [];
  for (const j of journalRows) {
    if (isLegacyEnvelope(j.iv)) {
      legacyHeld++; // sealed with the old random key — the laptop could never open it
      continue;
    }
    journal.push({ id: j.id, day: j.day, iv: j.iv, ct: j.ct, createdAt: j.createdAt, updatedAt: j.updatedAt });
  }

  const lists = sync.emptyLists();
  for (const name of sync.LIST_NAMES) lists[name] = (await v.listRows(name as ListName)) as sync.SyncRow[];

  const scratch = await readJson<sync.SyncScratchpad | null>(v, 'scratchpad', null);

  const vault: sync.Vault = {
    notes: noteRows.map((n) => ({
      id: n.id,
      title: n.title,
      folderId: n.folderId,
      tags: JSON.parse(n.tags) as string[],
      body: n.body,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    folders: folderRows.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    srs: srsRows.map((s) => ({ noteId: s.noteId, ease: s.ease, ivl: s.ivl, dueDay: s.dueDay })),
    ledger: ledgerRows.map((l) => ({ noteId: l.noteId, day: l.day, grade: l.grade, ivl: l.ivl })),
    journal,
    scratchpad: scratch,
    lists,
    tagsPool: await readJson<string[]>(v, 'tagsPool', []),
    tombstones: tombRows.map((t) => ({ id: t.id, deletedAt: t.deletedAt })),
    crypto: await readJson<sync.VaultCrypto | null>(v, 'journalCrypto', null),
  };

  return { vault, legacyHeld };
}

// ── write ─────────────────────────────────────────────────────────────
export async function writeVault(v: Vault, merged: sync.Vault): Promise<void> {
  const tombstoned = new Set(merged.tombstones.map((t) => t.id));

  const localNotes = new Map((await v.notes()).map((n) => [n.id, n]));
  for (const n of merged.notes) {
    const cur = localNotes.get(n.id);
    if (cur && cur.updatedAt >= n.updatedAt && cur.body === n.body && cur.title === n.title) continue;
    await v.putNote({
      id: n.id,
      title: n.title,
      folderId: n.folderId,
      tags: JSON.stringify(n.tags),
      body: n.body,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    });
  }
  const alive = new Set(merged.notes.map((n) => n.id));
  for (const id of localNotes.keys()) {
    if (!alive.has(id) && tombstoned.has(id)) {
      await v.deleteNote(id);
      await v.deleteSrs(id);
    }
  }

  const localFolders = new Set((await v.folders()).map((f) => f.id));
  for (const f of merged.folders) {
    await v.putFolder({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt, updatedAt: f.updatedAt });
  }
  // A folder deleted on the laptop must go here too, or it lingers forever as a
  // ghost the phone re-uploads on every sync.
  const liveFolders = new Set(merged.folders.map((f) => f.id));
  for (const id of localFolders) if (!liveFolders.has(id) && tombstoned.has(id)) await v.deleteFolder(id);

  // The ledger is append-only: add what we don't have, never rewrite.
  const key = (l: { noteId: string; day: number; grade: number; ivl: number }) =>
    `${l.noteId}|${l.day}|${l.grade}|${l.ivl}`;
  const have = new Set((await v.ledger()).map(key));
  for (const l of merged.ledger) if (!have.has(key(l))) await v.addLedger(l);

  const byNote = new Map<string, sync.LedgerEntry[]>();
  for (const l of merged.ledger) {
    const arr = byNote.get(l.noteId);
    if (arr) arr.push(l);
    else byNote.set(l.noteId, [l]);
  }
  for (const s of merged.srs) {
    if (!alive.has(s.noteId)) continue;
    const replayed = srsLib.replayLedger(byNote.get(s.noteId) ?? []) ?? s;
    await v.putSrs({ noteId: s.noteId, ease: replayed.ease, ivl: replayed.ivl, dueDay: replayed.dueDay });
  }

  // Journal: last-writer-wins, so a rewrite on the laptop must overwrite ours.
  const localJournal = new Map((await v.journal()).map((j) => [j.id, j]));
  for (const blob of merged.journal) {
    const cur = localJournal.get(blob.id);
    if (cur && cur.updatedAt >= blob.updatedAt) continue;
    await v.putJournal({
      id: blob.id,
      day: blob.day,
      iv: blob.iv,
      ct: blob.ct,
      createdAt: blob.createdAt,
      updatedAt: blob.updatedAt,
    });
  }
  const liveJournal = new Set(merged.journal.map((b) => b.id));
  for (const id of localJournal.keys()) if (!liveJournal.has(id) && tombstoned.has(id)) await v.deleteJournal(id);

  for (const name of sync.LIST_NAMES) {
    const local = new Set((await v.listRows(name as ListName)).map((r) => r.id));
    for (const row of merged.lists[name]) await v.putListRow(name as ListName, row as ListRow);
    const live = new Set(merged.lists[name].map((r) => r.id));
    for (const id of local) if (!live.has(id) && tombstoned.has(id)) await v.deleteListRow(name as ListName, id);
  }

  for (const t of merged.tombstones) await v.tombstone(t.id, t.deletedAt);

  if (merged.tagsPool.length) await v.setMeta('tagsPool', JSON.stringify(merged.tagsPool));
  if (merged.scratchpad) await v.setMeta('scratchpad', JSON.stringify(merged.scratchpad));
  if (merged.crypto) await v.setMeta('journalCrypto', JSON.stringify(merged.crypto));
}

// ── the whole round trip ──────────────────────────────────────────────
export async function runSync(): Promise<SyncOutcome> {
  const tok = await githubToken();
  if (!tok) return { ok: false, message: 'Sign in with GitHub first.' };

  const v = await openVault();
  const saved = (await savedRepo()) ?? (await v.getMeta(REPO_META));
  const name = saved?.includes('/') ? saved.split('/')[1] : (saved ?? 'noto-vault');

  try {
    const repo = await gitapi.ensureRepo(tok, name);
    const { vault, legacyHeld } = await readVault(v);
    const result = await vaultSync.syncVault(tok, repo, vault, await deviceName(v));

    // Nothing was pushed and nothing may be written: the merged vault would carry
    // journal entries encrypted under a passphrase this phone doesn't have.
    if (result.cryptoConflict) {
      return {
        ok: false,
        legacyHeld,
        message: 'This vault was encrypted with a different journal passphrase. Nothing was synced.',
      };
    }

    await writeVault(v, result.vault);

    const { notes, ledger, lists } = result.stats;
    return {
      ok: true,
      legacyHeld,
      message: result.pushed
        ? `Synced · ${notes} notes, ${ledger} reviews, ${lists} items`
        : `Already up to date · ${notes} notes`,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const why = err.status === 401 ? 'GitHub rejected the token.' : (err.message ?? 'Unknown error');
    return { ok: false, message: `Sync failed — ${why}` };
  }
}
