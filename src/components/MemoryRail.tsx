import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueLabel, gradeColor, gradeName } from '../lib/srs'
import { recallNow } from '../lib/adaptive'
import { folderPath } from '../lib/tree'
import { words, noteFullText } from '../lib/format'
import { ago, addDays, fmtShort } from '../lib/dates'
import { LocalLoom } from './LocalLoom'
import { Caret, TrashIcon } from './icons'
import type { Note, SrsState } from '../lib/types'
import s from './MemoryRail.module.css'

/*
 * The memory rail — the note's spine.
 *
 * A recessed bed with one panel on it, and inside that a single vertical thread
 * with knots: when it comes back, every time it did, and the day it was first
 * seen. Amber marks "due now" and nothing else.
 *
 * It is a FLEX SIBLING of the writing column, never nested inside it — nested,
 * width/flex-shrink do nothing and the rail stacks under the note.
 */

export function MemoryRail({
  note,
  sr,
  armed,
  onArmDelete,
  unwoven,
  onWeave,
}: {
  note: Note
  sr: SrsState | undefined
  armed: boolean
  onArmDelete: () => void
  unwoven: { title: string; id: string }[]
  onWeave: (title: string) => void
}) {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const folders = useData((d) => d.folders)
  const addToReview = useData((d) => d.addToReview)
  const open = useUI((u) => u.memRailOpen)
  const toggle = useUI((u) => u.toggleMemRail)
  const startReview = useUI((u) => u.startReview)
  const openNote = useUI((u) => u.openNote)
  const setThread = useUI((u) => u.setThread)

  const due = sr ? sr.due <= 0 : false
  const recall = sr ? recallNow(sr) : null

  // "Stitched to" — other notes sharing a tag, and which tag stitched them.
  const stitched = notes
    .filter((n) => n.id !== note.id && n.tags.some((t) => note.tags.includes(t)))
    .slice(0, 3)
    .map((n) => ({ note: n, via: n.tags.find((t) => note.tags.includes(t)) ?? '' }))

  const backlinks = notes.filter(
    (n) => n.id !== note.id && noteFullText(n).includes('[[' + note.title.trim().toLowerCase() + ']]'),
  )

  return (
    <aside className={`${s.rail} ${open ? '' : s.railShut}`}>
      <button
        type="button"
        className={s.collapse}
        onClick={toggle}
        title={open ? 'Collapse the memory rail · ⌘⇧\\' : 'Open the memory rail · ⌘⇧\\'}
      >
        <Caret size={9} style={{ transform: open ? 'none' : 'rotate(180deg)' }} />
      </button>

      {open && (
        <div className={s.inner}>
          <section className={s.panel}>
            <div className={s.panelHead}>
              <span className={s.diamondSm} />
              <span className={s.label}>Memory</span>
            </div>

            {sr ? (
              <div className={s.thread}>
                {/* next review */}
                <div className={s.knot}>
                  <span className={`${s.diamond} ${due ? s.diamondDue : ''}`} />
                  <div className={s.knotBody}>
                    <div className={s.nextLabel}>{due ? 'due now' : dueLabel(sr.due)}</div>
                    <div className={s.meta}>
                      {fmtShort(addDays(Math.max(0, sr.due)))} · ivl {sr.ivl}d · ease {sr.ease.toFixed(2)} ·{' '}
                      {sr.hist.length} review{sr.hist.length === 1 ? '' : 's'}
                    </div>
                    {recall !== null && (
                      <div className={s.meta}>recall now ~{Math.round(recall * 100)}%</div>
                    )}
                    {due && (
                      <button type="button" className={s.reviewNow} onClick={() => startReview(note.id)}>
                        Review now
                      </button>
                    )}
                  </div>
                </div>

                {/* every past review */}
                {sr.hist
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <div className={s.knot} key={i}>
                      <span className={s.dot} />
                      <div className={s.knotRow}>
                        <span style={{ color: gradeColor(h.g) }}>{gradeName(h.g)}</span>
                        <span className={s.metaInline}>→ {h.ivl}d</span>
                        <span className={s.knotDate}>{fmtShort(addDays(h.d))}</span>
                      </div>
                    </div>
                  ))}

                {/* first seen */}
                <div className={s.knot}>
                  <span className={s.dotHollow} />
                  <div className={s.knotRow}>
                    <span className={s.meta}>first seen</span>
                    <span className={s.knotDate}>{ago(note.created ?? note.updated)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={s.notYet}>
                <span className={s.diamondDashed} />
                <div>
                  <div className={s.notYetLine}>Not on the thread yet.</div>
                  <button type="button" className={s.reviewNow} onClick={() => addToReview(note.id)}>
                    Add to review
                  </button>
                </div>
              </div>
            )}
          </section>

          {stitched.length > 0 && (
            <section className={s.section}>
              <div className={s.label}>Stitched to</div>
              <div className={s.stitchThread}>
                {stitched.map(({ note: n, via }) => (
                  <button type="button" key={n.id} className={s.stitch} onClick={() => openNote(n.id)}>
                    <span className={s.stitchTitle}>{n.title}</span>
                    <span className={s.meta}>via #{via}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={s.section}>
            <div className={s.label}>Details</div>
            <Row k="folder" v={folderPath(folders, note.folderId)} />
            <Row k="words" v={String(words(note))} />
            <Row k="edited" v={ago(note.updated)} />
          </section>

          {/* The local weave — kept from the previous rail. */}
          <LocalLoom note={note} notes={notes} srs={srs} />

          {unwoven.length > 0 && (
            <section className={s.section}>
              <div className={s.label}>Noto noticed · unwoven</div>
              {unwoven.map((u) => (
                <button type="button" key={u.id} className={s.stitch} onClick={() => onWeave(u.title)}>
                  <span className={s.stitchTitle}>{u.title}</span>
                  <span className={s.meta}>weave it →</span>
                </button>
              ))}
            </section>
          )}

          {backlinks.length > 0 && (
            <section className={s.section}>
              <div className={s.label}>Linked mentions · {backlinks.length}</div>
              {backlinks.slice(0, 4).map((n) => (
                <button type="button" key={n.id} className={s.stitch} onClick={() => openNote(n.id)}>
                  <span className={s.stitchTitle}>{n.title}</span>
                  <span className={s.meta}>[[links here]]</span>
                </button>
              ))}
            </section>
          )}

          {note.tags.length > 0 && (
            <section className={s.section}>
              <div className={s.label}>Tags</div>
              <div className={s.tagRow}>
                {note.tags.map((t) => (
                  <button type="button" key={t} className={s.tag} onClick={() => setThread(t)}>
                    #{t}
                  </button>
                ))}
              </div>
            </section>
          )}

          <button type="button" className={`${s.del} ${armed ? s.delArmed : ''}`} onClick={onArmDelete}>
            <TrashIcon size={12} />
            {armed ? 'Click again to delete' : 'Delete note'}
          </button>
        </div>
      )}
    </aside>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={s.detailRow}>
      <span className={s.meta}>{k}</span>
      <span className={s.detailVal}>{v}</span>
    </div>
  )
}
