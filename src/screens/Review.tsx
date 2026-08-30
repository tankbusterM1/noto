import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { allHistory, calibration, previewNext } from '../lib/adaptive'
import { dueLabel } from '../lib/srs'
import { folderName } from '../lib/tree'
import { NoteBlocks } from '../components/NoteBlocks'
import type { Grade } from '../lib/types'
import s from './Review.module.css'

/*
 * Reviewing — one note, opened from the Review list.
 *
 * It is the real note, never a flashcard: no blur, no reveal step, no deck
 * ghosts, no progress ticks. You read what you actually wrote, then say how
 * well it came back. Rating writes SRS and returns to the list.
 */

const GRADES: { g: Grade; label: string; color: string }[] = [
  { g: 1, label: 'Again', color: 'var(--g1)' },
  { g: 2, label: 'Hard', color: 'var(--g2)' },
  { g: 3, label: 'Good', color: 'var(--ink)' },
  { g: 4, label: 'Easy', color: 'var(--g4)' },
]

export function Review() {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const folders = useData((d) => d.folders)
  const grade = useData((d) => d.grade)
  const reviewId = useUI((u) => u.reviewId)
  const endReview = useUI((u) => u.endReview)
  const openNote = useUI((u) => u.openNote)
  const setThread = useUI((u) => u.setThread)

  const note = notes.find((n) => n.id === reviewId) ?? null
  const st = reviewId ? srs[reviewId] : null
  if (!note || !st) return null

  const factor = calibration(allHistory(srs)).factor
  const due = st.due <= 0 ? 'due now' : dueLabel(st.due)

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <button type="button" className={s.back} onClick={endReview}>
          ← Review
        </button>
        <span className={s.headSpacer} />
        <span className={s.headMeta}>
          {due} · interval {st.ivl}d
        </span>
      </div>

      <div className={s.scroll}>
        <div className={s.measure}>
        <article className={s.card}>
          <div className={s.cardTop}>
            <span className={s.cardMeta}>
              {folderName(folders, note.folderId)} · interval {st.ivl}d · {st.hist.length} past review
              {st.hist.length === 1 ? '' : 's'}
            </span>
            <button type="button" className={s.openNote} onClick={() => openNote(note.id)}>
              open note ↗
            </button>
          </div>

          <h1 className={s.title}>{note.title}</h1>

          {note.tags?.length ? (
            <div className={s.tags}>
              {note.tags.map((t) => (
                <button type="button" key={t} className={s.tag} onClick={() => setThread(t)}>
                  #{t}
                </button>
              ))}
            </div>
          ) : null}

          {/* The whole note, exactly as written — every block, read-only. */}
          <NoteBlocks note={note} readOnly full />
        </article>
        </div>
      </div>

      <div className={s.footer}>
        <div className={s.footInner}>
          <div className={s.footLabel}>How well did that come back?</div>
          <div className={s.grades}>
            {GRADES.map((gr, i) => (
              <button
                key={gr.g}
                type="button"
                className={s.grade}
                style={{ color: gr.color, borderColor: gr.color }}
                onClick={() => grade(gr.g)}
              >
                <span className={s.gradeName}>{gr.label}</span>
                <span className={s.gradeHint}>
                  {previewNext(st, gr.g, factor)} · {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
