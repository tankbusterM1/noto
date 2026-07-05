import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { dueNotes } from '../lib/srs'
import { fmtMins } from '../lib/format'
import { MONO } from '../lib/ui'
import { SearchIcon } from './icons'

type Kind = 'action' | 'note' | 'watch' | 'todo'
interface PalItem {
  kind: Kind
  label: string
  meta: string
  go: () => void
}

const kindColor: Record<Kind, string> = {
  note: 'var(--am)',
  watch: 'var(--ac)',
  todo: 'var(--g4)',
  action: 'var(--ink3)',
}

/**
 * ⌘K palette — fuzzy search across notes / videos / todos, plus actions.
 * Search matches titles, tags and meta (full-text body search is a stub).
 * ↑/↓ move selection (wraps), ↵ runs, esc closes.
 */
export function CommandPalette() {
  const notes = useData((s) => s.notes)
  const srs = useData((s) => s.srs)
  const watch = useData((s) => s.watch)
  const todos = useData((s) => s.todos)
  const startSession = useData((s) => s.startSession)

  const pal = useUI((s) => s.pal)
  const palIdx = useUI((s) => s.palIdx)
  const dark = useUI((s) => s.dark)
  const setPalQ = useUI((s) => s.setPalQ)
  const movePalette = useUI((s) => s.movePalette)
  const closePalette = useUI((s) => s.closePalette)
  const setScreen = useUI((s) => s.setScreen)
  const openNote = useUI((s) => s.openNote)
  const openWatchItem = useUI((s) => s.openWatchItem)
  const setTSeg = useUI((s) => s.setTSeg)
  const toggleTheme = useUI((s) => s.toggleTheme)

  if (pal === null) return null

  const dueCount = dueNotes(notes, srs).length
  const actions: PalItem[] = [
    { kind: 'action', label: 'Start review session', meta: dueCount + ' due', go: () => { closePalette(); startSession() } },
    { kind: 'action', label: "Write today's journal", meta: 'journal', go: () => { closePalette(); setScreen('journal') } },
    { kind: 'action', label: 'Toggle appearance', meta: dark ? 'to light' : 'to dark', go: () => { closePalette(); toggleTheme() } },
    { kind: 'action', label: 'Open month planner', meta: 'todos', go: () => { closePalette(); setScreen('todos'); setTSeg('month') } },
  ]
  const noteItems: PalItem[] = notes.map((n) => ({
    kind: 'note',
    label: n.title,
    meta: n.tags.slice(0, 2).map((t) => '#' + t).join(' '),
    go: () => { closePalette(); openNote(n.id) },
  }))
  const watchItems: PalItem[] = watch.filter((w) => !w.loading).map((w) => ({
    kind: 'watch',
    label: w.title,
    meta: fmtMins(w.mins || 0),
    go: () => { closePalette(); openWatchItem(w.id) },
  }))
  const todoItems: PalItem[] = todos.map((t) => ({
    kind: 'todo',
    label: t.text,
    meta: t.tag ? '#' + t.tag : '',
    go: () => { closePalette(); setScreen('todos'); setTSeg('today') },
  }))

  const q = pal.toLowerCase()
  const all = [...actions, ...noteItems, ...watchItems, ...todoItems]
  const items = (q ? all.filter((x) => (x.label + ' ' + x.meta).toLowerCase().includes(q)) : all).slice(0, 9)
  const sel = items.length ? ((palIdx % items.length) + items.length) % items.length : 0

  return (
    <>
      <div onClick={closePalette} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(24,19,10,0.42)', animation: 'fadein 0.2s ease both' }} />
      <div style={{ position: 'fixed', top: '14%', left: 0, right: 0, margin: '0 auto', width: 560, maxWidth: '92vw', zIndex: 151, background: 'var(--bg)', border: '1px solid var(--ln)', borderRadius: 18, boxShadow: '0 30px 80px rgba(24,19,10,0.3)', overflow: 'hidden', animation: 'rise 0.25s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--ln)' }}>
          <SearchIcon size={15} style={{ color: 'var(--ink3)' }} />
          <input
            autoFocus
            value={pal}
            onChange={(e) => setPalQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1) }
              else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.go() }
              else if (e.key === 'Escape') { closePalette() }
            }}
            placeholder="Search notes, videos, todos — or run an action…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit', color: 'var(--ink)', flex: 1 }}
          />
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', border: '1px solid var(--ln)', borderRadius: 5, padding: '2px 6px' }}>esc</span>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 8 }}>
          {items.map((it, i) => (
            <div
              key={i}
              onClick={it.go}
              onMouseEnter={() => useUI.setState({ palIdx: i })}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11, cursor: 'pointer', transition: 'background 0.1s ease', background: i === sel ? 'var(--sf2)' : undefined }}
            >
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', width: 46, flexShrink: 0, color: kindColor[it.kind] }}>{it.kind}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', flexShrink: 0 }}>{it.meta}</span>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', fontFamily: "'Newsreader', Georgia, serif", fontStyle: 'italic', fontSize: 14, color: 'var(--ink2)' }}>
              Nothing in the vault matches that.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 14, padding: '10px 18px', borderTop: '1px solid var(--ln)', fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘K from anywhere</span>
        </div>
      </div>
    </>
  )
}
