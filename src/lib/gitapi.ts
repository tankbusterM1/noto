/*
 * GitHub transport for the vault. Shared verbatim by the PWA and the iOS app.
 *
 * One sync = one commit. We use the Git Data API (blob -> tree -> commit -> ref)
 * rather than the Contents API, because Contents commits one file per request:
 * a sync of thirty notes would land as thirty commits, and a crash halfway
 * through would leave the repo in a state that never existed on any device.
 *
 * Two deliberate choices:
 *
 *   - Reading uses `Accept: application/vnd.github.raw`, so GitHub hands back
 *     decoded UTF-8 text. Writing sends `encoding: "utf-8"`. Neither direction
 *     touches base64, which spares us TextDecoder — absent from Hermes.
 *
 *   - The ref update is NOT forced. Our commit's parent is the head we read, so
 *     if another device pushed in between, GitHub rejects the update as a
 *     non-fast-forward. That rejection is the whole safety mechanism: the caller
 *     pulls, re-merges, and retries. A forced push would silently erase them.
 */

import { bytesToB64 } from './b64';

export interface Repo {
  owner: string;
  name: string;
}

export class GitError extends Error {
  status: number;
  /** The endpoint that failed. "Resource not accessible" means nothing without it. */
  path: string;

  constructor(message: string, status: number, path = '') {
    super(message);
    this.name = 'GitError';
    this.status = status;
    this.path = path;
  }
}

/** Someone else pushed while we were merging. Pull and try again. */
export const isRaceError = (e: unknown): boolean => e instanceof GitError && (e.status === 422 || e.status === 409);

const API = 'https://api.github.com';

interface Init {
  method?: string;
  body?: unknown;
  accept?: string;
  /** Statuses the caller handles itself. Everything else throws. */
  tolerate?: number[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Worth trying again: the connection dropped, GitHub is briefly unwell, or we're
 * being rate-limited. Not worth trying again: 401, 404, 422 — the answer won't
 * change, and a 422 is the concurrency signal `syncVault` needs to see.
 *
 * Retrying is safe for everything we send. Blobs and trees are content-addressed,
 * so a repeat produces the same sha. A repeated commit creates an unreferenced
 * object, which git garbage-collects. A repeated ref update either lands or is
 * rejected as a non-fast-forward, which is exactly the outcome we already handle.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;

async function gh(token: string, path: string, init: Init = {}): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) await sleep(400 * attempt);

    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: init.accept ?? 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (e) {
      // A phone on a train loses TCP mid-sync. That is not a failed sync.
      lastError = e;
      continue;
    }

    if (res.ok || (init.tolerate ?? []).includes(res.status)) return res;

    let detail = res.statusText;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) detail = err.message;
    } catch {
      // GitHub occasionally answers with an empty body; the status is enough.
    }

    const error = new GitError(detail, res.status, path);
    if (!RETRYABLE.has(res.status)) throw error;
    lastError = error;
  }

  if (lastError instanceof GitError) throw lastError;
  throw new GitError('GitHub is unreachable.', 0, path);
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

// ── account & repo ────────────────────────────────────────────────────
export async function getLogin(token: string): Promise<string> {
  const res = await gh(token, '/user', { tolerate: [401, 404] });
  if (!res.ok) throw new GitError('That token is not valid.', res.status, '/user');
  return (await json<{ login: string }>(res)).login;
}

/*
 * There is deliberately NO default repo name.
 *
 * A default is a guess, and this code writes to whatever it guesses. Defaulting
 * to `noto-vault` once sent a sync into a developer's scratch repo, and the
 * inverse mistake — a default that happens to name someone's real vault — is the
 * same bug pointed at the data instead of away from it. If nobody said which
 * repo, we don't sync.
 */

/**
 * The repo name, from whatever the user pasted.
 *
 * People paste the browser URL, or `owner/name`, or the name alone. All three
 * mean the same repo, and the owner always comes from the token anyway.
 * Returns '' when the input names no repo — callers must treat that as "stop".
 */
export function repoNameFrom(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  const segments = cleaned.split('/').filter(Boolean);
  // At most `owner/name`. Anything deeper, or any dot segment, is not a repo —
  // it's a path, and we would be guessing at which part of it the user meant.
  if (segments.length === 0 || segments.length > 2 || segments.some((s) => /^\.+$/.test(s))) return '';

  const last = segments[segments.length - 1];
  return /^[\w.-]+$/.test(last) ? last : '';
}

