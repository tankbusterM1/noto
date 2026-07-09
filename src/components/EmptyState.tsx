import type { ReactNode } from 'react'
import { MONO, SERIF } from '../lib/ui'

/**
 * The shared empty-state: a quiet dashed card with an icon, an italic serif
 * line, and an optional mono hint. Every list in Noto ends somewhere — this is
 * what "somewhere" looks like.
 */
export function EmptyState({
  icon,
  title,
  hint,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        textAlign: 'center',
        border: '1px dashed var(--ln)',
        borderRadius: 14,
        padding: compact ? '18px 16px' : '34px 24px',
        animation: 'fadein 0.35s ease both',
      }}
    >
      {icon && <span style={{ color: 'var(--ink3)', display: 'flex' }}>{icon}</span>}
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: compact ? 13.5 : 15.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--ink3)' }}>{hint}</div>
      )}
    </div>
  )
}
