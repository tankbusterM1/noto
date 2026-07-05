import { useUI } from '../store/ui'
import { MONO } from '../lib/ui'

/** Bottom-center pill toast, auto-dismissed by the store (~2.4s). */
export function Toast() {
  const toast = useUI((s) => s.toast)
  if (!toast) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 74,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 120,
        background: 'var(--ink)',
        color: 'var(--bg)',
        borderRadius: 999,
        padding: '9px 18px',
        fontFamily: MONO,
        fontSize: 11,
        boxShadow: '0 12px 30px rgba(20,16,8,0.28)',
        animation: 'popin 0.25s ease both',
        whiteSpace: 'nowrap',
      }}
    >
      {toast}
    </div>
  )
}
