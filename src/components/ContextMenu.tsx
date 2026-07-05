import { useEffect, type ReactNode } from 'react'
import { MONO } from '../lib/ui'

export interface MenuItem {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
  divider?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** A small right-click menu positioned at the cursor; closes on click-away/esc. */
export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the opening contextmenu event doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, onClose])

  if (!menu) return null

  const width = 190
  const left = Math.min(menu.x, window.innerWidth - width - 8)
  const top = Math.min(menu.y, window.innerHeight - menu.items.length * 34 - 12)

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: Math.max(8, top),
        left: Math.max(8, left),
        width,
        zIndex: 200,
        background: 'var(--bg)',
        border: '1px solid var(--ln)',
        borderRadius: 12,
        boxShadow: '0 18px 44px rgba(24,19,10,0.24)',
        padding: 6,
        maxHeight: '80vh',
        overflowY: 'auto',
        animation: 'rise 0.14s cubic-bezier(0.3,0.7,0.3,1) both',
      }}
    >
      {menu.items.map((it, i) =>
        it.divider ? (
          <div key={i} style={{ height: 1, background: 'var(--ln)', margin: '5px 6px' }} />
        ) : (
          <div
            key={i}
            className="tint"
            onClick={() => {
              onClose()
              it.onClick()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: it.danger ? 'var(--g1)' : 'var(--ink2)',
            }}
          >
            {it.icon && <span style={{ display: 'flex', width: 14, color: it.danger ? 'var(--g1)' : 'var(--ink3)' }}>{it.icon}</span>}
            <span style={{ flex: 1 }}>{it.label}</span>
          </div>
        ),
      )}
      <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--ink3)', textAlign: 'center', paddingTop: 4 }}>right-click menu</div>
    </div>
  )
}
