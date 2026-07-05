import { useRef, useState, type CSSProperties } from 'react'
import { MONO } from '../lib/ui'
import { PlusIcon } from './icons'

/**
 * A neat "+ add …" affordance: a quiet ghost row that pops into a focused
 * field (amber ring, ↵ hint). Enter adds and keeps the field open for rapid
 * entry; Escape or an empty blur collapses it back to the ghost row.
 */
export function AddRow({
  placeholder,
  onAdd,
  dense = false,
}: {
  placeholder: string
  onAdd: (v: string) => void
  dense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const openIt = () => {
    setOpen(true)
    requestAnimationFrame(() => ref.current?.focus())
  }
  const submit = () => {
    if (v.trim()) {
      onAdd(v)
      setV('')
      ref.current?.focus()
    }
  }

  if (!open) {
    return (
      <button
        className="addghost"
        onClick={openIt}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--ink3)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: dense ? 12 : 12.5,
          padding: dense ? '7px 6px' : '9px 8px',
          borderRadius: 8,
          textAlign: 'left',
        }}
      >
        <PlusIcon size={11} />
        {placeholder}
      </button>
    )
  }

  const box: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--sf2)',
    border: '1px solid var(--ln)',
    borderRadius: 9,
    padding: '2px 8px 2px 10px',
  }
  return (
    <div className="addopen" style={box}>
      <PlusIcon size={11} style={{ color: 'var(--am)', flexShrink: 0 }} />
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'Escape') {
            setV('')
            setOpen(false)
          }
        }}
        onBlur={() => {
          if (!v.trim()) setOpen(false)
        }}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)', padding: dense ? '5px 0' : '7px 0' }}
      />
      <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', flexShrink: 0 }}>↵</span>
    </div>
  )
}
