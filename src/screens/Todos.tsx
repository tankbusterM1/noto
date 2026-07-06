import { useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI, type TodoSeg } from '../store/ui'
import { MONTH_EXTRA } from '../lib/constants'
import { addDays, fmtShort } from '../lib/dates'
import { MONO, SERIF, kicker, rise } from '../lib/ui'
import { Checkbox } from '../components/Checkbox'
import { StrikeText } from '../components/StrikeText'
import { TodoLine } from '../components/TodoLine'
import { AddRow } from '../components/AddRow'
import { StarIcon, CloseIcon, PlusIcon } from '../components/icons'

/** Small × shown on task-row hover. */
function DelX({ onClick }: { onClick: () => void }) {
  return (
    <span
      className="hoverdel"
      title="Delete"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{ display: 'flex', alignItems: 'center', color: 'var(--ink3)', cursor: 'pointer', flexShrink: 0 }}
    >
      <CloseIcon size={9} />
    </span>
  )
}

/** Collapse/expand "add a commitment" form (text + day-of-month range). */
function RangedAdd({ onAdd }: { onAdd: (text: string, from: number, to: number) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const submit = () => {
    const f = parseInt(from, 10)
    const t = parseInt(to, 10)
    if (text.trim() && f && t) {
      onAdd(text, f, t)
      setText('')
      setFrom('')
      setTo('')
      setOpen(false)
    }
  }
  if (!open) {
    return (
      <button className="addghost" onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 13, border: 'none', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 8px', borderRadius: 8, textAlign: 'left' }}>
        <PlusIcon size={11} />
        Add a commitment
      </button>
    )
  }
  const num: CSSProperties = { width: 40, border: '1px solid var(--ln)', outline: 'none', background: 'var(--bg)', fontFamily: MONO, fontSize: 12, color: 'var(--ink)', borderRadius: 7, padding: '6px 4px', textAlign: 'center' }
  return (
    <div className="addopen" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 13, background: 'var(--sf2)', border: '1px solid var(--ln)', borderRadius: 10, padding: 11 }}>
      <input value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="What's the commitment?" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit', padding: '2px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>day</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="1" style={num} />
        <span style={{ color: 'var(--ink3)' }}>→</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="14" style={num} />
        <span style={{ flex: 1 }} />
        <button className="press" onClick={submit} style={{ background: 'var(--ac)', color: 'var(--acI)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
      </div>
    </div>
  )
}

const cardTitle: CSSProperties = { fontSize: 14, fontWeight: 600 }
const meta: CSSProperties = { fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }
const card: CSSProperties = { background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, padding: '22px 24px' }
const dowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function Todos() {
  const todos = useData((s) => s.todos)
  const goals = useData((s) => s.goals)
  const week = useData((s) => s.week)
  const rituals = useData((s) => s.rituals)
  const ranged = useData((s) => s.ranged)
  const toggleGoal = useData((s) => s.toggleGoal)
  const toggleWeek = useData((s) => s.toggleWeek)
  const toggleRitual = useData((s) => s.toggleRitual)
  const addTodo = useData((s) => s.addTodo)
  const deleteTodo = useData((s) => s.deleteTodo)
  const addGoal = useData((s) => s.addGoal)
  const deleteGoal = useData((s) => s.deleteGoal)
  const addRitual = useData((s) => s.addRitual)
  const deleteRitual = useData((s) => s.deleteRitual)
  const addWeekItem = useData((s) => s.addWeekItem)
  const deleteWeekItem = useData((s) => s.deleteWeekItem)
  const addRanged = useData((s) => s.addRanged)
  const deleteRanged = useData((s) => s.deleteRanged)
  const tSeg = useUI((s) => s.tSeg)
  const setTSeg = useUI((s) => s.setTSeg)

  const now = new Date()
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const doneN = todos.filter((t) => t.done).length
  const tPct = todos.length ? Math.round((100 * doneN) / todos.length) : 0

  const yy = now.getFullYear()
  const mm = now.getMonth()
  const dnum = now.getDate()
  const monOff = -((now.getDay() + 6) % 7)
  const weekRange = fmtShort(addDays(monOff)) + ' – ' + fmtShort(addDays(monOff + 6))

  const ongoing = ranged.map((r) => {
    const total = r.to - r.from + 1
    const elapsed = Math.min(Math.max(dnum - r.from + 1, 0), total)
    return {
      ...r,
      color: `hsl(${r.hue},34%,52%)`,
      range: fmtShort(new Date(yy, mm, r.from)) + ' – ' + fmtShort(new Date(yy, mm, r.to)),
      pct: Math.round((100 * elapsed) / total),
      dayLine: `day ${elapsed} of ${total}`,
    }
  })

  const seg = (id: TodoSeg, label: string) => (
    <button
      onClick={() => setTSeg(id)}
      style={{
        border: 'none',
        borderRadius: 8,
        padding: '7px 16px',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: tSeg === id ? 'var(--sf2)' : 'transparent',
        color: tSeg === id ? 'var(--ink)' : 'var(--ink2)',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
        <div>
          <div style={kicker}>{dateLine}</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Todos</h1>
        </div>
        <div style={{ display: 'flex', background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 11, padding: 4, gap: 3 }}>
          {seg('today', 'Today')}
          {seg('week', 'This week')}
          {seg('month', 'Month')}
        </div>
      </div>

      {tSeg === 'today' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22, alignItems: 'start' }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={cardTitle}>Today</div>
              <div style={meta}>{doneN} of {todos.length} done</div>
            </div>
            <div style={{ height: 3, background: 'var(--sf2)', borderRadius: 99, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--am)', borderRadius: 99, transition: 'width 0.45s cubic-bezier(0.65,0,0.35,1)', width: `${tPct}%` }} />
            </div>
            {todos.map((t) => (
              <TodoLine key={t.id} todo={t} onDelete={() => deleteTodo(t.id)} />
            ))}
            <div style={{ marginTop: 6 }}>
              <AddRow placeholder="Add a task — use #tag" onAdd={addTodo} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* Goals this week */}
            <div style={card}>
              <div style={{ ...cardTitle, marginBottom: 4 }}>Goals this week</div>
              <div style={{ ...meta, marginBottom: 10 }}>{weekRange}</div>
              {goals.map((g) => (
                <div key={g.id} className="hoverrow" onClick={() => toggleGoal(g.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', cursor: 'pointer', borderBottom: '1px solid var(--ln)' }}>
                  <Checkbox done={g.done} shape="round" size={18} borderColor="var(--am)" doneColor="var(--am)" />
                  <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4, transition: 'color 0.35s ease', color: g.done ? 'var(--ink3)' : undefined }}>
                    <StrikeText text={g.text} done={g.done} />
                  </span>
                  <DelX onClick={() => deleteGoal(g.id)} />
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                <AddRow placeholder="Add a goal" onAdd={addGoal} />
              </div>
            </div>

            {/* Rituals */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <StarIcon style={{ color: 'var(--am)' }} />
                <span style={cardTitle}>Rituals</span>
                <span style={meta}>· every day, forever</span>
              </div>
              {rituals.map((r) => (
                <div key={r.id} className="hoverrow" onClick={() => toggleRitual(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', cursor: 'pointer', borderBottom: '1px solid var(--ln)' }}>
                  <Checkbox done={r.done} shape="round" size={18} borderColor="var(--ink3)" doneColor="var(--am)" />
                  <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4, transition: 'color 0.35s ease', color: r.done ? 'var(--ink3)' : undefined }}>{r.text}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--am)' }}>◆ {(r.done ? r.streak + 1 : r.streak)}d</span>
                  <DelX onClick={() => deleteRitual(r.id)} />
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                <AddRow placeholder="Add a ritual" onAdd={addRitual} />
              </div>
            </div>

            {/* Ongoing */}
            <div style={card}>
              <div style={{ ...cardTitle, marginBottom: 2 }}>Ongoing</div>
              <div style={{ ...meta, marginBottom: 13 }}>date-to-date commitments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {ongoing.map((r) => (
                  <div key={r.id} className="hoverrow">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{r.text}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', flexShrink: 0 }}>{r.range}</span>
                      <DelX onClick={() => deleteRanged(r.id)} />
                    </div>
                    <div style={{ height: 4, background: 'var(--sf2)', borderRadius: 99, marginTop: 7, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.65,0,0.35,1)', background: r.color, width: `${r.pct}%` }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink3)', marginTop: 4 }}>{r.dayLine}</div>
                  </div>
                ))}
              </div>
              <RangedAdd onAdd={addRanged} />
            </div>
          </div>
        </div>
      )}

      {tSeg === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 10 }}>
          {dowNames.map((name, i) => {
            const d = addDays(monOff + i)
            const isToday = monOff + i === 0
            const items = week.filter((w) => w.day === i)
            return (
              <div
                key={i}
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--ln)',
                  borderRadius: 14,
                  padding: '13px 12px',
                  minHeight: 210,
                  boxShadow: isToday ? '0 0 0 1px var(--am)' : undefined,
                  borderColor: isToday ? 'var(--am)' : undefined,
                  ...rise(i),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>{name}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: isToday ? 'var(--am)' : undefined }}>{d.getDate()}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {items.map((t) => (
                    <div key={t.id} className="hoverrow" onClick={() => toggleWeek(t.id)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <div style={{ marginTop: 1 }}>
                        <Checkbox done={t.done} size={13} radius={4.5} checkSize={8} checkStroke={2.4} doneColor="var(--ac)" />
                      </div>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.4, transition: 'color 0.35s ease', color: t.done ? 'var(--ink3)' : undefined }}>
                        <StrikeText text={t.text} done={t.done} thickness={1.2} />
                      </span>
                      <DelX onClick={() => deleteWeekItem(t.id)} />
                    </div>
                  ))}
                  <AddRow placeholder="Add" onAdd={(v) => addWeekItem(i, v)} dense />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tSeg === 'month' && <MonthView />}
    </div>
  )
}

function MonthView() {
  const week = useData((s) => s.week)
  const ranged = useData((s) => s.ranged)

  const now = new Date()
  const yy = now.getFullYear()
  const mm = now.getMonth()
  const dnum = now.getDate()
  const dim = new Date(yy, mm + 1, 0).getDate()
  const lead = (new Date(yy, mm, 1).getDay() + 6) % 7
  const monOff = -((now.getDay() + 6) % 7)

  const dayItems: Record<number, { text: string; done: boolean }[]> = {}
  week.forEach((w) => {
    const d = addDays(monOff + w.day)
    if (d.getMonth() === mm) {
      const k = d.getDate()
      ;(dayItems[k] = dayItems[k] || []).push({ text: w.text, done: w.done })
    }
  })
  Object.entries(MONTH_EXTRA).forEach(([k, text]) => {
    const kk = Number(k)
    ;(dayItems[kk] = dayItems[kk] || []).push({ text, done: false })
  })

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const ongoing = ranged.map((r) => ({ ...r, color: `hsl(${r.hue},34%,52%)` }))

  const cells: (
    | { empty: true; key: string; delay: number }
    | { empty: false; key: string; num: number; isToday: boolean; bars: { name: string; color: string; radius: string }[]; items: { text: string; done: boolean }[]; delay: number }
  )[] = []
  for (let i = 0; i < lead; i++) cells.push({ empty: true, key: `lead${i}`, delay: i * 0.012 })
  for (let d = 1; d <= dim; d++) {
    const isToday = d === dnum
    const bars = ranged
      .filter((r) => d >= r.from && d <= r.to)
      .map((r) => ({
        name: r.text,
        color: `hsl(${r.hue},34%,52%)`,
        radius: d === r.from ? '99px 2px 2px 99px' : d === r.to ? '2px 99px 99px 2px' : '2px',
      }))
    cells.push({ empty: false, key: `d${d}`, num: d, isToday, bars, items: (dayItems[d] || []).slice(0, 2), delay: (lead + d - 1) * 0.012 })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 500 }}>{monthName}</span>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {ongoing.map((r) => (
            <span key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, color: 'var(--ink2)' }}>
              <span style={{ width: 14, height: 4, borderRadius: 99, background: r.color }} />
              {r.text}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 7, marginBottom: 7 }}>
        {dowNames.map((n) => (
          <div key={n} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)', textAlign: 'center' }}>{n}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 7 }}>
        {cells.map((c) =>
          c.empty ? (
            <div key={c.key} style={{ minHeight: 88, borderRadius: 11, padding: '8px 9px', background: 'transparent', border: '1px solid transparent' }} />
          ) : (
            <div
              key={c.key}
              style={{
                minHeight: 88,
                borderRadius: 11,
                padding: '8px 9px',
                background: 'var(--sf)',
                border: '1px solid var(--ln)',
                boxShadow: c.isToday ? '0 0 0 1.5px var(--am)' : undefined,
                ...rise(0, 0.35),
                animationDelay: `${c.delay}s`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 13.5,
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 99,
                    background: c.isToday ? 'var(--am)' : undefined,
                    color: c.isToday ? 'var(--bg)' : 'var(--ink2)',
                  }}
                >
                  {c.num}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
                {c.bars.map((b, i) => (
                  <div key={i} title={b.name} style={{ height: 4, background: b.color, borderRadius: b.radius }} />
                ))}
                {c.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ width: 4, height: 4, borderRadius: 99, flexShrink: 0, background: it.done ? 'var(--g4)' : 'var(--am)' }} />
                    <span style={{ fontSize: 10, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: it.done ? 'line-through' : undefined, ...(it.done ? { color: 'var(--ink3)' } : {}) }}>{it.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </>
  )
}
