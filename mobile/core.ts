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
 * Not re-exported (browser-only): lib/ui.ts, lib/crypto.ts, lib/scrape.ts.
 */

export * as fsrs from '../src/lib/adaptive'
export * as srs from '../src/lib/srs'
export * as markdown from '../src/lib/markdown'
export * as format from '../src/lib/format'
export * as tree from '../src/lib/tree'
export * as dates from '../src/lib/dates'
export * as loom from '../src/lib/loom'
export * as weave from '../src/lib/weave'
export * as history from '../src/lib/history'
export * as templates from '../src/lib/templates'

export * from '../src/lib/types'
