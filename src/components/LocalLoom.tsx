import { useState } from 'react'
import { useUI } from '../store/ui'
import { localLoom, threadColor } from '../lib/loom'
import { MONO, SERIF } from '../lib/ui'
import type { Note, SrsState } from '../lib/types'

/**
 * Local loom — a tiny radial constellation in the editor rail: this note at
 * the center, everything it touches on the ring. Solid accent spokes are
 * [[wikilinks]] (either direction); dashed colored spokes are shared tag
 * threads (in that thread's signature color). Click a knot to hop to it.
 */
export function LocalLoom({ note, notes, srs }: { note: Note; notes: Note[]; srs: Record<string, SrsState> }) {
  const openNote = useUI((s) => s.openNote)
  const [hov, setHov] = useState<string | null>(null)

  const links = localLoom(note, notes)
  if (links.length === 0) return null

  const S = 232
  const cx = S / 2
  const cy = 92
  const R = 66

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 4 }}>
        Local loom · {links.length}
      </div>
      <svg viewBox={`0 0 ${S} 184`} style={{ width: '100%', display: 'block' }}>
        {links.map((l, i) => {
          const a = (i / links.length) * Math.PI * 2 - Math.PI / 2
          const x = cx + Math.cos(a) * R
          const y = cy + Math.sin(a) * R * 0.82
          const sr = srs[l.note.id]
          const due = sr && sr.due <= 0
          const isLink = l.via === 'link'
          return (
            <g key={l.note.id} style={{ cursor: 'pointer' }} onClick={() => openNote(l.note.id)} onMouseEnter={() => setHov(l.note.title + (isLink ? '  · [[linked]]' : '  · #' + l.via))} onMouseLeave={() => setHov(null)}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={isLink ? 'var(--ac)' : threadColor(l.via)}
                strokeWidth={isLink ? 1.5 : 1}
                strokeDasharray={isLink ? undefined : '2 3.5'}
                opacity={0.55}
              />
              <circle cx={x} cy={y} r={5} fill={due ? 'var(--am)' : sr ? 'var(--ac)' : 'var(--bg)'} stroke={sr ? 'none' : 'var(--ink3)'} strokeWidth={sr ? 0 : 1} strokeDasharray={sr ? undefined : '2 2'} />
              <title>{l.note.title}</title>
            </g>
          )
        })}
        {/* this note, at the center of its web */}
        <circle cx={cx} cy={cy} r={7} fill="var(--am)" />
        <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--am)" strokeWidth={1} opacity={0.3} />
      </svg>
      <div style={{ fontFamily: hov ? SERIF : MONO, fontSize: hov ? 12 : 9, color: hov ? 'var(--ink)' : 'var(--ink3)', textAlign: 'center', minHeight: 16, marginTop: 2, fontStyle: hov ? 'normal' : undefined }}>
        {hov ?? 'hover a knot · click to hop'}
      </div>
    </div>
  )
}
