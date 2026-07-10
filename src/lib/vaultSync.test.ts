import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitError } from './gitapi'
import { emptyVault, vaultToFiles, type Vault } from './sync'

/*
 * The transport is faked so we can drive the two failure modes that matter and
 * that a live test can't reproduce on demand: another device winning the race,
 * and GitHub serving a stale ref right after our own push.
 */
const pull = vi.fn()
const push = vi.fn()

vi.mock('./gitapi', async (orig) => {
  const real = await orig<typeof import('./gitapi')>()
  return { ...real, pull: (...a: unknown[]) => pull(...a), push: (...a: unknown[]) => push(...a) }
})

const { syncVault } = await import('./vaultSync')

const REPO = { owner: 'me', name: 'noto-vault' }
const note = (id: string, updatedAt: number) => ({
  id,
  title: id,
  folderId: 'f1',
  tags: [],
  body: 'x',
  createdAt: 1,
  updatedAt,
})
const local: Vault = { ...emptyVault(), notes: [note('n1', 100)] }

const raced = () => new GitError('Update is not a fast forward', 422)

beforeEach(() => {
  vi.useFakeTimers()
  pull.mockReset()
  push.mockReset()
})
afterEach(() => vi.useRealTimers())

/**
 * Advance fake timers while the promise is parked on a backoff sleep. The
 * result is captured before the timers run, or a rejection lands with no
 * handler attached and Vitest reports it as an unhandled error.
 */
function settle<T>(p: Promise<T>): Promise<T> {
  const captured = p.then(
    (value) => () => value,
    (error: unknown) => () => {
      throw error
    },
  )
  return vi.runAllTimersAsync().then(() => captured).then((unwrap) => unwrap())
}

