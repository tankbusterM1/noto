import { Fragment, useEffect, useRef, useState } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueNotes } from '../lib/srs'
import { forecastDays } from '../lib/horizon'
import { PROMPTS } from '../lib/constants'
import { addDays, todayEpochDay } from '../lib/dates'
import { fmtMins, journalStreak, snippet } from '../lib/format'
import { PlayTriangle } from '../components/icons'
import s from './Today.module.css'

/*
 * Today — the informative home.
 *
 * Everything here is a reading of where you actually are: how far through the
 * day, how much ink is fading, what you touched last. Amber appears twice, and
 * both times it means "now": the day-arc dot and the memory horizon.
 */

const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Ramp 0 → value on a cubic ease-out, once, on mount. */
function useCountUp(value: number, ms = 1500): number {
  const [n, setN] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(value * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, ms])
  return n
}

function Stat({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value)
  return (
    <div className={s.stat}>
      <div className={s.statValue}>{n}</div>
      <div className={s.statLabel}>{label}</div>
    </div>
  )
}

function Words({ text, from = 140, gap = 130 }: { text: string; from?: number; gap?: number }) {
  return (
    <>
      {/* The space must sit OUTSIDE the inline-block: a trailing space inside
          one collapses at the edge of the box and the words run together. */}
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className={s.word} style={{ animationDelay: `${from + i * gap}ms` }}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
    </>
  )
}

function Rule({ delay = 0 }: { delay?: number }) {
  return <div className={s.rule} style={{ animationDelay: `${delay}ms` }} />
}

/**
 * The memory horizon — seven days of fading ink, as one drawn curve.
 * 240×66, amber stroke over a 17% amber fill, a dot per day.
 */
