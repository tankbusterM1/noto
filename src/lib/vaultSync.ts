/*
 * One sync: pull, merge, push. Shared by the PWA and the iOS app.
 *
 * The merge happens locally and the result is written whole, so a sync is always
 * a single commit describing a state that genuinely existed. If another device
 * pushes between our pull and our push, GitHub rejects the non-fast-forward ref
 * update and we start over against the new head — we never overwrite them.
 */

import {
  filesToVault,
  isVaultPath,
  mergeVaults,
  readSchema,
  vaultToFiles,
  SCHEMA,
  type MergeStats,
  type RepoFiles,
  type Vault,
} from './sync';
import { isRaceError, pull, push, type Repo } from './gitapi';

/** Files a normal repo may carry before we've ever synced into it. */
const HARMLESS = new Set(['README.md', 'LICENSE', 'LICENSE.md', '.gitignore', '.gitattributes']);

/**
 * Refuse to sync into a repo that is plainly somebody's project.
 *
 * `ensureRepo` adopts an existing repo of the right name rather than failing,
 * which is what makes "sign in and go" work. The failure mode is brutal though:
 * the first push replaces the tree, so a repo full of real source would be
 * reduced to a dozen vault files in one commit. A vault has a manifest; a
 * codebase does not.
 */
function assertLooksLikeVault(files: RepoFiles): void {
  if (files.size === 0 || files.has('manifest.json')) return;
  const strangers = [...files.keys()].filter((p) => !HARMLESS.has(p));
  if (strangers.length) {
    throw new Error(
      `That repo doesn't look like a Noto vault — it already holds ${strangers[0]}. Sync would overwrite it. Point Noto at an empty repo.`,
    );
  }
}

export interface SyncResult {
  /** The merged vault. Write this back to local storage. */
  vault: Vault;
  stats: MergeStats;
  /** False when the merge changed nothing — no commit was made. */
  pushed: boolean;
  commitSha: string | null;
  /** How many times another device forced us to re-merge. */
  retries: number;
  /**
   * The vault's journal is encrypted under a different passphrase than this
   * device's. Nothing was pushed and `vault` is your unchanged local copy —
   * merging would have imported entries you cannot read and, worse, adopted the
   * other passphrase's key parameters, orphaning the ones you can.
   */
  cryptoConflict: boolean;
}

const summarise = (device: string, s: MergeStats): string =>
  `sync from ${device}\n\n${s.notes} notes · ${s.ledger} reviews · ${s.journal} journal · ${s.deleted} deleted`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function syncVault(
  token: string,
  repo: Repo,
  local: Vault,
  device: string,
  maxAttempts = 5,
): Promise<SyncResult> {
  for (let attempt = 0; ; attempt++) {
    const remote = await pull(token, repo);

    assertLooksLikeVault(remote.files);

    // A newer app wrote this vault. Merging would silently drop every field this
    // build doesn't know about, and then push the loss back as the truth.
    if (readSchema(remote.files) > SCHEMA) {
      throw new Error('This vault was written by a newer version of Noto. Update the app before syncing.');
    }

    const { vault, stats } = mergeVaults(local, filesToVault(remote.files));

    /*
     * Stop before the push, not after. Two passphrases means two sets of
     * mutually unreadable ciphertext; going ahead would import entries this
     * device can never open and could overwrite the key parameters for the ones
     * it can. Hand back the untouched local vault and let the user decide.
     */
    if (stats.cryptoConflict) {
      return { vault: local, stats, pushed: false, commitSha: remote.headSha, retries: attempt, cryptoConflict: true };
    }

    const files = vaultToFiles(vault);

    try {
      // `isVaultPath` marks what we're authoritative for; a README, a LICENSE or
      // a CI workflow in the same repo rides through the commit untouched.
      const res = await push(token, repo, files, remote.headSha, summarise(device, stats), 'main', isVaultPath);
      return { vault, stats, pushed: res.changed, commitSha: res.commitSha, retries: attempt, cryptoConflict: false };
    } catch (e) {
      if (!isRaceError(e) || attempt + 1 >= maxAttempts) throw e;

      /*
       * Either another device landed a commit first, or GitHub has not yet
       * replicated the ref we ourselves just moved. Both look like a rejected
       * non-fast-forward, and both are cured by pulling again — but only after
       * a pause. Retrying immediately re-reads the same stale ref and fails
       * identically, burning every attempt in under a second.
       */
      await sleep(500 * (attempt + 1));
    }
  }
}
