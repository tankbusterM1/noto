import { Fragment } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueNotes, dueLabel } from '../lib/srs'
import { forecastDays, inkSits, yearGrid } from '../lib/horizon'
import { folderName } from '../lib/tree'
import { addDays } from '../lib/dates'
import type { Note, SrsState } from '../lib/types'
import s from './Queue.module.css'

/*
 * Review — the list IS the interaction.
 *
 * There is no session: you read the state of your memory, then open one note.
 * Rating it brings you back here. Nothing on this screen starts a queue.
 */

const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** The statement, assembled word by word. */
function Statement({ text }: { text: string }) {
  return (
    <h1 className={s.statement}>
      {/* The space must sit OUTSIDE the inline-block: a trailing space inside
          one collapses at the edge of the box and the words run together. */}
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className={s.word} style={{ animationDelay: `${140 + i * 105}ms` }}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
    </h1>
  )
}

/** A hairline that draws itself in, left to right. */
function Rule({ delay = 0 }: { delay?: number }) {
  return <div className={s.rule} style={{ animationDelay: `${delay}ms` }} />
}

export function Queue() {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const ledgerByDay = useData((d) => d.ledgerByDay)
  const folders = useData((d) => d.folders)
  const startReview = useUI((u) => u.startReview)

  const due = dueNotes(notes, srs)
  const inReview = notes.filter((n) => srs[n.id]).length
  const shares = inkSits(notes, srs)
  const forecast = forecastDays(notes, srs, 14)
  const maxF = Math.max(1, ...forecast)
  const cells = yearGrid(ledgerByDay, 26)
  const nextWeek = forecast.slice(0, 7).reduce((a, b) => a + b, 0)

  const statement = due.length
    ? `${due.length} of ${inReview} notes want attention today.`
    : 'Every note is dark and settled.'

  // Grouped tails: what surfaces after today.
  const upcoming = notes
    .map((n) => ({ n, st: srs[n.id] }))
    .filter((x): x is { n: Note; st: SrsState } => !!x.st && x.st.due > 0)
    .sort((a, b) => a.st.due - b.st.due)
  const soon = upcoming.filter((x) => x.st.due <= 7)
  const later = upcoming.filter((x) => x.st.due > 7)

  // Amber is "due now" and nothing else — the later bands step down through ink.
  const shareFill = (key: string) =>
    key === 'overdue'
      ? { background: 'var(--am)' }
      : key === 'today'
        ? { background: 'var(--am)', opacity: 0.5 }
        : key === 'soon'
          ? { background: 'var(--ink2)' }
          : { background: 'var(--ink3)', opacity: 0.45 }

  return (
    <div className={s.page}>
      <div className={s.eyebrow}>State of your memory</div>
      <Statement text={statement} />
      <div className={s.waiting}>{due.length ? `${due.length} waiting below` : 'nothing waiting'}</div>

      <Rule delay={140} />

      <div className={s.cols}>
        <section>
          <div className={s.sectionLabel}>How the ink sits</div>
          <div className={s.shares}>
            {shares.map((row, i) => (
              <div key={row.key} className={s.shareRow}>
                <span className={s.shareLabel}>{row.label}</span>
                <span className={s.track}>
                  <span
                    className={s.fill}
                    style={{
                      ...shareFill(row.key),
                      width: `${row.share * 100}%`,
                      animationDelay: `${260 + i * 90}ms`,
                    }}
                  />
                </span>
                <span className={s.shareCount}>{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className={s.sectionLabel}>Next fourteen days</div>
          <div className={s.bars}>
            {forecast.map((c, i) => (
              <span key={i} className={s.barCol} title={`${c} note${c === 1 ? '' : 's'}`}>
                <span
                  className={s.bar}
                  style={{
                    height: `${c === 0 ? 3 : 6 + Math.round((44 * c) / maxF)}px`,
                    background: i === 0 && c > 0 ? 'var(--am)' : c === 0 ? 'var(--sf2)' : 'var(--ink3)',
                    animationDelay: `${300 + i * 55}ms`,
                  }}
                />
                <span className={s.barDay}>{i === 0 ? '·' : dayLetters[addDays(i).getDay()]}</span>
              </span>
            ))}
          </div>
          <div className={s.barNote}>
            {nextWeek} note{nextWeek === 1 ? '' : 's'} surface in the next week
          </div>
        </section>
      </div>

      <Rule delay={280} />

      <section className={s.year}>
        <div className={s.sectionLabel}>Year in ink</div>
        <div className={s.grid}>
          {cells.map((c) => (
            <span
              key={c.day}
              className={s.cell}
              title={c.count ? `${c.count} reviewed` : 'nothing'}
              style={{
                gridColumn: c.col + 1,
                gridRow: c.row + 1,
                background:
                  c.level === 0
                    ? 'var(--sf2)'
                    : `color-mix(in srgb, var(--ink2) ${c.level === 1 ? 30 : c.level === 2 ? 60 : 100}%, var(--sf2))`,
                // Diagonal cascade — the wave crosses the grid, not the rows.
                animationDelay: `${(c.col + c.row) * 9}ms`,
              }}
            />
          ))}
        </div>
        <div className={s.legend}>
          <span>less</span>
          <span className={s.legendCell} style={{ background: 'var(--sf2)' }} />
          <span className={s.legendCell} style={{ background: 'var(--ink2)', opacity: 0.3 }} />
          <span className={s.legendCell} style={{ background: 'var(--ink2)', opacity: 0.6 }} />
          <span className={s.legendCell} style={{ background: 'var(--ink2)' }} />
          <span>more</span>
          <span className={s.legendToday}>◆ today</span>
        </div>
      </section>

      <Rule delay={420} />

      <section>
        <div className={s.sectionLabel}>Due now</div>
        {due.length === 0 ? (
          <div className={s.empty}>
            <span className={s.stamp}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4,13 9.5,18 20,6" className={s.stampCheck} />
              </svg>
            </span>
            <div className={s.emptyLine}>All caught up. Your ink is dark.</div>
          </div>
        ) : (
          <div className={s.dueList}>
            {due.map((n, i) => {
              const st = srs[n.id]
              return (
                <button type="button" key={n.id} className={s.dueRow} onClick={() => startReview(n.id)}>
                  <span className={s.num}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={s.dueMain}>
                    <span className={s.dueTitle}>{n.title}</span>
                    <span className={s.dueMeta}>
                      {folderName(folders, n.folderId)} · interval {st.ivl}d · ease {st.ease.toFixed(2)}
                    </span>
                  </span>
                  <span className={s.dueWhen}>{st.due < 0 ? `${-st.due}d overdue` : 'due today'}</span>
                  <span className={s.readRate}>read &amp; rate →</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {(soon.length > 0 || later.length > 0) && <Rule delay={520} />}

      <div className={s.tails}>
        {soon.length > 0 && (
          <section>
            <div className={s.sectionLabel}>Next 7 days</div>
            <div className={s.tailList}>
              {soon.map(({ n, st }) => (
                <button type="button" key={n.id} className={s.tailRow} onClick={() => startReview(n.id)}>
                  <span className={s.tailTitle}>{n.title}</span>
                  <span className={s.tailWhen}>{dueLabel(st.due)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {later.length > 0 && (
          <section>
            <div className={s.sectionLabel}>Later</div>
            <div className={s.tailList}>
              {later.map(({ n, st }) => (
                <button type="button" key={n.id} className={s.tailRow} onClick={() => startReview(n.id)}>
                  <span className={s.tailTitle}>{n.title}</span>
                  <span className={s.tailWhen}>{dueLabel(st.due)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
