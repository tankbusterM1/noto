import { describe, it, expect } from 'vitest'
import { EXPORT_SECRETS } from '../store/data'

/*
 * A vault export is a file people mail themselves, drop in a shared folder, or
 * hand to someone else to merge. The `meta` table it dumps holds the GitHub
 * token, which grants READ AND WRITE on the private vault repo — so the export
 * used to hand over the keys to the remote copy along with the notes.
 *
 * These pin the redaction list and the shape of the filter, so a future table
 * or key can't quietly reopen it.
 */

describe('export redaction', () => {
  it('treats the GitHub token as a secret', () => {
    expect(EXPORT_SECRETS.has('githubToken')).toBe(true)
  })

  it('keeps the keys an import genuinely needs', () => {
    // journalCrypto is salt + verifier, not a secret — without it a restored
    // vault could never decrypt its own journal.
    for (const keep of ['journalCrypto', 'scratchpadEnc', 'tagsPool', 'installDay']) {
      expect(EXPORT_SECRETS.has(keep)).toBe(false)
    }
  })

  it('strips exactly the secret rows and nothing else', () => {
    const meta = [
      { key: 'githubToken', value: 'ghp_secret' },
      { key: 'tagsPool', value: ['a'] },
      { key: 'journalCrypto', value: { salt: 'x' } },
    ]
    const dumped = meta.filter((r) => !EXPORT_SECRETS.has(r.key))
    expect(dumped.map((r) => r.key)).toEqual(['tagsPool', 'journalCrypto'])
    expect(JSON.stringify(dumped)).not.toContain('ghp_secret')
  })
})
