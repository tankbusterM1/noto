import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { inkOpacity, srsPill } from '../lib/srs'
import { folderName } from '../lib/tree'
import { snippet } from '../lib/format'
import { ago } from '../lib/dates'
import { MONO, SERIF, chip, clamp, rise } from '../lib/ui'
import { TagLink } from './TagLink'
import type { Note } from '../lib/types'

/** Recently-edited (Today) and library-grid note cards. Ink-faded by SRS. */
export function NoteCard({
  note,
  variant,
  index = 0,
  onContextMenu,
}: {
  note: Note
  variant: 'recent' | 'grid'
  index?: number
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const folders = useData((s) => s.folders)
  const srs = useData((s) => s.srs)
  const inkFade = useUI((s) => s.inkFade)
  const openNote = useUI((s) => s.openNote)

  const sr = srs[note.id]
  const ink = inkOpacity(sr, inkFade)
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
      className="ink-card lift-2"
      onClick={() => openNote(note.id)}
      onContextMenu={onContextMenu}
      style={{
        background: 'var(--sf)',
        border: '1px solid var(--ln)',
        borderRadius: 15,
        padding: '17px 19px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        ...rise(index),
      }}
    >
      <div className="ink-body" style={{ opacity: ink }}>
        <div style={{ fontFamily: SERIF, fontSize: 18.5, fontWeight: 500, lineHeight: 1.25 }}>
          {note.title}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6, ...clamp(2) }}>
          {snippet(note)}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={chip}>{folder}</span>
        {note.tags.map((t) => (
          <TagLink key={t} tag={t} variant="muted" size={10} />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--ln)',
          paddingTop: 10,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{ago(note.updated)}</span>
        <span style={pillStyle}>{pill.label}</span>
      </div>
    </div>
  )
}
