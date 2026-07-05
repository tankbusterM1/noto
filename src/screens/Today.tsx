import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { forecastCounts, dueNotes } from '../lib/srs'
import { PROMPTS } from '../lib/constants'
import { addDays } from '../lib/dates'
import { fmtMins } from '../lib/format'
import { MONO, SERIF, kicker } from '../lib/ui'
import { useMounted } from '../lib/useMounted'
import { NoteCard } from '../components/NoteCard'
import { TodoLine } from '../components/TodoLine'
import { PlayTriangle } from '../components/icons'

const label: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}
const linkText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ac)',
  cursor: 'pointer',
}
const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function Today() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const todos = useData((s) => s.todos)
  const watch = useData((s) => s.watch)
  const journal = useData((s) => s.journal)
  const startSession = useData((s) => s.startSession)
  const setScreen = useUI((s) => s.setScreen)
  const openWatchItem = useUI((s) => s.openWatchItem)
  const jSaved = useUI((s) => s.jSaved)
  const mounted = useMounted()

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const due = dueNotes(notes, srs)
  const dueCount = due.length
  const counts = forecastCounts(notes, srs)
  const maxC = Math.max(1, ...counts)
  const forecast = counts.map((c, i) => ({
    d: i === 0 ? 'now' : dayLetters[addDays(i).getDay()],
    h: 8 + Math.round((56 * c) / maxC),
    op: c === 0 ? 0.22 : 0.45 + (0.55 * c) / maxC,
  }))

  const recent = notes.slice().sort((a, b) => b.updated - a.updated).slice(0, 3)
  const doneN = todos.filter((t) => t.done).length
  const tPct = Math.round((100 * doneN) / todos.length)
  const jStreak = '◆ ' + (jSaved ? 7 : 6) + '-day streak'
  const jPrompt = PROMPTS[now.getDate() % PROMPTS.length]
  const jWeekDots = [6, 5, 4, 3, 2, 1, 0].map((k) => ({
    filled: (k === 0 && jSaved) || journal.some((e) => e.off === -k),
    today: k === 0,
  }))
  const watchNext = watch.filter((w) => !w.done && !w.loading).slice(0, 2)

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '44px 48px 120px', animation: 'rise 0.4s ease both' }}>
      <div style={kicker}>{dateLine}</div>
      <h1 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, letterSpacing: '-0.015em', margin: '8px 0 34px', lineHeight: 1.1 }}>
        {greeting}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Review hero */}
          <div style={{ background: 'var(--ac)', color: 'var(--acI)', borderRadius: 20, padding: '26px 28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.72 }}>
                  Memory · spaced review
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, marginTop: 9, lineHeight: 1.15 }}>
                  {dueCount > 0
                    ? `${dueCount}${dueCount === 1 ? ' note is fading.' : ' notes are fading.'}`
                    : 'All ink is dark.'}
                </div>
                <div style={{ fontSize: 13, opacity: 0.78, marginTop: 8, lineHeight: 1.5 }}>
                  {dueCount > 0
                    ? 'Their ink is fading — a short session re-inks them before they slip away.'
                    : 'Nothing due today. Come back tomorrow, or add more notes to review.'}
                </div>
                {dueCount > 0 && (
                  <button
                    className="btn-lift"
                    onClick={() => startSession()}
                    style={{ marginTop: 18, background: 'var(--acI)', color: 'var(--ac)', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Start review session →
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 74, paddingTop: 4, flexShrink: 0 }}>
                {forecast.map((f, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div
                      style={{
                        width: 16,
                        borderRadius: 4,
                        background: 'rgba(250,248,240,0.92)',
                        transition: 'height 0.5s cubic-bezier(0.65,0,0.35,1), opacity 0.5s ease',
                        height: mounted ? f.h : 4,
                        opacity: f.op,
                      }}
                    />
                    <div style={{ fontFamily: MONO, fontSize: 8.5, opacity: 0.62 }}>{f.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recently edited */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 10px' }}>
              <div style={label}>Recently edited</div>
              <div style={linkText} onClick={() => setScreen('notes')}>
                All notes →
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recent.map((n, i) => (
                <NoteCard key={n.id} note={n} variant="recent" index={i} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Today's list */}
          <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={label}>Today's list</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
                {doneN} of {todos.length} done
              </div>
            </div>
            <div style={{ height: 3, background: 'var(--sf2)', borderRadius: 99, margin: '12px 0 6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--am)', borderRadius: 99, transition: 'width 0.45s cubic-bezier(0.65,0,0.35,1)', width: `${tPct}%` }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {todos.map((t) => (
                <TodoLine key={t.id} todo={t} dense />
              ))}
            </div>
            <div style={{ ...linkText, paddingTop: 12 }} onClick={() => setScreen('todos')}>
              Open todos →
            </div>
          </div>

          {/* Journal teaser */}
          <div
            className="border-hover"
            onClick={() => setScreen('journal')}
            style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 20px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={label}>Journal</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--am)' }}>{jStreak}</div>
            </div>
            <div style={{ display: 'flex', gap: 5, margin: '13px 0' }}>
              {jWeekDots.map((d, i) => (
                <div
                  key={i}
                  style={{
                    width: 22,
                    height: 5,
                    borderRadius: 99,
                    background: d.filled ? 'var(--am)' : d.today ? 'transparent' : 'var(--sf2)',
                    border: !d.filled && d.today ? '1px dashed var(--ink3)' : undefined,
                    transition: 'background 0.4s ease',
                  }}
                />
              ))}
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15.5, color: 'var(--ink2)', lineHeight: 1.45 }}>
              "{jPrompt}"
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginTop: 12 }}>Write today's entry →</div>
          </div>

          {/* Up next · watch later */}
          <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={label}>Up next · watch later</div>
              <div style={linkText} onClick={() => setScreen('watch')}>
                All →
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 13 }}>
              {watchNext.map((w) => (
                <div key={w.id} onClick={() => openWatchItem(w.id)} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'rgba(250,248,240,0.95)',
                      background: `linear-gradient(135deg, hsl(${w.hue},30%,62%), hsl(${w.hue + 34},32%,42%))`,
                    }}
                  >
                    <PlayTriangle size={10} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {w.title}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginTop: 3 }}>
                      {w.source} · {fmtMins(w.mins || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
