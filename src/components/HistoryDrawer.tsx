import { useEffect, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { agoMs } from '../lib/dates'
import { blocksWords, stripInline } from '../lib/format'
import { MONO, SERIF, clamp } from '../lib/ui'
import { HistoryIcon, CloseIcon } from './icons'
import type { Block } from '../lib/types'

/*
 * Drafts — a note's version history, drawn as layers of ink. Each editing
 * burst leaves a saved draft; the newest sit sharp at the top and older ones
 * fade (the same ink-fade metaphor the whole app runs on). Click a layer to
 * peek at it and restore — restoring snapshots the current text first, so it's
 * never destructive.
 */

const sectionLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}

const draftText = (blocks: Block[]) =>
  stripInline(
    blocks
      .map((b) => b.text || (b.items ?? []).join(' · '))
      .filter(Boolean)
      .join('\n'),
  ).trim()

export function HistoryDrawer() {
  const historyOpen = useUI((s) => s.historyOpen)
  const closeHistory = useUI((s) => s.closeHistory)
  const noteId = useUI((s) => s.noteId)
  const notes = useData((s) => s.notes)
  const revisions = useData((s) => s.revisions)
  const loadRevisions = useData((s) => s.loadRevisions)
  const restoreRevision = useData((s) => s.restoreRevision)
  const [open, setOpen] = useState<number | null>(null)

  const note = notes.find((n) => n.id === noteId)

  useEffect(() => {
    if (historyOpen && note) void loadRevisions(note.id)
    setOpen(null)
  }, [historyOpen, note?.id, loadRevisions, note])

  if (!historyOpen || !note) return null

  const curWords = blocksWords(note.blocks)
  const stitch = (
    <div style={{ position: 'absolute', left: -22.5, top: 15, width: 7, height: 7, background: 'var(--am)', transform: 'rotate(45deg)' }} />
  )

  return (
    <>
      <div onClick={closeHistory} style={{ position: 'fixed', inset: 0, zIndex: 132, background: 'rgba(24,19,10,0.38)', animation: 'fadein 0.25s ease both' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 133, background: 'var(--bg)', borderLeft: '1px solid var(--ln)', boxShadow: '-24px 0 60px rgba(24,19,10,0.18)', display: 'flex', flexDirection: 'column', animation: 'drawerin 0.35s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        {/* header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--ln)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <HistoryIcon style={{ color: 'var(--am)' }} />
            <span style={sectionLabel}>drafts</span>
            <span style={{ flex: 1 }} />
            <div className="circle-btn" onClick={closeHistory} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid var(--ln)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>
              <CloseIcon size={10} />
            </div>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 8, lineHeight: 1.25 }}>{note.title}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 5 }}>
            {revisions.length === 0 ? 'no earlier drafts yet' : `${revisions.length} earlier ${revisions.length === 1 ? 'draft' : 'drafts'} · layered by ink`}
          </div>
        </div>

        {/* timeline */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 30px' }}>
          <div style={{ borderLeft: '1.5px dashed var(--am)', marginLeft: 7, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
            {/* current (live) — not restorable, it's what you're on */}
            <div style={{ position: 'relative', background: 'var(--sf)', border: '1px solid var(--am)', borderRadius: 12, padding: '11px 13px' }}>
              <div style={{ position: 'absolute', left: -23, top: 14, width: 9, height: 9, borderRadius: 99, background: 'var(--am)', boxShadow: '0 0 0 3px rgba(184,122,38,0.16)' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--am)', fontWeight: 600 }}>NOW · current</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>{curWords} words</span>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6, ...clamp(2) }}>
                {draftText(note.blocks) || 'empty'}
              </div>
            </div>

            {revisions.map((rev, i) => {
              const isOpen = open === rev.id
              const ink = Math.max(0.42, 1 - i * 0.09) // older drafts fade
              const w = blocksWords(rev.blocks)
              const delta = w - curWords
              return (
                <div
                  key={rev.id}
                  className="nudge"
                  onClick={() => setOpen(isOpen ? null : (rev.id ?? null))}
                  // Older drafts fade (the ink metaphor). No opacity-animating
                  // entrance here — it would override this age-fade.
                  style={{ position: 'relative', background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 12, padding: '11px 13px', cursor: 'pointer', opacity: isOpen ? 1 : ink, transition: 'opacity 0.2s ease, border-color 0.15s ease, transform 0.12s ease' }}
                >
                  {stitch}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: 500 }}>{agoMs(rev.savedAt)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>
                      {w} words{delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta}` : ''}
                    </span>
                  </div>
                  {rev.title !== note.title && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', marginTop: 3 }}>titled “{rev.title}”</div>
                  )}
                  <div style={{ fontFamily: SERIF, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, marginTop: 6, whiteSpace: 'pre-wrap', ...(isOpen ? {} : clamp(1)) }}>
                    {draftText(rev.blocks) || 'empty'}
                  </div>
                  {isOpen && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          restoreRevision(rev)
                        }}
                        className="btn-dark"
                        style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        ↺ Restore this draft
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -22.5, top: 12, width: 8, height: 8, borderRadius: 99, border: '1.5px solid var(--am)', background: 'var(--bg)' }} />
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'var(--ink3)' }}>
                {revisions.length === 0 ? 'edits you make are saved here as drafts.' : 'the note began here.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
