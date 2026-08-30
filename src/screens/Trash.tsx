import { useRef, useState } from 'react'
import { useData, TRASH_TTL_DAYS } from '../store/data'
import { blocksSnippet } from '../lib/format'
import { folderName } from '../lib/tree'
import s from './Trash.module.css'

/*
 * Recently deleted — loose leaves, not a bin.
 *
 * Each deleted note is a dashed-edge sheet that keeps its review history, and a
 * hairline "life left" bar depletes toward the purge. The TEXT never fades:
 * legibility beat the metaphor here.
 *
 * Restore is a REAL restore — the store puts the note back in its folder with
 * its SRS state and rebuilds its history from the ledger, so the copy's promise
 * ("it comes back with its memory") is one the implementation keeps.
 */

const DAY = 86_400_000

export function Trash() {
  const trash = useData((d) => d.trash)
  const folders = useData((d) => d.folders)
  const restoreNote = useData((d) => d.restoreNote)
  const purgeNote = useData((d) => d.purgeNote)
  const emptyTrash = useData((d) => d.emptyTrash)

  const [armed, setArmed] = useState(false)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const arm = () => {
    if (armed) {
      void emptyTrash()
      setArmed(false)
      return
    }
    setArmed(true)
    clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(false), 3500)
  }

  const rows = trash.map((t) => {
    const agoDays = Math.max(0, Math.floor((Date.now() - t.deletedAt) / DAY))
    const left = Math.max(0, TRASH_TTL_DAYS - agoDays)
    return {
      row: t,
      agoDays,
      left,
      lifePct: Math.round((100 * left) / TRASH_TTL_DAYS),
    }
  })

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.headMain}>
          <div className={s.eyebrow}>
            recycle bin{trash.length ? ` · ${trash.length} ${trash.length === 1 ? 'note' : 'notes'}` : ''}
          </div>
          <h1 className={s.title}>Recently deleted</h1>
          <p className={s.lede}>
            Deleted notes rest here with their review history intact — restore one and it comes back with its
            memory. Anything left behind clears itself {TRASH_TTL_DAYS} days after deletion.
          </p>
        </div>
        {trash.length > 0 && (
          <button type="button" className={`${s.empty} ${armed ? s.emptyArmed : ''}`} onClick={arm}>
            {armed ? 'Tap again to confirm' : 'Empty the bin'}
          </button>
        )}
      </div>

      {trash.length > 0 ? (
        <div className={s.sheets}>
          {rows.map(({ row: t, agoDays, left, lifePct }, i) => (
            <div key={t.id} className={s.sheet} style={{ animationDelay: `${120 + i * 80}ms` }}>
              <div className={s.sheetTop}>
                <div className={s.sheetMain}>
                  <div className={s.sheetTitle}>{t.title}</div>
                  <div className={s.snippet}>{blocksSnippet(t.blocks)}</div>
                </div>
                <div className={s.actions}>
                  <button type="button" className={s.restore} onClick={() => void restoreNote(t.id)}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className={s.purge}
                    title="Delete forever"
                    onClick={() => void purgeNote(t.id)}
                  >
                    Delete forever
                  </button>
                </div>
              </div>
              {/*
                One line for every card: no flex-wrap. The meta text ellipsises
                and the bar flexes down, so the card with the most to say is not
                the one that breaks.
              */}
              <div className={s.metaRow}>
                <span className={s.meta}>
                  {folderName(folders, t.folderId)} · deleted {agoDays === 0 ? 'today' : `${agoDays}d ago`}
                  {t.srs ? ' · review history kept' : ''}
                </span>
                <span className={s.track}>
                  <span className={s.life} style={{ width: `${lifePct}%` }} />
                </span>
                <span className={`${s.left} ${left <= 7 ? s.leftSoon : ''}`}>{left}d left</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.none}>
          <div className={s.noneMark} />
          <div className={s.noneLine}>Nothing deleted — the bin is empty.</div>
          <div className={s.noneMeta}>deleted notes rest here for {TRASH_TTL_DAYS} days</div>
        </div>
      )}
    </div>
  )
}
