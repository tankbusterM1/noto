import { useEffect, useRef, useState } from 'react'
import { useData, TRASH_TTL_DAYS } from '../store/data'
import { blocksSnippet } from '../lib/format'
import { agoMs } from '../lib/dates'
import { MONO, SERIF, kicker, rise, clamp } from '../lib/ui'
import { EmptyState } from '../components/EmptyState'
import { TrashIcon } from '../components/icons'

/**
 * The recycle bin — its own screen, not a mode of the library. Deleted notes
 * keep their SRS ledger, so a restore brings the note back with its memory
 * intact; anything left here is purged TRASH_TTL_DAYS after deletion.
 */
export function Trash() {
  const trash = useData((s) => s.trash)
  const restoreNote = useData((s) => s.restoreNote)
  const purgeNote = useData((s) => s.purgeNote)
  const emptyTrash = useData((s) => s.emptyTrash)

  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const emptyBin = () => {
    if (armed) {
      emptyTrash()
      setArmed(false)
      return
    }
    setArmed(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setArmed(false), 3000)
  }

  // The button unmounts once the bin is empty — never let it stay armed, or a
  // later first click (which looks safe) would irreversibly erase the bin.
  useEffect(() => {
    if (trash.length === 0) setArmed(false)
  }, [trash.length])

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 26 }}>
        <div>
          <div style={kicker}>
            Recycle bin · {trash.length} {trash.length === 1 ? 'note' : 'notes'}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>
            Recently deleted
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 9, maxWidth: 540 }}>
            Deleted notes rest here with their review history intact — restore one and it comes
            back with its memory. Anything left behind clears itself {TRASH_TTL_DAYS} days after
            deletion.
          </div>
        </div>
        {trash.length > 0 && (
          <button
            className="del-btn"
            onClick={emptyBin}
            style={{ border: `1px solid ${armed ? 'var(--g1)' : 'var(--ln)'}`, background: 'transparent', color: armed ? 'var(--g1)' : 'var(--ink3)', borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
          >
            {armed ? 'Click again to erase all forever' : 'Empty bin'}
          </button>
        )}
      </div>

      {trash.length === 0 ? (
        <EmptyState
          icon={<TrashIcon size={20} />}
          title="Nothing deleted — the bin is empty."
          hint={`deleted notes rest here until you restore them — the bin clears itself after ${TRASH_TTL_DAYS} days`}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {trash.map((t, i) => {
            const daysLeft = Math.max(0, TRASH_TTL_DAYS - Math.floor((Date.now() - t.deletedAt) / 86_400_000))
            return (
              <div key={t.id} className="trash-card" style={{ background: 'var(--sf)', border: '1px dashed var(--ln)', borderRadius: 15, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, ...rise(i) }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, lineHeight: 1.25 }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, ...clamp(2) }}>
                  {blocksSnippet(t.blocks) || 'empty note'}
                </div>
                <div style={{ flex: 1, minHeight: 4 }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--ln)', paddingTop: 10 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>
                    <span>deleted {agoMs(t.deletedAt)}</span>
                    <span style={{ color: daysLeft <= 3 ? 'var(--am)' : 'var(--ink3)' }}>
                      {daysLeft === 0 ? 'auto-deletes today' : `auto-deletes in ${daysLeft}d`}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => restoreNote(t.id)} className="press" style={{ border: '1px solid var(--g4)', background: 'transparent', color: 'var(--g4)', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      ↺ Restore
                    </button>
                    <button onClick={() => purgeNote(t.id)} className="del-btn" title="Delete forever" style={{ border: '1px solid var(--ln)', background: 'transparent', color: 'var(--ink3)', borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
                      <TrashIcon size={11} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