describe('syncVault', () => {
  it('pushes the merge and reports what landed', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'abc' })
    push.mockResolvedValue({ commitSha: 'def', changed: true })

    const r = await settle(syncVault('t', REPO, local, 'desktop'))
    expect(r.pushed).toBe(true)
    expect(r.stats.notes).toBe(1)
    expect(r.retries).toBe(0)
  })

  it("folds in a note from the device that won the race, then lands its own", async () => {
    const theirs = vaultToFiles({ ...emptyVault(), notes: [note('n2', 200)] })
    pull
      .mockResolvedValueOnce({ files: new Map(), headSha: 'old' })
      .mockResolvedValue({ files: theirs, headSha: 'new' })
    push.mockRejectedValueOnce(raced()).mockResolvedValue({ commitSha: 'z', changed: true })

    const r = await settle(syncVault('t', REPO, local, 'desktop'))
    expect(r.retries).toBe(1)
    expect(r.vault.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
  })

  /*
   * The bug this file exists for. A ref read straight after our own push can
   * still return the previous commit, so the retry is rejected identically.
   * Without a pause between attempts the whole budget burns in milliseconds.
   */
  it('waits before retrying, instead of re-reading the same stale ref', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'stale' })
    push.mockRejectedValueOnce(raced()).mockRejectedValueOnce(raced()).mockResolvedValue({ commitSha: 'z', changed: true })

    const p = syncVault('t', REPO, local, 'desktop')
    await vi.advanceTimersByTimeAsync(0)
    expect(push).toHaveBeenCalledTimes(1) // parked on the backoff, not hammering

    const r = await settle(p)
    expect(r.retries).toBe(2)
  })

  it('gives up after the last attempt rather than looping forever', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'stale' })
    push.mockRejectedValue(raced())

    await expect(settle(syncVault('t', REPO, local, 'desktop', 3))).rejects.toThrow('fast forward')
    expect(push).toHaveBeenCalledTimes(3)
  })

  it('does not retry an error that a retry cannot fix', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'abc' })
    push.mockRejectedValue(new GitError('Bad credentials', 401))

    await expect(settle(syncVault('t', REPO, local, 'desktop'))).rejects.toThrow('Bad credentials')
    expect(push).toHaveBeenCalledTimes(1)
  })

  /*
   * Two passphrases means two sets of mutually unreadable ciphertext. Merging
   * would import entries this device can never open, and could adopt the other
   * key parameters — orphaning the entries it *could* read. It must stop before
   * the push, and hand back the local vault untouched.
   */
  it('refuses to sync a vault encrypted under a different passphrase', async () => {
    const theirs = vaultToFiles({
      ...emptyVault(),
      crypto: { salt: 'AAA', iterations: 600_000, verifier: { iv: 'a', ct: 'b' } },
      journal: [{ id: 'j1', day: 1, iv: 'x', ct: 'unreadable', createdAt: 1, updatedAt: 1 }],
    })
    pull.mockResolvedValue({ files: theirs, headSha: 'abc' })

    const mine: Vault = {
      ...local,
      crypto: { salt: 'ZZZ', iterations: 600_000, verifier: { iv: 'c', ct: 'd' } },
    }
    const r = await settle(syncVault('t', REPO, mine, 'desktop'))

    expect(r.cryptoConflict).toBe(true)
    expect(r.pushed).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(r.vault).toBe(mine) // the caller writes this back; it must be untouched
    expect(r.vault.journal).toHaveLength(0)
  })

  it('syncs normally when only one side has a passphrase', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'abc' })
    push.mockResolvedValue({ commitSha: 'def', changed: true })

    const mine: Vault = { ...local, crypto: { salt: 'ZZZ', iterations: 600_000, verifier: { iv: 'c', ct: 'd' } } }
    const r = await settle(syncVault('t', REPO, mine, 'desktop'))
    expect(r.cryptoConflict).toBe(false)
    expect(r.pushed).toBe(true)
  })

  it('refuses to merge a vault written by a newer app', async () => {
    pull.mockResolvedValue({ files: new Map([['manifest.json', '{"schema":99}']]), headSha: 'abc' })

    await expect(settle(syncVault('t', REPO, local, 'desktop'))).rejects.toThrow(/newer version/)
    expect(push).not.toHaveBeenCalled()
  })

  /*
   * `ensureRepo` adopts an existing repo of the right name rather than failing.
   * If that repo is somebody's actual project, the first push replaces its tree
   * with a dozen vault files. Refuse, loudly, before touching anything.
   */
  it('refuses a repo that is plainly not a vault', async () => {
    pull.mockResolvedValue({ files: new Map([['src/index.ts', 'export {}']]), headSha: 'abc' })

    await expect(settle(syncVault('t', REPO, local, 'desktop'))).rejects.toThrow(/doesn't look like a Noto vault/)
    expect(push).not.toHaveBeenCalled()
  })

  it('accepts a repo holding only a README, which is what bootstrap leaves', async () => {
    pull.mockResolvedValue({ files: new Map([['README.md', '# noto-vault']]), headSha: 'abc' })
    push.mockResolvedValue({ commitSha: 'z', changed: true })

    await expect(settle(syncVault('t', REPO, local, 'desktop'))).resolves.toBeTruthy()
  })

  it('tells the transport which paths it owns, so a README is not deleted', async () => {
    pull.mockResolvedValue({ files: new Map(), headSha: 'abc' })
    push.mockResolvedValue({ commitSha: 'z', changed: true })

    await settle(syncVault('t', REPO, local, 'desktop'))
    const owns = push.mock.calls[0][6] as (p: string) => boolean
    expect(owns('notes/n1.md')).toBe(true)
    expect(owns('README.md')).toBe(false)
    expect(owns('.github/workflows/ci.yml')).toBe(false)
  })

  it('hands back the untouched local vault on a passphrase conflict', async () => {
    const theirs = vaultToFiles({ ...emptyVault(), crypto: { salt: 'ZZZ', iterations: 1, verifier: { iv: 'a', ct: 'b' } } })
    pull.mockResolvedValue({ files: theirs, headSha: 'abc' })

    const mine: Vault = { ...local, crypto: { salt: 'AAA', iterations: 1, verifier: { iv: 'c', ct: 'd' } } }
    const r = await settle(syncVault('t', REPO, mine, 'desktop'))

    expect(r.cryptoConflict).toBe(true)
    expect(r.pushed).toBe(false)
    expect(r.vault).toBe(mine) // nothing merged, nothing adopted
    expect(push).not.toHaveBeenCalled()
  })

  it('reports an unchanged vault without claiming it pushed', async () => {
    pull.mockResolvedValue({ files: vaultToFiles(local), headSha: 'abc' })
    push.mockResolvedValue({ commitSha: 'abc', changed: false })

    const r = await settle(syncVault('t', REPO, local, 'desktop'))
    expect(r.pushed).toBe(false)
    expect(r.commitSha).toBe('abc')
  })
})
