/*
 * The desktop app's pure logic, re-exported for the iOS app.
 *
 * These modules are SHARED VERBATIM from ../src/lib — never copied, never
 * forked. The FSRS engine in particular must stay byte-identical across
 * devices: `fsrs.replayMemory()` rebuilds a note's memory by folding its review
 * history, so two devices that hold the same ledger MUST derive the same
 * stability/difficulty. A fork would silently desync the schedule.
 *
 * Metro reaches outside the project root via `watchFolders` (see metro.config.js).
 *
 * `sync`, `vaultSync` and `gitapi` are shared for the same reason as FSRS: if the
 * two platforms ever disagreed about the wire format or the merge, a sync would
 * quietly corrupt the vault instead of failing. `b64` is shared because the
 * journal's ciphertext envelope must be byte-identical on both sides.
 *
 * Not re-exported (browser-only): lib/ui.ts, lib/crypto.ts, lib/scrape.ts —
 * crypto.ts needs Web Crypto, which Hermes lacks; see mobile/src/crypto.ts.
 */

export * as fsrs from '../src/lib/adaptive'
export * as srs from '../src/lib/srs'
export * as markdown from '../src/lib/markdown'
export * as format from '../src/lib/format'
export * as tree from '../src/lib/tree'
export * as dates from '../src/lib/dates'
export * as loom from '../src/lib/loom'
export * as url from '../src/lib/url'
export * as bytes from '../src/lib/bytes'
export * as bytesDeck from '../src/lib/bytesDeck'
export * as weave from '../src/lib/weave'
export * as history from '../src/lib/history'
export * as templates from '../src/lib/templates'

export * as sync from '../src/lib/sync'
export * as vaultSync from '../src/lib/vaultSync'
export * as gitapi from '../src/lib/gitapi'
export * as b64 from '../src/lib/b64'

export * from '../src/lib/types'
