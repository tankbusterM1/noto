import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ensureRepo, GitError, isRaceError, pull, push } from './gitapi'

/*
 * `fetch` is faked so we can drive the answers GitHub gives at the worst moments:
 * an empty repo, a dropped connection, a rate limit, and a ref that another
 * device moved out from under us. None of these are reachable on demand live.
 */
const fetchMock = vi.fn()
const REPO = { owner: 'me', name: 'noto-vault' }

/*
 * Factories, not values. A `Response` body can only be read once, so handing the
 * same object to two retries would make the second one look like an empty reply
 * — and the test would be measuring the mock rather than the code.
 */
type Reply = () => Response | Promise<never>

const json = (body: unknown, status = 200): Reply => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const text = (body: string, status = 200): Reply => () => new Response(body, { status })
const dropped = (): Reply => () => Promise.reject(new TypeError('fetch failed'))

/** The first replies in order; the last one repeats for any further calls. */
const replies = (...queue: Reply[]) => {
  let i = 0
  fetchMock.mockImplementation(() => queue[Math.min(i++, queue.length - 1)]())
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Run a promise to completion while the backoff sleeps on fake timers. */
function settle<T>(p: Promise<T>): Promise<T> {
  const captured = p.then(
    (value) => () => value,
    (error: unknown) => () => {
      throw error
    },
  )
  return vi.runAllTimersAsync().then(() => captured).then((unwrap) => unwrap())
}

const urlOf = (call: unknown[]) => String(call[0])
const methodOf = (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method ?? 'GET'

describe('gh transport', () => {
  it('retries a dropped connection instead of calling the sync failed', async () => {
    replies(dropped(), json({ login: 'me' }), json({ full_name: 'me/noto-vault' }))

    await expect(settle(ensureRepo('t', 'noto-vault'))).resolves.toEqual(REPO)
    expect(fetchMock.mock.calls.filter((c) => urlOf(c).endsWith('/user'))).toHaveLength(2)
  })

  it('retries a rate limit and a 502, then succeeds', async () => {
    replies(json({ message: 'rate limited' }, 429), json({ message: 'bad gateway' }, 502), json({ login: 'me' }), json({ full_name: 'me/noto-vault' }))

    await expect(settle(ensureRepo('t', 'noto-vault'))).resolves.toEqual(REPO)
  })

  it('gives up after the last attempt and reports the real reason', async () => {
    replies(json({ message: 'bad gateway' }, 502))
    await expect(settle(ensureRepo('t'))).rejects.toThrow('bad gateway')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('never retries a rejected token — the answer will not change', async () => {
    replies(json({ message: 'Bad credentials' }, 401))
    await expect(settle(ensureRepo('t'))).rejects.toThrow(/not valid/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /* The 422 is the concurrency signal. Swallowing it as "transient" would let a
   * retry loop clobber whatever the other device just pushed. */
  it('never retries a non-fast-forward, and marks it as a race', async () => {
    replies(json({ message: 'Update is not a fast forward' }, 422))
    const err = await settle(ensureRepo('t')).catch((e: unknown) => e)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(isRaceError(err)).toBe(true)
  })

  it('classifies which errors a caller should re-merge for', () => {
    expect(isRaceError(new GitError('x', 422))).toBe(true)
    expect(isRaceError(new GitError('x', 409))).toBe(true)
    expect(isRaceError(new GitError('x', 401))).toBe(false)
    expect(isRaceError(new Error('x'))).toBe(false)
  })
})

describe('pull', () => {
  it('reads an empty repo as an empty vault — GitHub answers 409, not 404', async () => {
    replies(json({ message: 'Git Repository is empty.' }, 409))
    const state = await settle(pull('t', REPO))
    expect(state.headSha).toBeNull()
    expect(state.files.size).toBe(0)
  })

  /*
   * A repo whose files were all deleted has commits, but its tree is git's
   * canonical empty tree (4b825dc…) — an object GitHub never wrote, so the trees
   * API answers 404. Treating that as an error makes an emptied vault permanently
   * unsyncable.
   */
  it('reads a repo whose files were all deleted — GitHub 404s the empty tree', async () => {
    replies(json({ object: { sha: 'head' } }), json({ tree: { sha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' } }), json({}, 404))

    const state = await settle(pull('t', REPO))
    expect(state.headSha).toBe('head') // it HAS commits…
    expect(state.files.size).toBe(0) // …and no files
  })

  it('refuses a truncated tree rather than syncing a partial vault', async () => {
    replies(json({ object: { sha: 'head' } }), json({ tree: { sha: 'tree' } }), json({ truncated: true, tree: [] }))

    await expect(settle(pull('t', REPO))).rejects.toThrow(/too large/)
  })

  it('fetches blob contents as raw text, never base64', async () => {
    replies(
      json({ object: { sha: 'head' } }),
      json({ tree: { sha: 'tree' } }),
      json({ truncated: false, tree: [{ path: 'a.md', type: 'blob', sha: 'b1' }] }),
      text('hello'),
    )

    const state = await settle(pull('t', REPO))
    expect(state.files.get('a.md')).toBe('hello')

    const blobCall = fetchMock.mock.calls.find((c) => urlOf(c).includes('/blobs/'))!
    expect((blobCall[1] as { headers: Record<string, string> }).headers.Accept).toBe('application/vnd.github.raw')
  })
})

describe('push', () => {
  const files = new Map([['a.md', 'x']])

  /*
   * Answer by endpoint, not by position: `push` reads the parent tree so it can
   * carry forward files the vault doesn't own, and a positional queue would have
   * to be recounted every time that sequence changes.
   */
  const route = (parentTree: { path: string; type: string; sha: string; mode: string }[], newTreeSha = 'tree2') => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (method === 'PUT' && u.includes('/contents/')) return json({ commit: { sha: 'root' } })()
      if (method === 'POST' && u.endsWith('/git/blobs')) return json({ sha: 'blob1' })()
      if (method === 'GET' && u.includes('/git/commits/')) return json({ tree: { sha: 'headtree' } })()
      if (method === 'GET' && u.includes('/git/trees/')) return json({ truncated: false, tree: parentTree })()
      if (method === 'POST' && u.endsWith('/git/trees')) return json({ sha: newTreeSha })()
      if (method === 'POST' && u.endsWith('/git/commits')) return json({ sha: 'commit1' })()
      if (method === 'PATCH' && u.endsWith('/git/refs/heads/main')) return json({ ok: true })()
      throw new Error(`unrouted ${method} ${u}`)
    })
  }

  const treeBody = () =>
    JSON.parse((fetchMock.mock.calls.find((c) => methodOf(c) === 'POST' && urlOf(c).endsWith('/git/trees'))![1] as { body: string }).body) as {
      tree: { path: string; sha: string }[]
    }

  it('skips the commit when the tree is unchanged', async () => {
    route([], 'headtree')

    const res = await settle(push('t', REPO, files, 'parent', 'msg'))
    expect(res.changed).toBe(false)
    expect(res.commitSha).toBe('parent')
    expect(fetchMock.mock.calls.some((c) => urlOf(c).endsWith('/git/refs/heads/main'))).toBe(false)
  })

  it('updates the ref without force, so a concurrent push is rejected', async () => {
    route([])

    await settle(push('t', REPO, files, 'parent', 'msg'))

    const refCall = fetchMock.mock.calls.find((c) => urlOf(c).endsWith('/git/refs/heads/main'))!
    expect(methodOf(refCall)).toBe('PATCH')
    const body = JSON.parse((refCall[1] as { body: string }).body) as Record<string, unknown>
    expect(body).toEqual({ sha: 'commit1' })
    expect(body.force).toBeUndefined()
  })

  /* The Git Data API rejects every call against a repo with no commits, so the
   * first sync of a brand-new vault has to lay down a root commit first. */
  it('bootstraps an empty repo through the Contents API before writing blobs', async () => {
    route([])

    const res = await settle(push('t', REPO, files, null, 'msg'))
    expect(res.changed).toBe(true)

    const first = fetchMock.mock.calls[0]
    expect(urlOf(first)).toContain('/contents/manifest.json')
    expect(methodOf(first)).toBe('PUT')
  })

  /*
   * The seed file must be one the caller OWNS. Anything else is carried forward
   * by every later commit, so a seeded README would sit in the repo forever —
   * which is exactly what happened before.
   */
  it('seeds a file the vault owns, so the root commit leaves no residue', async () => {
    route([])
    const withManifest = new Map([['manifest.json', '{"schema": 2}\n']])

    await settle(push('t', REPO, withManifest, null, 'msg', 'main', (p) => p === 'manifest.json'))

    const seed = fetchMock.mock.calls[0]
    expect(urlOf(seed)).toContain('/contents/manifest.json')
    const body = JSON.parse((seed[1] as { body: string }).body) as { content: string }
    expect(atob(body.content)).toBe('{"schema": 2}\n')

    // …and nothing else was carried into the tree.
    expect(treeBody().tree.map((e) => e.path)).toEqual(['manifest.json'])
  })

  it('refuses a non-ASCII seed rather than corrupting the first commit', async () => {
    route([])
    await expect(settle(push('t', REPO, new Map([['manifest.json', '{"a":"é"}']]), null, 'msg'))).rejects.toThrow(/ASCII/)
  })

  /*
   * The tree we post IS the repo — that is how a deleted note disappears. So
   * anything the caller does not own has to be re-listed by sha, or the next
   * sync quietly deletes the README, the LICENSE and the CI workflow.
   */
  it('carries forward files the caller does not own', async () => {
    route([
      { path: 'README.md', type: 'blob', sha: 'readme', mode: '100644' },
      { path: '.github/workflows/ci.yml', type: 'blob', sha: 'ci', mode: '100644' },
      { path: 'notes/old.md', type: 'blob', sha: 'stale', mode: '100644' },
    ])

    await settle(push('t', REPO, files, 'parent', 'msg', 'main', (p) => p.startsWith('notes/')))

    const paths = treeBody().tree.map((e) => e.path)
    expect(paths).toContain('a.md')
    expect(paths).toContain('README.md')
    expect(paths).toContain('.github/workflows/ci.yml')
    // Owned, absent from the new file set -> genuinely deleted.
    expect(paths).not.toContain('notes/old.md')
  })

  it('keeps the executable bit on a file it carries forward', async () => {
    route([{ path: 'script.sh', type: 'blob', sha: 'sh', mode: '100755' }])

    await settle(push('t', REPO, files, 'parent', 'msg', 'main', () => false))
    const entry = treeBody().tree.find((e) => e.path === 'script.sh') as unknown as { mode: string }
    expect(entry.mode).toBe('100755')
  })

  it('pushes into a parent that has no files at all', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (method === 'POST' && u.endsWith('/git/blobs')) return json({ sha: 'blob1' })()
      if (method === 'GET' && u.includes('/git/commits/')) return json({ tree: { sha: '4b825dc' } })()
      if (method === 'GET' && u.includes('/git/trees/')) return json({}, 404)() // the empty tree
      if (method === 'POST' && u.endsWith('/git/trees')) return json({ sha: 'tree2' })()
      if (method === 'POST' && u.endsWith('/git/commits')) return json({ sha: 'commit1' })()
      if (method === 'PATCH' && u.endsWith('/git/refs/heads/main')) return json({ ok: true })()
      throw new Error(`unrouted ${method} ${u}`)
    })

    const res = await settle(push('t', REPO, files, 'parent', 'msg'))
    expect(res.changed).toBe(true)
    expect(treeBody().tree.map((e) => e.path)).toEqual(['a.md'])
  })

  it('by default owns everything, so a caller that says nothing replaces the tree', async () => {
    route([{ path: 'README.md', type: 'blob', sha: 'readme', mode: '100644' }])

    await settle(push('t', REPO, files, 'parent', 'msg'))
    expect(treeBody().tree.map((e) => e.path)).toEqual(['a.md'])
  })
})
