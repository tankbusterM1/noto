import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { inkOpacity, srsPill } from '../lib/srs'
import { folderName } from '../lib/tree'
import { snippet } from '../lib/format'
import { ago } from '../lib/dates'
import { MONO, SERIF, chip, clamp, rise } from '../lib/ui'
import type { Note } from '../lib/types'

/** Recently-edited (Today) and library-grid note cards. Ink-faded by SRS. */
export function NoteCard({
  note,
  variant,
  index = 0,
  resumed = false,
  onContextMenu,
}: {
  note: Note
  variant: 'recent' | 'grid'
  index?: number
  /** The note you left off in — wears a ribbon. */
  resumed?: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const folders = useData((s) => s.folders)
  const srs = useData((s) => s.srs)
  const inkFade = useUI((s) => s.inkFade)
  const openNote = useUI((s) => s.openNote)

  const sr = srs[note.id]
  // Floor at 0.76: a faded note must still be readable. The previous build let
  // this fall to 0.55 and below, which is the complaint that started the
  // redesign. Hover restores it to 1 (see .ink-card in global.css).
  const ink = Math.max(0.76, inkOpacity(sr, inkFade))
  const pill = srsPill(sr)
  const folder = folderName(folders, note.folderId)
  const pillStyle = { fontFamily: MONO, fontSize: 10, color: pill.color, fontWeight: pill.bold ? 600 : undefined }

  if (variant === 'recent') {
    return (
      <div
        className="ink-card lift"
        onClick={() => openNote(note.id)}
        onContextMenu={onContextMenu}
        style={{
          background: 'var(--sf)',
          border: '1px solid var(--ln)',
          borderRadius: 14,
          padding: '15px 18px',
          cursor: 'pointer',
          ...rise(index),
        }}
      >
        <div className="ink-body" style={{ opacity: ink }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 17.5,
                fontWeight: 500,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {note.title}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', flexShrink: 0 }}>
              {ago(note.updated)}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 5, lineHeight: 1.5, ...clamp(1) }}>
            {snippet(note)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={chip}>{folder}</span>
          <span style={pillStyle}>{pill.label}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="ink-card paper-stack"
      onClick={() => openNote(note.id)}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        background: 'var(--sf)',
        border: '1px solid var(--ln)',
        borderRadius: 13,
        padding: '19px 20px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        ...rise(index),
      }}
    >
      {resumed && <span className="ribbon-card" aria-hidden />}
      <div className="ink-body" style={{ opacity: ink }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, lineHeight: 1.25 }}>
          {note.title}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, marginTop: 7, ...clamp(2) }}>
          {snippet(note)}
        </div>
      </div>
      {/* One mono line: where it lives, when you touched it, when it comes back. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginTop: 13,
          fontFamily: MONO,
          fontSize: 9.5,
          color: 'var(--ink3)',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder}</span>
        <span>·</span>
        <span style={{ whiteSpace: 'nowrap' }}>{ago(note.updated)}</span>
        <span style={{ ...pillStyle, marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>{pill.label}</span>
      </div>
    </div>
  )
}
