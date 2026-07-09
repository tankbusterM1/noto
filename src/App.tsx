import { useEffect, type CSSProperties } from 'react'
import { useUI } from './store/ui'
import { useData } from './store/data'
import { Sidebar } from './shell/Sidebar'
import { Router } from './screens/Router'
import { Toast } from './components/Toast'
import { WatchDrawer } from './components/WatchDrawer'
import { ThreadDrawer } from './components/ThreadDrawer'
import { CommandPalette } from './components/CommandPalette'
import { Settings } from './components/Settings'
import { HelpOverlay } from './components/HelpOverlay'
import { HistoryDrawer } from './components/HistoryDrawer'
import { useKeyboard } from './shell/useKeyboard'

export default function App() {
  const dark = useUI((s) => s.dark)
  const accent = useUI((s) => s.accent)
  const hydrated = useData((s) => s.hydrated)
  const hydrate = useData((s) => s.hydrate)
  const hydrateError = useData((s) => s.hydrateError)
  const journalKey = useData((s) => s.journalKey)
  const lockJournalCrypto = useData((s) => s.lockJournalCrypto)

  useKeyboard()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Auto-lock the encrypted journal after a stretch of inactivity, so an unlocked
  // journal left open doesn't stay readable indefinitely (reload already locks —
  // the key is memory-only). Only runs while a key is actually held.
  useEffect(() => {
    if (!journalKey) return
    const IDLE_MS = 8 * 60_000
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        lockJournalCrypto()
        useUI.getState().showToast('Journal auto-locked')
      }, IDLE_MS)
    }
    const events = ['keydown', 'pointerdown', 'wheel', 'touchstart']
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [journalKey, lockJournalCrypto])

  // The theme wrapper sets --accent-base; tokens.css derives --ac/--acI from it.
  const rootStyle = {
    '--accent-base': accent,
    height: '100dvh',
    overflow: 'hidden',
    background: 'var(--bg)',
    color: 'var(--ink)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    transition: 'background-color 0.35s ease, color 0.35s ease',
  } as CSSProperties

  return (
    <div className={dark ? 'theme-dark' : 'theme-light'} style={rootStyle}>
      {hydrated ? (
        <>
          <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <Sidebar />
            <main
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                overflowY: 'auto',
                background: 'var(--bg)',
                transition: 'background-color 0.35s ease',
              }}
            >
              <Router />
            </main>
          </div>
          <WatchDrawer />
          <ThreadDrawer />
          <HistoryDrawer />
          <CommandPalette />
          <Settings />
          <HelpOverlay />
          <Toast />
        </>
      ) : hydrateError ? (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, color: 'var(--ink)' }}>
            Couldn't open the vault.
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 420, lineHeight: 1.55 }}>
            Your data is still on this device — the browser just couldn't open the database. {hydrateError}
          </div>
          <button
            onClick={() => void hydrate()}
            style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
          }}
        >
          opening the vault…
        </div>
      )}
    </div>
  )
}
