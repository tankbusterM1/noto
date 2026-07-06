import type { MouseEvent } from 'react'
import { useUI } from '../store/ui'
import { threadColor } from '../lib/loom'
import { MONO } from '../lib/ui'

/**
 * A clickable `#tag` that pulls its thread (README "Tag threads"). Muted tags
 * live on note cards / todos (ink3 → amber on hover); amber tags live in the
 * editor / watch cards.
 */
export function TagLink({
  tag,
  variant = 'muted',
  size = 10,
}: {
  tag: string
  variant?: 'muted' | 'amber'
  size?: number
}) {
  const setThread = useUI((s) => s.setThread)
  return (
    <span
      className={variant === 'muted' ? 'tag' : 'tag-lift'}
      title="Pull this thread"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        setThread(tag)
      }}
      style={{
        fontFamily: MONO,
        fontSize: size,
        color: variant === 'muted' ? 'var(--ink3)' : 'var(--am)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {/* the thread's signature color — same hue in the Loom and drawers */}
      <span style={{ width: 4.5, height: 4.5, borderRadius: 99, background: threadColor(tag), flexShrink: 0, opacity: 0.9 }} />
      #{tag}
    </span>
  )
}
