// Build launcher/noto.ico from the PWA icons (run after a build, or via
// `npm run make:icon`). Pure JS — no native deps.
import pngToIco from 'png-to-ico'
import { writeFile, mkdir, access } from 'node:fs/promises'

const srcs = ['dist/pwa-192x192.png', 'dist/pwa-64x64.png']
for (const s of srcs) {
  try {
    await access(s)
  } catch {
    console.error(`Missing ${s} — run "npm run build" first.`)
    process.exit(1)
  }
}

const buf = await pngToIco(srcs)
await mkdir('launcher', { recursive: true })
await writeFile('launcher/noto.ico', buf)
console.log(`Wrote launcher/noto.ico (${buf.length} bytes)`)
