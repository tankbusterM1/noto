import type { CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import {
  dueNotes,
  forecastCounts,
  memoryBands,
  dueLabel,
  gradeName,
  gradeColor,
  inkOpacity,
  reviewTotal,
  longestReviewStreak,
} from '../lib/srs'
import { recallNow } from '../lib/adaptive'
import { folderPath } from '../lib/tree'
import { addDays, fmtShort, todayEpochDay, dateFromEpochDay } from '../lib/dates'
import { MONO, SERIF, kicker, rise } from '../lib/ui'
import { useMounted } from '../lib/useMounted'
import type { Note } from '../lib/types'

const microLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}
const sectionLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
  marginBottom: 10,
}
const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function Queue() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const doneToday = useData((s) => s.doneToday)
  const ledgerByDay = useData((s) => s.ledgerByDay)
  const journal = useData((s) => s.journal)
  const startSession = useData((s) => s.startSession)
  const inkFade = useUI((s) => s.inkFade)
  const openNote = useUI((s) => s.openNote)
  const mounted = useMounted()

  const due = dueNotes(notes, srs)
  const dueCount = due.length
  const inReview = notes.filter((n) => srs[n.id]).length
  const bands = memoryBands(notes, srs)

  const counts = forecastCounts(notes, srs)
  const maxC = Math.max(1, ...counts)
  const forecast = counts.map((c, i) => ({
    d: i === 0 ? 'now' : dayLetters[addDays(i).getDay()],
    h: 5 + Math.round((26 * c) / maxC),
    op: c === 0 ? 0.22 : 0.45 + (0.55 * c) / maxC,
  }))

  // Year-in-ink heatmap — real reviews per day from the SRS ledger.
  const now = new Date()
  const today = todayEpochDay()
  const inkDow = (now.getDay() + 6) % 7 // today's column position (0=Mon … 6=Sun)
  const ramp = [0, 0.3, 0.55, 0.8, 1]
  const weeks: { tip: string; bg: string; opacity?: number }[][] = []
  for (let w = 0; w < 26; w++) {
    const days: { tip: string; bg: string; opacity?: number }[] = []
    for (let d = 0; d < 7; d++) {
      const daysAgo = (25 - w) * 7 + (inkDow - d)
      const isFuture = daysAgo < 0
      const epochDay = today - daysAgo
      const isToday = daysAgo === 0
      const cnt = isFuture ? 0 : ledgerByDay[epochDay] ?? 0
      const lvl = cnt === 0 ? 0 : cnt <= 1 ? 1 : cnt <= 3 ? 2 : cnt <= 6 ? 3 : 4
      days.push({
        tip: isFuture
          ? ''
          : `${cnt} ${cnt === 1 ? 'review' : 'reviews'} · ${isToday ? 'today' : fmtShort(dateFromEpochDay(epochDay))}`,
        bg: isToday ? 'var(--am)' : isFuture || lvl === 0 ? 'var(--sf2)' : 'var(--ac)',
        opacity: !isToday && !isFuture && lvl > 0 ? ramp[lvl] : undefined,
      })
    }
    weeks.push(days)
  }
  const inkTotalLabel = reviewTotal(ledgerByDay).toLocaleString('en-US')
  const inkStreak = longestReviewStreak(ledgerByDay)

  // ── Growth rings — the vault as a tree cross-section ────────────────
  // One ring per month (oldest at the core); a ring thickens with that
  // month's activity: reviews + notes written + journal entries. Years of
  // studying literally accrete like wood.
  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const rings: { label: string; reviews: number; created: number; journal: number }[] = []
  const ringIndex = new Map<number, number>()
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
    ringIndex.set(monthKey(d), rings.length)
    rings.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      reviews: 0,
      created: 0,
      journal: 0,
    })
  }
  for (const [day, cnt] of Object.entries(ledgerByDay)) {
    const i = ringIndex.get(monthKey(dateFromEpochDay(Number(day))))
    if (i !== undefined) rings[i].reviews += cnt
  }
  for (const n of notes) {
    const i = ringIndex.get(monthKey(dateFromEpochDay(today + n.created)))
    if (i !== undefined) rings[i].created++
  }
  for (const e of journal) {
    const i = ringIndex.get(monthKey(dateFromEpochDay(today + e.off)))
    if (i !== undefined) rings[i].journal++
  }
  const ringTotals = rings.map((r) => r.reviews + r.created * 2 + r.journal)
  const ringMax = Math.max(1, ...ringTotals)
  const activeMonths = ringTotals.filter((t) => t > 0).length

  // Practice ahead: the FSRS model's weakest memories that aren't due yet —
  // lowest predicted recall first. Early reviews are legitimate in FSRS (the
  // update sees the true elapsed time), so this only strengthens the schedule.
  const weakest = notes
    .filter((n) => srs[n.id] && srs[n.id].due > 0)
    .map((n) => ({ n, r: recallNow(srs[n.id]) ?? 1 }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 5)
  const weakestAvg = weakest.length
    ? Math.round((100 * weakest.reduce((s, x) => s + x.r, 0)) / weakest.length)
    : 100

  const upcoming = notes
    .filter((n) => srs[n.id] && srs[n.id].due > 0)
    .sort((a, b) => srs[a.id].due - srs[b.id].due)
  const groups = [
    { label: 'Tomorrow', rows: upcoming.filter((n) => srs[n.id].due === 1) },
    { label: 'This week', rows: upcoming.filter((n) => srs[n.id].due >= 2 && srs[n.id].due <= 7) },
    { label: 'Later', rows: upcoming.filter((n) => srs[n.id].due > 7) },
  ].filter((g) => g.rows.length)

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={kicker}>Memory · spaced review</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Review</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {weakest.length > 0 && (
            <button
              className="border-hover"
              onClick={() => startSession(weakest.map((x) => x.n.id))}
              title={`Extra practice — the ${weakest.length} notes the memory model predicts you're closest to forgetting (avg recall ~${weakestAvg}%)`}
              style={{ background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--ln)', borderRadius: 10, padding: '10px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ◇ Practice weakest ink · ~{weakestAvg}%
            </button>
          )}
          {dueCount > 0 && (
            <button
              className="btn-accent"
              onClick={() => startSession()}
              style={{ background: 'var(--ac)', color: 'var(--acI)', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Start session · {dueCount} due →
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 26, fontFamily: SERIF, fontStyle: 'italic' }}>
        Ink fades as memory does — review a note to re-ink it.
      </div>

      {/* Memory-health band + forecast */}
      <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 22px', marginBottom: 28, display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ flex: 1.7, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 11 }}>
            <span style={microLabel}>memory health</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
              {doneToday} reviewed today · {inReview} in rotation
            </span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, transformOrigin: 'left', animation: 'growx 0.7s cubic-bezier(0.65,0,0.35,1) both' }}>
            {bands.map((b) => (
              <div key={b.name} title={b.name} style={{ height: '100%', transition: 'flex-grow 0.5s cubic-bezier(0.65,0,0.35,1)', background: b.color, flexGrow: b.n, flexBasis: '0%' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 11, flexWrap: 'wrap' }}>
            {bands.map((b) => (
              <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: b.color }} />
                {b.name} · {b.n}
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--ln)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={microLabel}>next 7 days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 38, marginTop: 9 }}>
            {forecast.map((f, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: '100%', maxWidth: 18, borderRadius: 3, background: 'var(--ac)', transition: 'height 0.5s cubic-bezier(0.65,0,0.35,1), opacity 0.5s ease', opacity: f.op, height: mounted ? f.h : 3 }} />
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--ink3)' }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Year-in-ink heatmap */}
      <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 22px', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13, flexWrap: 'wrap', gap: 6 }}>
          <span style={microLabel}>year in ink · last 26 weeks</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{inkTotalLabel} reviews inked · longest streak {inkStreak}d</span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {weeks.map((days, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3, animation: 'fadein 0.45s ease both', animationDelay: `${wi * 0.018}s` }}>
              {days.map((c, di) => (
                <div key={di} title={c.tip} style={{ width: 9, height: 9, borderRadius: 2.5, background: c.bg, opacity: c.opacity }} />
              ))}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--ink3)', marginRight: 3 }}>less</span>
              <div style={{ width: 9, height: 9, borderRadius: 2.5, background: 'var(--sf2)' }} />
              <div style={{ width: 9, height: 9, borderRadius: 2.5, background: 'var(--ac)', opacity: 0.3 }} />
              <div style={{ width: 9, height: 9, borderRadius: 2.5, background: 'var(--ac)', opacity: 0.55 }} />
              <div style={{ width: 9, height: 9, borderRadius: 2.5, background: 'var(--ac)', opacity: 0.8 }} />
              <div style={{ width: 9, height: 9, borderRadius: 2.5, background: 'var(--ac)' }} />
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--ink3)', marginLeft: 3 }}>more</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'var(--am)', textAlign: 'right' }}>today burns amber ◆</div>
          </div>
        </div>
      </div>

      {/* Growth rings */}
      <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, padding: '18px 22px', marginBottom: 28, display: 'flex', gap: 26, alignItems: 'center' }}>
        <svg viewBox="0 0 170 170" style={{ width: 168, flexShrink: 0 }}>
          {/* the seed */}
          <circle cx="85" cy="85" r="2.6" fill="var(--am)" />
          {rings.map((r, i) => {
            const t = ringTotals[i]
            const share = t / ringMax
            const isNow = i === rings.length - 1
            return (
              <circle
                key={i}
                cx="85"
                cy="85"
                r={13 + i * 6}
                fill="none"
                stroke={isNow && t > 0 ? 'var(--am)' : 'var(--ac)'}
                strokeWidth={t === 0 ? 0.5 : 1.4 + 4.2 * share}
                opacity={t === 0 ? 0.08 : 0.28 + 0.72 * share}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'ringgrow 0.7s cubic-bezier(0.3,0.7,0.3,1) both', animationDelay: `${0.1 + i * 0.055}s` }}
              >
                <title>{`${r.label} · ${r.reviews} reviews · ${r.created} notes · ${r.journal} journal entries`}</title>
              </circle>
            )
          })}
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={microLabel}>growth rings · last 12 months</div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15.5, color: 'var(--ink2)', lineHeight: 1.55, margin: '10px 0 12px' }}>
            Your vault, grown like wood — each ring a month, thick rings the heavy seasons. Come back in a year and read the tree.
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', lineHeight: 1.9 }}>
            this month · {rings[11].reviews} review{rings[11].reviews === 1 ? '' : 's'} · {rings[11].created} note{rings[11].created === 1 ? '' : 's'} · {rings[11].journal} journal entr{rings[11].journal === 1 ? 'y' : 'ies'}
            <br />
            {activeMonths} of 12 months carry ink · hover a ring for its story
          </div>
        </div>
      </div>

      {/* Due list */}
      <div style={sectionLabel}>Due · {dueCount}</div>
      <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
        {due.map((n, i) => (
          <DueRow key={n.id} note={n} index={i} inkFade={inkFade} onOpen={() => openNote(n.id)} />
        ))}
        {dueCount === 0 && (
          <div style={{ padding: '28px 18px', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: 'var(--ink2)' }}>
            All caught up — nothing due. Your ink is dark.
          </div>
        )}
      </div>

      {/* Upcoming */}
      <div style={sectionLabel}>Upcoming</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 7px' }}>
              <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500 }}>{g.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{g.rows.length}</span>
            </div>
            <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, overflow: 'hidden' }}>
              {g.rows.map((n) => (
                <div key={n.id} className="tint" onClick={() => openNote(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 16px', borderBottom: '1px solid var(--ln)', cursor: 'pointer' }}>
                  <div style={{ width: 7, height: 7, border: '1.5px solid var(--ink3)', transform: 'rotate(45deg)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: SERIF, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{fmtShort(addDays(srs[n.id].due))}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--ink2)', width: 64, textAlign: 'right' }}>{dueLabel(srs[n.id].due)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DueRow({ note, index, inkFade, onOpen }: { note: Note; index: number; inkFade: boolean; onOpen: () => void }) {
  const folders = useData((s) => s.folders)
  const sr = useData((s) => s.srs[note.id])
  const ink = inkOpacity(sr, inkFade)
  const trail = sr.hist.slice(-3)
  return (
    <div className="tint ink-card" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--ln)', cursor: 'pointer', ...rise(index, 0.35) }}>
      <div style={{ width: 8, height: 8, background: 'var(--am)', transform: 'rotate(45deg)', flexShrink: 0, opacity: ink }} />
      <div className="ink-body" style={{ flex: 1, minWidth: 0, opacity: ink }}>
        <div style={{ fontFamily: SERIF, fontSize: 16.5, fontWeight: 500 }}>{note.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
            {folderPath(folders, note.folderId)} · ivl {sr.ivl}d · ease {sr.ease.toFixed(2)}
          </span>
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {trail.map((h, i) => (
              <span key={i} title={gradeName(h.g)} style={{ width: 7, height: 7, borderRadius: 99, background: gradeColor(h.g) }} />
            ))}
          </span>
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: sr.due < 0 ? 'var(--g1)' : 'var(--am)' }}>{dueLabel(sr.due)}</span>
    </div>
  )
}
