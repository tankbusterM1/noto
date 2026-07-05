import type { CSSProperties } from 'react'
import { useUI } from './store/ui'
import { Sidebar } from './shell/Sidebar'
import { ScreenPlaceholder } from './screens/ScreenPlaceholder'

export default function App() {
  const dark = useUI((s) => s.dark)
  const accent = useUI((s) => s.accent)

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
          <ScreenPlaceholder />
        </main>
      </div>
    </div>
  )
}
