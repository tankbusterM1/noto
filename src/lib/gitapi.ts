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

export interface Repo {
  owner: string;
  name: string;
}

export class GitError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitError';
    this.status = status;
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

    const error = new GitError(detail, res.status);
    if (!RETRYABLE.has(res.status)) throw error;
    lastError = error;
  }

  if (lastError instanceof GitError) throw lastError;
  throw new GitError('GitHub is unreachable.', 0);
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

// ── account & repo ────────────────────────────────────────────────────
export async function getLogin(token: string): Promise<string> {
  const res = await gh(token, '/user', { tolerate: [401, 404] });
  if (!res.ok) throw new GitError('That token is not valid.', res.status);
  return (await json<{ login: string }>(res)).login;
}

/** Creates the private vault repo, or adopts it if it already exists. */
export async function ensureRepo(token: string, name = 'noto-vault'): Promise<Repo> {
  const owner = await getLogin(token);

  const existing = await gh(token, `/repos/${owner}/${name}`, { tolerate: [404] });
  if (existing.status !== 404) return { owner, name };

  // auto_init: false keeps the repo empty, so our first sync is its first commit
  // and there's no README to merge around.
  await gh(token, '/user/repos', {
    method: 'POST',
    body: { name, private: true, auto_init: false, description: 'Noto vault — encrypted journal, notes, review history.' },
  });
  return { owner, name };
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

  const tree = await json<{
    truncated: boolean;
    tree: { path: string; type: string; sha: string }[];
  }>(await gh(token, `${base}/git/trees/${commit.tree.sha}?recursive=1`));

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

/*
 * The Git Data API rejects every call — even creating a blob — against a repo
 * with no commits: "Git Repository is empty" (409). The Contents API is the one
 * endpoint that works there, so we use it once to lay down a root commit. Its
 * README is dropped by the first real sync, since our trees carry no base_tree.
 *
 * The content is a pre-encoded constant: the Contents API demands base64, and
 * Hermes ships no TextEncoder to produce it from UTF-8 at runtime.
 */
const README_B64 =
  'IyBub3RvLXZhdWx0CgpFbmNyeXB0ZWQgdmF1bHQgc3luY2VkIGJ5IE5vdG8uIE1hbmFnZWQgYnkgdGhlIGFwcCDigJQgZG8gbm90IGVkaXQgYnkgaGFuZC4K';

async function bootstrap(token: string, repo: Repo, branch: string): Promise<string> {
  const res = await gh(token, `/repos/${repo.owner}/${repo.name}/contents/README.md`, {
    method: 'PUT',
    body: { message: 'init vault', content: README_B64, branch },
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
  const parent = parentSha ?? (await bootstrap(token, repo, branch));

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

  // Everything the caller does not own, re-listed by sha so it survives.
  const parentTree = await json<{ truncated: boolean; tree: TreeEntry[] }>(
    await gh(token, `${base}/git/trees/${head.tree.sha}?recursive=1`),
  );
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
