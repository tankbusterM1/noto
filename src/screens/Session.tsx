import type { CSSProperties } from 'react'
import { useData } from '../store/data'
import { dueNotes } from '../lib/srs'
import { allHistory, calibration, previewNext, recallNow } from '../lib/adaptive'
import { folderName } from '../lib/tree'
import { MONO, SERIF } from '../lib/ui'
import { NoteBlocks } from '../components/NoteBlocks'
import { CloseIcon } from '../components/icons'
import type { Grade } from '../lib/types'

const GRADES: { g: Grade; label: string; cls: string; color: string }[] = [
  { g: 1, label: 'Again', cls: 'grade-g1', color: 'var(--g1)' },
  { g: 2, label: 'Hard', cls: 'grade-g2', color: 'var(--g2)' },
  { g: 3, label: 'Good', cls: 'grade-g3', color: 'var(--ac)' },
  { g: 4, label: 'Easy', cls: 'grade-g4', color: 'var(--g4)' },
]

/**
 * Whole-note review — NOT flashcards. The full note is shown; you read it and
 * grade how well you remembered it (1-4). No blur / reveal gate.
 */
export function Session() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const session = useData((s) => s.session)
  const grade = useData((s) => s.grade)
  const endSession = useData((s) => s.endSession)
  const folders = useData((s) => s.folders)

  if (!session) return null
  const { queue, idx, log } = session
  const total = queue.length
  const done = idx >= total
  const curId = done ? null : queue[idx]
  const cur = curId ? notes.find((n) => n.id === curId) ?? null : null
  const cSrs = curId ? srs[curId] : null
  const pct = Math.round((100 * idx) / total)
  // Personal calibration for the grade-button interval hints (adaptive model).
  const factor = calibration(allHistory(srs)).factor
  const recall = cSrs ? recallNow(cSrs) : null

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', animation: 'fadein 0.3s ease both' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 28px', borderBottom: '1px solid var(--ln)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 20 }}>
        <div className="crumb" onClick={endSession} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CloseIcon />
          End session
        </div>
        <div style={{ flex: 1, height: 3, background: 'var(--sf2)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--ac)', borderRadius: 99, transition: 'width 0.4s cubic-bezier(0.65,0,0.35,1)', width: `${pct}%` }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink2)' }}>
          {Math.min(idx + 1, total)} / {total}
        </div>
      </div>

      {cur && cSrs ? (
        <>
          <div style={{ flex: 1, padding: '40px 48px 60px' }}>
            <div key={idx} style={{ maxWidth: 680, margin: '0 auto', animation: 'rise 0.4s cubic-bezier(0.3,0.7,0.3,1) both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', background: 'var(--sf2)', borderRadius: 999, padding: '4px 10px' }}>
                  {folderName(folders, cur.folderId)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
                  interval {cSrs.ivl}d · {cSrs.hist.length} past reviews
                  {recall !== null ? ` · recall ~${Math.round(recall * 100)}%` : ''}
                </span>
              </div>
              <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, letterSpacing: '-0.015em', margin: '0 0 22px', lineHeight: 1.15 }}>{cur.title}</h1>
              <NoteBlocks note={cur} readOnly />
            </div>
          </div>

          {/* grade bar */}
          <div style={{ position: 'sticky', bottom: 0, borderTop: '1px solid var(--ln)', background: 'var(--bg)', padding: '16px 48px 20px', zIndex: 20 }}>
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'center', marginBottom: 11 }}>
                How well did you remember this? · keys 1–4
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {GRADES.map((gr) => (
                  <button
                    key={gr.g}
                    className={`grade ${gr.cls}`}
                    onClick={() => grade(gr.g)}
                    style={{ border: `1px solid ${gr.color}`, background: 'transparent', color: gr.color, borderRadius: 12, padding: '11px 8px 9px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 } as CSSProperties}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{gr.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.75 }}>{previewNext(cSrs, gr.g, factor)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <Completion notes={notes} srs={srs} log={log} onExit={endSession} />
      )}
    </div>
  )
}

function Completion({
  notes,
  srs,
  log,
  onExit,
}: {
  notes: ReturnType<typeof useData.getState>['notes']
  srs: ReturnType<typeof useData.getState>['srs']
  log: Grade[]
  onExit: () => void
}) {
  const nextDue = dueNotes(notes, srs).length
  const tally = (k: Grade) => log.filter((g) => g === k).length
  const summary = `${log.length} reviews · ${nextDue === 0 ? 'queue is clear — next batch tomorrow' : nextDue + ' still due'}`

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 420, animation: 'rise 0.5s ease both' }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 18px', background: 'var(--ac)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, animation: 'stamp 0.5s cubic-bezier(0.3,0.7,0.4,1.1) both' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acI)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(-45deg)' }}>
            <polyline points="4,13 9.5,18 20,6" />
          </svg>
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, margin: 0 }}>Session complete.</h2>
        <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.6 }}>{summary}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, margin: '22px 0', fontFamily: MONO, fontSize: 11 }}>
          <span style={{ color: 'var(--g1)' }}>{tally(1)} again</span>
          <span style={{ color: 'var(--g2)' }}>{tally(2)} hard</span>
          <span style={{ color: 'var(--ac)' }}>{tally(3)} good</span>
          <span style={{ color: 'var(--g4)' }}>{tally(4)} easy</span>
        </div>
        <button className="btn-dark" onClick={onExit} style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to queue
        </button>
      </div>
    </div>
  )
}
