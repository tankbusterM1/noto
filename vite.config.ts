/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// The PWA turns Noto into an installable, offline, self-updating local app.
// Skipped under Vitest so the test run stays fast and DOM-free.
const isTest = !!process.env.VITEST

// A Content-Security-Policy is Noto's backstop: even if a future render path
// slipped an injection through, script-src 'self' stops it executing, and the
// connect-src allow-list caps where the app can phone home to (GitHub for sync,
// noembed + the CORS proxy for Watch-Later scraping — nothing else).
//   · style-src 'unsafe-inline' — React inline style={} are element style attrs;
//     there is no nonce path for those, so this is required and standard.
//   · img-src https: — scraped article/video thumbnails come from arbitrary hosts.
//   · injected at BUILD ONLY (apply:'build') so `vite dev` keeps its inline HMR
//     scripts + websocket; the production bundle loads only external 'self' JS.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com https://noembed.com https://api.allorigins.win",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const cspPlugin = {
  name: 'noto-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      '</title>',
      `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    )
  },
}

// https://vite.dev/config/  ·  https://vitest.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cspPlugin,
    ...(isTest
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            // Icons generated from public/noto-mark.svg at build time.
            pwaAssets: { image: 'public/noto-mark.svg', preset: 'minimal-2023' },
            manifest: {
              id: '/',
              name: 'Noto — notes that stay',
              short_name: 'Noto',
              description:
                'A local-first notebook with spaced-repetition memory. Your vault never leaves this device.',
              lang: 'en',
              theme_color: '#b87a26',
              background_color: '#f4f1e9',
              display: 'standalone',
              start_url: '/',
              scope: '/',
              categories: ['productivity', 'education'],
            },
            workbox: {
              // Precache the whole app (incl. self-hosted fonts) so it runs
              // fully offline; drop stale precaches on every new build/push.
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
              maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
              cleanupOutdatedCaches: true,
              navigateFallback: 'index.html',
            },
            devOptions: { enabled: false },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/lang-markdown',
            '@codemirror/language',
            '@lezer/highlight',
          ],
          dexie: ['dexie'],
        },
      },
    },
  },
  test: {
    // The SRS engine is pure — no DOM needed, so the fast node env is fine.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
