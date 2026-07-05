import type { MouseEvent } from 'react'
import { useUI } from '../store/ui'
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
        display: 'inline-block',
      }}
    >
      #{tag}
    </span>
  )
}
