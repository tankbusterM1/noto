/*
 * Renders the iOS app icon + splash mark from the Noto brand mark.
 *
 * Run from the repo root (sharp lives in the root node_modules):
 *   node scripts/make-mobile-icons.mjs
 *
 * Two deliberate differences from public/noto-mark.svg:
 *   · the app icon is FULL BLEED (no rounded corners). iOS applies its own
 *     squircle mask; baking a radius in leaves a dark halo inside the mask.
 *   · the splash mark is transparent-background ink, since app.json paints the
 *     splash with backgroundColor #f4f1e9.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'mobile/assets')

const INK = '#1d1912'
const PAPER = '#f4f1e9'
const AMBER = '#b87a26'

/** The N monogram: two stems and the diagonal that joins them, plus the seal. */
const mark = (fill, seal) => `
  <g fill="${fill}">
    <path d="M126 148 H188 V364 H126 Z"/>
    <path d="M324 148 H386 V364 H324 Z"/>
    <path d="M126 148 H188 L386 364 H324 Z"/>
  </g>
  <circle cx="406" cy="374" r="30" fill="${seal}"/>
`

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  ${mark(PAPER, AMBER)}
</svg>`

const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${mark(INK, AMBER)}
</svg>`

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${INK}"/>
  ${mark(PAPER, AMBER)}
</svg>`

async function png(svg, size, file, { flatten = null } = {}) {
  let img = sharp(Buffer.from(svg)).resize(size, size)
  // iOS rejects icons with an alpha channel; flatten onto the ink field.
  if (flatten) img = img.flatten({ background: flatten })
  await img.png().toFile(resolve(out, file))
  console.log(`  ${file}  ${size}x${size}`)
}

await mkdir(out, { recursive: true })
console.log('writing mobile/assets:')
await png(iconSvg, 1024, 'icon.png', { flatten: INK })
await png(splashSvg, 512, 'splash-icon.png')
await png(faviconSvg, 64, 'favicon.png')
await png(splashSvg, 432, 'android-icon-foreground.png')
await writeFile(resolve(out, 'android-icon-background.png'), await sharp({
  create: { width: 432, height: 432, channels: 3, background: PAPER },
}).png().toBuffer())
console.log('  android-icon-background.png  432x432')
console.log('done')
