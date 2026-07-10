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

/*
 * `design-handoff/` holds VERBATIM COPIES of the app's source, for a designer to
 * read. Those copies duplicate filenames (App.tsx, theme.ts, every screen) and
 * their relative imports don't resolve from that location — so Metro must not
 * bundle or watch them, or it hits resolution errors and haste collisions.
 */
const handoff = path.resolve(projectRoot, 'design-handoff')
config.resolver.blockList = [new RegExp(`^${handoff.replace(/[\\/]/g, '[\\\\/]')}[\\\\/].*`)]

module.exports = config
