import { Fragment, useEffect, useRef, useState } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueNotes, srsPill, inkOpacity } from '../lib/srs'
import { forecastDays } from '../lib/horizon'
import { PROMPTS } from '../lib/constants'
import { addDays, todayEpochDay } from '../lib/dates'
import { fmtMins, journalStreak, snippet } from '../lib/format'
import { folderName } from '../lib/tree'
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
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
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
    <div>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{n}</div>
    </div>
  )
}

/** Text assembled word by word. The space sits OUTSIDE the inline-block, or
 *  it collapses at the edge of the box and the words run together. */
function Words({ text, cls = s.word, from = 140, gap = 130 }: { text: string; cls?: string; from?: number; gap?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className={cls} style={{ animationDelay: `${from + i * gap}ms` }}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
    </>
  )
}

/** A section label with its rule drawn underneath it. */
function Head({ label, meta, delay = 0, onClick }: { label: string; meta?: string; delay?: number; onClick?: () => void }) {
  return (
    <div className={s.sectionHead} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={s.headRule} style={{ animationDelay: `${delay}ms` }} />
      <span>{label}</span>
      {meta && <span className={s.headMeta}>{meta}</span>}
    </div>
  )
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
    <div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} aria-hidden>
        <polygon className={s.hzArea} points={area} fill="var(--am)" opacity={0.17} />
        <polyline className={s.curve} points={line} fill="none" stroke="var(--am)" strokeWidth={2.1} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle
            key={i}
            className={s.hzDot}
            cx={p.x}
            cy={p.y}
            r={i === 0 ? 3.4 : 2.2}
            fill={i === 0 ? 'var(--am)' : 'var(--sf)'}
            stroke={i === 0 ? 'none' : 'var(--am)'}
            strokeWidth={1.4}
            opacity={p.c === 0 ? 0.3 : 1}
            style={{ animationDelay: `${900 + i * 90}ms` }}
          />
        ))}
      </svg>
      <div className={s.horizonDays}>
        {counts.map((_, i) => (
          <span key={i} className={i === 0 ? s.horizonToday : undefined} style={{ animationDelay: `${1000 + i * 70}ms` }}>
            {i === 0 ? 'now' : dayLetters[addDays(i).getDay()]}
          </span>
        ))}
      </div>
      <div className={s.horizonLabel}>seven days of fading</div>
    </div>
  )
}

export function Today() {
  const notes = useData((d) => d.notes)
  const srs = useData((d) => d.srs)
  const todos = useData((d) => d.todos)
  const watch = useData((d) => d.watch)
  const journal = useData((d) => d.journal)
  const folders = useData((d) => d.folders)
  const ledgerByDay = useData((d) => d.ledgerByDay)
  const toggleTodo = useData((d) => d.toggleTodo)
  const setScreen = useUI((u) => u.setScreen)
  const openWatchItem = useUI((u) => u.openWatchItem)
  const openNote = useUI((u) => u.openNote)
  const inkFade = useUI((u) => u.inkFade)

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
  const topTodos = todos.slice(0, 4)
  const doneN = todos.filter((t) => t.done).length
  const streak = journalStreak(journal)
  const jPrompt = PROMPTS[now.getDate() % PROMPTS.length]
  const jWeekDots = [6, 5, 4, 3, 2, 1, 0].map((k) => journal.some((e) => e.off === -k))
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
          {due.length > 0 && (
            <button type="button" className={s.inkBtn} onClick={() => setScreen('queue')}>
              Go to review
              <span className={s.btnCount}>{due.length}</span>
            </button>
          )}
        </div>
        <Horizon counts={counts} />
      </section>

      {/* ── two columns ─────────────────────────────────────────── */}
      <div className={s.cols}>
        <div>
          <Head label="Recently edited" delay={300} />
          {recent.map((n, i) => {
            const st = srs[n.id]
            const pill = srsPill(st)
            return (
              <button
                type="button"
                key={n.id}
                className={s.noteRow}
                onClick={() => openNote(n.id)}
                style={{ opacity: Math.max(0.62, inkOpacity(st, inkFade)), animationDelay: `${180 + i * 90}ms` }}
              >
                <div className={s.noteTitle}>{n.title}</div>
                <div className={s.noteSnippet}>{snippet(n)}</div>
                <div className={s.noteMeta}>
                  <span>{folderName(folders, n.folderId)}</span>
                  <span>·</span>
                  <span>{n.updated === today ? 'today' : 'edited'}</span>
                  <span className={s.notePill} style={{ color: pill.color, fontWeight: pill.bold ? 600 : undefined }}>
                    {pill.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className={s.colRight}>
          <div>
            <Head
              label="Today's list"
              meta={`${doneN} of ${todos.length} done`}
              delay={440}
              onClick={() => setScreen('todos')}
            />
            {topTodos.map((t) => (
              <div key={t.id} className={s.todoRow}>
                <button
                  type="button"
                  className={`${s.tick} ${t.done ? s.tickOn : ''}`}
                  onClick={() => toggleTodo(t.id)}
                  aria-label={t.done ? 'Mark as not done' : 'Mark as done'}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--bg)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1.5,5.4 4,7.8 8.5,2.4" className={s.tickPath} strokeDashoffset={t.done ? 0 : 12} />
                  </svg>
                </button>
                <span className={`${s.todoText} ${t.done ? s.todoDone : ''}`}>{t.text}</span>
              </div>
            ))}
            {topTodos.length === 0 && <div className={s.empty}>nothing open</div>}
          </div>

          <div onClick={() => setScreen('journal')} style={{ cursor: 'pointer' }}>
            <div className={s.sectionHead}>
              <div className={s.headRule} style={{ animationDelay: '580ms' }} />
              <span>Journal</span>
              <div className={s.weekDots}>
                {jWeekDots.map((filled, i) => (
                  <span key={i} className={`${s.dot} ${filled ? s.dotOn : ''}`} />
                ))}
              </div>
            </div>
            <p className={s.prompt}>
              <Words text={jPrompt} cls={s.promptWord} from={400} gap={70} />
            </p>
          </div>

          <div>
            <Head label="Up next · watch later" delay={720} onClick={() => setScreen('watch')} />
            {nextWatch.map((w) => (
              <button type="button" key={w.id} className={s.watchRow} onClick={() => openWatchItem(w.id)}>
                <span className={s.watchTile}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                    <polygon points="3,1.6 10.4,6 3,10.4" />
                  </svg>
                </span>
                <span className={s.watchBody}>
                  <span className={s.watchTitle}>{w.title}</span>
                  <span className={s.watchMeta}>
                    {w.source} · {fmtMins(w.mins)}
                  </span>
                </span>
              </button>
            ))}
            {nextWatch.length === 0 && <div className={s.empty}>the shelf is clear</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