/** Creates the private vault repo, or adopts it if it already exists. */
export async function ensureRepo(token: string, name: string): Promise<Repo> {
  if (!name) throw new GitError('No repo named. Type the repo you want to sync into.', 400, '');
  const owner = await getLogin(token);

  const existing = await gh(token, `/repos/${owner}/${name}`, { tolerate: [404] });
  if (existing.status !== 404) return { owner, name };

  /*
   * A 404 here is ambiguous, and the ambiguity is the whole problem. It means
   * either "no such repo" or "this token isn't allowed to see it" — GitHub
   * refuses to distinguish, so a private repo the token wasn't granted looks
   * exactly like one that doesn't exist. We then try to create it, and a
   * fine-grained token can't do that either, so the user gets a 403 about repo
   * creation for a repo that already exists. Say both possibilities out loud.
   *
   * auto_init: false keeps the repo empty, so our first sync is its first commit.
   */
  const created = await gh(token, '/user/repos', {
    method: 'POST',
    tolerate: [403],
    body: { name, private: true, auto_init: false, description: 'Noto vault — encrypted journal, notes, review history.' },
  });

  if (created.status === 403) {
    throw new GitError(
      `Can't reach ${owner}/${name}, and this token can't create it. ` +
        `If the repo exists, the token needs access to it (fine-grained tokens 404 on repos they weren't granted — check "Repository access"). ` +
        `If it doesn't exist, create it yourself on github.com: private, empty, no README.`,
      403,
      '/user/repos',
    );
  }
  return { owner, name };
}

/**
 * Turn a transport failure into something a person can act on. GitHub's own
 * wording — "Resource not accessible by personal access token" — never says
 * which resource, or what to grant.
 */
export function explainGitError(e: unknown, repo?: Repo): string | null {
  if (!(e instanceof GitError)) return null;
  const where = repo ? `${repo.owner}/${repo.name}` : 'the vault repo';

  if (e.status === 401) return 'GitHub rejected the token. It may be expired, revoked, or mistyped.';
  if (e.status === 403 && e.path === '/user/repos') return e.message;
  if (e.status === 403) return `The token can't write to ${where}. Give it "Contents: Read and write" on that repo.`;
  if (e.status === 404 && e.path.startsWith('/repos/')) {
    return `The token can't see ${where}. A fine-grained token only reaches repos you list under "Repository access".`;
  }
  return null;
}

// ── read ──────────────────────────────────────────────────────────────
export interface RemoteState {
  files: Map<string, string>;
  /** null when the repo has no commits yet. */
  headSha: string | null;
}

export async function pull(token: string, repo: Repo, branch = 'main'): Promise<RemoteState> {
  const base = `/repos/${repo.owner}/${repo.name}`;

  // A repo with no commits answers 409 "Git Repository is empty" — not 404. Both
  // mean the same thing to us: there is nothing to merge with yet.
  const refRes = await gh(token, `${base}/git/ref/heads/${branch}`, { tolerate: [404, 409] });
  if (!refRes.ok) return { files: new Map(), headSha: null };

  const headSha = (await json<{ object: { sha: string } }>(refRes)).object.sha;
  const commit = await json<{ tree: { sha: string } }>(await gh(token, `${base}/git/commits/${headSha}`));

  /*
   * A repo whose files have all been deleted has commits, but its tree is git's
   * canonical EMPTY tree — and GitHub answers 404 for that object, because it was
   * never written. Treating that as an error would make an emptied vault
   * permanently unsyncable. It has commits and no files; that is what we return.
   */
  const treeRes = await gh(token, `${base}/git/trees/${commit.tree.sha}?recursive=1`, { tolerate: [404] });
  if (!treeRes.ok) return { files: new Map(), headSha };

  const tree = await json<{
    truncated: boolean;
    tree: { path: string; type: string; sha: string }[];
  }>(treeRes);

  if (tree.truncated) {
    // Silently syncing a partial tree would delete every file we didn't see.
    throw new GitError('The vault is too large to read in one request.', 500);
  }

  const blobs = tree.tree.filter((e) => e.type === 'blob');
  const files = new Map<string, string>();

  // Six at a time: fast enough for a few hundred notes, gentle on the rate limit.
  const queue = blobs.slice();
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const res = await gh(token, `${base}/git/blobs/${e.sha}`, { accept: 'application/vnd.github.raw' });
        files.set(e.path, await res.text());
      }
    }),
  );

  return { files, headSha };
}

