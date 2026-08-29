import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlockType } from '../lib/types'
import s from './BlockMenu.module.css'

/*
 * The block menu — one panel, two jobs:
 *   insert  → add a new block below index i
 *   turn    → replace block i, carrying its text across
 *
 * Filter input is autofocused; ↑↓ move, Enter commits, Esc closes, hover
 * selects. Ten kinds, each `icon | label | HINT`.
 */

export interface Kind {
  t: BlockType
  icon: string
  label: string
  hint: string
}

export const KINDS: Kind[] = [
  { t: 'p', icon: '¶', label: 'Text', hint: 'plain' },
  { t: 'h2', icon: 'H', label: 'Heading', hint: 'section' },
  { t: 'ul', icon: '–', label: 'Bullet list', hint: 'list' },
  { t: 'todo', icon: '☐', label: 'To-do', hint: 'task' },
  { t: 'q', icon: '❝', label: 'Quote', hint: 'pull' },
  { t: 'code', icon: '</>', label: 'Code', hint: 'mono' },
  { t: 'call', icon: '✎', label: 'Callout', hint: 'aside' },
  { t: 'img', icon: '▣', label: 'Image', hint: 'drop' },
  { t: 'link', icon: '⌁', label: 'Link card', hint: 'url' },
  { t: 'div', icon: '—', label: 'Divider', hint: 'rule' },
]

export function BlockMenu({
  x,
  y,
  mode,
  onPick,
  onClose,
}: {
  x: number
  y: number
  mode: 'insert' | 'turn'
  onPick: (t: BlockType) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const hits = useMemo(() => {
    // Fold out punctuation on both sides, and match the type key too: typing the
    // natural word "todo" must find "To-do", and "div" must find the divider.
    const flat = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
    const needle = flat(q)
    if (!needle) return KINDS
    return KINDS.filter((k) => (flat(k.label) + flat(k.hint) + k.t).includes(needle))
  }, [q])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    setSel(0)
  }, [q])

  // Close on anything that isn't this menu.
  useEffect(() => {
    const away = () => onClose()
    const t = setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('wheel', away, { passive: true })
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('wheel', away)
    }
  }, [onClose])

  const commit = (k?: Kind) => {
    const pick = k ?? hits[sel]
    if (pick) onPick(pick.t)
  }

  const left = Math.max(8, Math.min(x, window.innerWidth - 274 - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - 340))

  return (
    <div
      className={s.menu}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        className={s.filter}
        value={q}
        placeholder={mode === 'turn' ? 'Turn this block into…' : 'Add a block…'}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((i) => Math.min(hits.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <div className={s.list}>
        {hits.map((k, i) => (
          <button
            type="button"
            key={k.t}
            className={`${s.item} ${i === sel ? s.itemOn : ''}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => commit(k)}
          >
            <span className={s.icon}>{k.icon}</span>
            <span className={s.label}>{k.label}</span>
            <span className={s.hint}>{k.hint}</span>
          </button>
        ))}
        {hits.length === 0 && <div className={s.none}>nothing matches</div>}
      </div>
    </div>
  )
}
