import { useState } from 'react'
import { MONO } from '../lib/ui'

/** A dashed "add a…" input that fires onAdd(value) on Enter and clears. */
export function AddInput({
  placeholder,
  onAdd,
  mono = false,
  fontSize = 12.5,
}: {
  placeholder: string
  onAdd: (v: string) => void
  mono?: boolean
  fontSize?: number
}) {
  const [v, setV] = useState('')
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) {
          onAdd(v)
          setV('')
        }
      }}
      placeholder={placeholder}
      style={{
        border: '1px dashed var(--ln)',
        outline: 'none',
        background: 'transparent',
        fontFamily: mono ? MONO : 'inherit',
        fontSize,
        color: 'var(--ink)',
        borderRadius: 8,
        padding: '7px 10px',
        width: '100%',
      }}
    />
  )
}