function Horizon({ counts }: { counts: number[] }) {
  const W = 240
  const H = 66
  const max = Math.max(1, ...counts)
  const pts = counts.map((c, i) => {
    const x = (i / (counts.length - 1)) * (W - 12) + 6
    const y = H - 16 - (c / max) * (H - 30)
    return { x, y, c }
  })
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${pts[0].x},${H - 14} ${line} ${pts[pts.length - 1].x},${H - 14}`

  return (
    <div className={s.horizon}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <polygon points={area} fill="var(--am)" opacity={0.17} />
        <polyline points={line} fill="none" stroke="var(--am)" strokeWidth={2.1} strokeLinejoin="round" strokeLinecap="round" className={s.curve} />
        {pts.map((p, i) =>
          i === 0 ? (
            <circle key={i} cx={p.x} cy={p.y} r={3.4} fill="var(--am)" opacity={p.c === 0 ? 0.3 : 1} />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={2.2} fill="var(--sf)" stroke="var(--am)" strokeWidth={1.4} opacity={p.c === 0 ? 0.3 : 1} />
          ),
        )}
      </svg>
      <div className={s.horizonDays} style={{ width: W }}>
        {counts.map((_, i) => (
          <span key={i}>{i === 0 ? '·' : dayLetters[addDays(i).getDay()]}</span>
        ))}
      </div>
      <div className={s.horizonLabel}>Seven days of fading</div>
    </div>
  )
}

export function Today() {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const todos = useData((d) => d.todos)
  const watch = useData((d) => d.watch)
  const journal = useData((d) => d.journal)
  const ledgerByDay = useData((d) => d.ledgerByDay)
  const setScreen = useUI((u) => u.setScreen)
  const openWatchItem = useUI((u) => u.openWatchItem)
  const openNote = useUI((u) => u.openNote)

  // The clock ticks so the day arc stays honest without a reload.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Day arc: 07:00 → 23:00 is the waking span the dot travels.
  const mins = now.getHours() * 60 + now.getMinutes()
  const arc = Math.max(0, Math.min(1, (mins - 420) / 960))
  const leftMins = Math.max(0, 23 * 60 - mins)
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const due = dueNotes(notes, srs)
  const inReview = notes.filter((n) => srs[n.id]).length
  const counts = forecastDays(notes, srs, 7)
  const today = todayEpochDay()
  const reviewedThisWeek = Array.from({ length: 7 }, (_, k) => ledgerByDay[today - k] ?? 0).reduce((a, b) => a + b, 0)
  const toWatch = watch.filter((w) => !w.done).length

  const recent = notes.slice().sort((a, b) => b.updated - a.updated).slice(0, 3)
  const openTodos = todos.filter((t) => !t.done)
  const doneN = todos.filter((t) => t.done).length
  const streak = journalStreak(journal)
  const jPrompt = PROMPTS[now.getDate() % PROMPTS.length]
  const jWeekDots = [6, 5, 4, 3, 2, 1, 0].map((k) => ({
    filled: journal.some((e) => e.off === -k),
    letter: dayLetters[addDays(-k).getDay()],
  }))
  const nextWatch = watch.filter((w) => !w.done).slice(0, 2)

  return (
    <div className={s.page}>
      <div className={s.dateLine}>{dateLine}</div>
      <h1 className={s.greeting}>
        <Words text={greeting} />
      </h1>

      {/* ── the day arc ─────────────────────────────────────────── */}
      <div className={s.arcWrap}>
        <div className={s.arcTrack} />
        <div className={s.arcFill} style={{ width: `${arc * 100}%` }} />
        <span className={s.arcDot} style={{ left: `${arc * 100}%` }} />
      </div>
      <div className={s.arcLabel}>
        {clock} · {Math.floor(leftMins / 60)}h {leftMins % 60}m of the day left
      </div>

      {/* ── the strip ───────────────────────────────────────────── */}
      <div className={s.stats}>
        <Stat value={notes.length} label="notes" />
        <Stat value={inReview} label="in review" />
        <Stat value={reviewedThisWeek} label="reviewed this week" />
        <Stat value={streak} label="journal streak" />
        <Stat value={toWatch} label="to watch" />
      </div>

      <Rule delay={140} />

      {/* ── review ──────────────────────────────────────────────── */}
      <section className={s.reviewCard}>
        <span className={s.shine} />
        <div className={s.reviewBody}>
          <h2 className={s.reviewHead}>
            <Words text={due.length ? `${due.length} notes are fading.` : 'Every note is dark.'} from={260} gap={110} />
          </h2>
          <p className={s.reviewSub}>
            {due.length
              ? 'Their ink is thinning — read one and it darkens again.'
              : 'Nothing is due. Come back tomorrow, or put another note on the thread.'}
          </p>
          <button type="button" className={s.inkBtn} onClick={() => setScreen('queue')}>
            Go to review →
          </button>
        </div>
        <Horizon counts={counts} />
      </section>

      <Rule delay={280} />

      {/* ── two columns ─────────────────────────────────────────── */}
      <div className={s.cols}>
        <div className={s.col}>
          <section>
            <div className={s.sectionHead}>
              <span className={s.sectionLabel}>Recently edited</span>
              <button type="button" className={s.more} onClick={() => setScreen('notes')}>
                all notes →
              </button>
            </div>
            <div className={s.rows}>
              {recent.map((n) => (
                <button type="button" key={n.id} className={s.row} onClick={() => openNote(n.id)}>
                  <span className={s.rowTitle}>{n.title}</span>
                  <span className={s.rowMeta}>{snippet(n)}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className={s.sectionHead}>
              <span className={s.sectionLabel}>Journal</span>
              <span className={s.streak}>◆ {streak}-day streak</span>
            </div>
            <div className={s.weekDots}>
              {jWeekDots.map((d, i) => (
                <span key={i} className={s.weekDay}>
                  <span className={`${s.dot} ${d.filled ? s.dotOn : ''}`} />
                  <span className={s.weekLetter}>{d.letter}</span>
                </span>
              ))}
            </div>
            <p className={s.prompt}>“{jPrompt}”</p>
            <button type="button" className={s.more} onClick={() => setScreen('journal')}>
              write today's entry →
            </button>
          </section>
        </div>

        <div className={s.col}>
          <section>
            <div className={s.sectionHead}>
              <span className={s.sectionLabel}>Today's list</span>
              <span className={s.rowMeta}>
                {doneN} of {todos.length} done
              </span>
            </div>
            <div className={s.rows}>
              {openTodos.slice(0, 5).map((t) => (
                <button type="button" key={t.id} className={s.row} onClick={() => setScreen('todos')}>
                  <span className={s.rowTitle}>{t.text}</span>
                </button>
              ))}
              {openTodos.length === 0 && <div className={s.rowMeta}>nothing open</div>}
            </div>
            <button type="button" className={s.more} onClick={() => setScreen('todos')}>
              open todos →
            </button>
          </section>

          <section>
            <div className={s.sectionHead}>
              <span className={s.sectionLabel}>Next to watch</span>
              <button type="button" className={s.more} onClick={() => setScreen('watch')}>
                all →
              </button>
            </div>
            <div className={s.rows}>
              {nextWatch.map((w) => (
                <button type="button" key={w.id} className={s.row} onClick={() => openWatchItem(w.id)}>
                  <span className={s.rowTitle}>
                    <PlayTriangle size={9} /> {w.title}
                  </span>
                  <span className={s.rowMeta}>
                    {w.source} · {fmtMins(w.mins)}
                  </span>
                </button>
              ))}
              {nextWatch.length === 0 && <div className={s.rowMeta}>the shelf is clear</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