// ── write ─────────────────────────────────────────────────────────────
export interface PushResult {
  /** null when the merge produced no change — we skip the empty commit. */
  commitSha: string | null;
  changed: boolean;
}

/** ASCII-only base64. The Contents API demands base64, and Hermes has no TextEncoder. */
function asciiToB64(text: string): string {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) throw new GitError('The seed file must be ASCII.', 500);
    bytes[i] = code;
  }
  return bytesToB64(bytes);
}

/** A file the caller is guaranteed to own, so the first real commit replaces it. */
const SEED_PATH = 'manifest.json';

/*
 * The Git Data API rejects every call — even creating a blob — against a repo
 * with no commits: "Git Repository is empty" (409). The Contents API is the one
 * endpoint that works there, so we use it once to lay down a root commit.
 *
 * It seeds `manifest.json`, not a README, and that choice is load-bearing. The
 * commit tree carries forward every path the caller does NOT own — so a seeded
 * README would never be replaceable, and would sit in the repo forever. A file
 * the vault owns gets overwritten by the very next tree.
 */
async function bootstrap(token: string, repo: Repo, branch: string, seed: string): Promise<string> {
  const res = await gh(token, `/repos/${repo.owner}/${repo.name}/contents/${SEED_PATH}`, {
    method: 'PUT',
    body: { message: 'init vault', content: asciiToB64(seed), branch },
  });
  return (await json<{ commit: { sha: string } }>(res)).commit.sha;
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
}

/**
 * @param owns  Which paths the caller is authoritative for. Everything else in
 *   the parent commit is carried forward by sha. Without this the tree we build
 *   IS the whole repo, so a README, a LICENSE or a CI workflow that some other
 *   tool added would be deleted by the next sync — silently, and by a device
 *   that has no idea the file ever existed.
 */
export async function push(
  token: string,
  repo: Repo,
  files: Map<string, string>,
  parentSha: string | null,
  message: string,
  branch = 'main',
  owns: (path: string) => boolean = () => true,
): Promise<PushResult> {
  const base = `/repos/${repo.owner}/${repo.name}`;
  // Seed with a file we're about to write anyway, so the root commit leaves no residue.
  const parent = parentSha ?? (await bootstrap(token, repo, branch, files.get(SEED_PATH) ?? '{}\n'));

  const paths = [...files.keys()].sort();
  const shas: string[] = new Array(paths.length);

  const queue = paths.map((p, i) => ({ p, i }));
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const blob = await json<{ sha: string }>(
          await gh(token, `${base}/git/blobs`, {
            method: 'POST',
            body: { content: files.get(job.p), encoding: 'utf-8' },
          }),
        );
        shas[job.i] = blob.sha;
      }
    }),
  );

  const head = await json<{ tree: { sha: string } }>(await gh(token, `${base}/git/commits/${parent}`));

  // Everything the caller does not own, re-listed by sha so it survives. The 404
  // is git's empty tree (see `pull`): a parent with no files carries nothing.
  const treeRes = await gh(token, `${base}/git/trees/${head.tree.sha}?recursive=1`, { tolerate: [404] });
  const parentTree = treeRes.ok
    ? await json<{ truncated: boolean; tree: TreeEntry[] }>(treeRes)
    : { truncated: false, tree: [] as TreeEntry[] };
  if (parentTree.truncated) throw new GitError('The vault is too large to rewrite in one commit.', 500);

  const carried = parentTree.tree
    .filter((e) => e.type === 'blob' && !files.has(e.path) && !owns(e.path))
    .map((e) => ({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha }));

  // No base_tree: the entries we list ARE the tree. That is what makes a deleted
  // note actually disappear rather than linger from the parent.
  const tree = await json<{ sha: string }>(
    await gh(token, `${base}/git/trees`, {
      method: 'POST',
      body: {
        tree: [...paths.map((p, i) => ({ path: p, mode: '100644', type: 'blob', sha: shas[i] })), ...carried],
      },
    }),
  );

  // Identical tree means nothing changed. An empty commit every sync would turn
  // the history into noise and make `git log` useless for spotting real edits.
  if (head.tree.sha === tree.sha) return { commitSha: parent, changed: false };

  const commit = await json<{ sha: string }>(
    await gh(token, `${base}/git/commits`, {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [parent] },
    }),
  );

  // force omitted -> GitHub rejects a non-fast-forward. That 422 is the guard
  // against clobbering a device that pushed while we were merging.
  await gh(token, `${base}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha } });

  return { commitSha: commit.sha, changed: true };
}
