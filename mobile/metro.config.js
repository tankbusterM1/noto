// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path')

/*
 * The desktop app's pure logic — the FSRS engine, the SRS maths, markdown <->
 * blocks, the loom/weave graph helpers — is SHARED VERBATIM with this app, not
 * copied. A fork of `adaptive.ts` would let the two devices compute different
 * memory state from the same review history, which would quietly corrupt sync.
 *
 * Metro only watches its project root, so ../src/lib must be added explicitly;
 * `core.ts` then re-exports it with ordinary relative imports. (An
 * `extraNodeModules['@core']` alias does NOT work here: Metro resolves
 * `@scope/name` as one package name, so `@core/adaptive` would never hit it.)
 *
 * Deliberately NOT shared — browser-only, native equivalents live in this app:
 *   lib/ui.ts      — CSS helpers
 *   lib/crypto.ts  — Web Crypto (SubtleCrypto); RN uses @noble/*
 *   lib/scrape.ts  — DOM parsing
 */
const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')
const coreDir = path.resolve(repoRoot, 'src', 'lib')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [coreDir]

module.exports = config
