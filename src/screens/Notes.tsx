import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { kidsOf, notesIn, countRec, pathOf } from '../lib/tree'
import { snippet } from '../lib/format'
import { MONO, SERIF, kicker, rise } from '../lib/ui'
import { NoteCard } from '../components/NoteCard'
import { GridIcon, FolderIcon, TreeCaret, SearchIcon, PlusIcon } from '../components/icons'
import type { Folder } from '../lib/types'

interface Row {
  folder: Folder
  depth: number
  hasKids: boolean
  open: boolean
  active: boolean
  count: number
}

export function Notes() {
  const notes = useData((s) => s.notes)
  const folders = useData((s) => s.folders)
  const newNote = useData((s) => s.newNote)
  const showToast = useUI((s) => s.showToast)
  const selFolder = useUI((s) => s.selFolder)
  const libQ = useUI((s) => s.libQ)
  const expanded = useUI((s) => s.expanded)
  const setSelFolder = useUI((s) => s.setSelFolder)
  const setLibQ = useUI((s) => s.setLibQ)
  const setExpanded = useUI((s) => s.setExpanded)
  const toggleExpand = useUI((s) => s.toggleExpand)

  const q = libQ.toLowerCase()
  const isSearching = q.length > 0

  // STUB: search matches title / first-paragraph snippet / tags — full-text
  // search over every block body is a flagged production task.
  const searchResults = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      snippet(n).toLowerCase().includes(q) ||
      n.tags.join(' ').includes(q),
  )

  // Build the flattened, indented folder tree.
  const rows: Row[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of kidsOf(folders, parent)) {
      const open = !!expanded[f.id]
      rows.push({
        folder: f,
        depth,
        hasKids: kidsOf(folders, f.id).length > 0,
        open,
        active: selFolder === f.id,
        count: countRec(folders, notes, f.id),
      })
      if (open) walk(f.id, depth + 1)
    }
  }
  walk(null, 0)

  const pickFolder = (id: string) => {
    setSelFolder(id)
    setExpanded({ ...expanded, [id]: true })
    setLibQ('')
  }

  const dirNotes = selFolder === 'all' ? notes : notesIn(notes, selFolder)
  const gridSrc = isSearching ? searchResults : dirNotes
  const subFolders = isSearching ? [] : kidsOf(folders, selFolder === 'all' ? null : selFolder)
  const crumbs = isSearching
    ? []
    : [{ id: 'all', name: 'All notes', pre: '', last: selFolder === 'all' }].concat(
        selFolder === 'all'
          ? []
          : pathOf(folders, selFolder).map((f, i, arr) => ({
              id: f.id,
              name: f.name,
              pre: '/',
              last: i === arr.length - 1,
            })),
      )
  const folderEmpty = !isSearching && gridSrc.length === 0 && subFolders.length === 0

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={kicker}>Library · {notes.length} notes</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Notes</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 10, padding: '8px 12px', width: 230 }}>
            <SearchIcon style={{ color: 'var(--ink3)' }} />
            <input
              value={libQ}
              onChange={(e) => setLibQ(e.target.value)}
              placeholder="Search all notes…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
            />
          </div>
          <button
            className="btn-dark"
            onClick={newNote}
            style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <PlusIcon />
            New note
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {/* Folder tree */}
        <div style={{ width: 216, flexShrink: 0 }}>
          <div
            className="tint"
            onClick={() => {
              setSelFolder('all')
              setLibQ('')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: selFolder === 'all' && !isSearching ? 'var(--ink)' : 'var(--ink2)',
              background: selFolder === 'all' && !isSearching ? 'var(--sf2)' : undefined,
            }}
          >
            <GridIcon />
            <span style={{ flex: 1 }}>All notes</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>{notes.length}</span>
          </div>
          <div style={{ height: 1, background: 'var(--ln)', margin: '8px 2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r) => (
              <div
                key={r.folder.id}
                className="tint"
                onClick={() => pickFolder(r.folder.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 8px 6px 0',
                  paddingLeft: 4 + r.depth * 16,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: r.active ? 600 : 500,
                  color: r.active ? 'var(--ink)' : 'var(--ink2)',
                  background: r.active ? 'var(--sf2)' : undefined,
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpand(r.folder.id)
                  }}
                  style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 4, opacity: r.hasKids ? 1 : 0 }}
                >
                  <TreeCaret style={{ transition: 'transform 0.18s ease', transform: r.open ? 'rotate(90deg)' : undefined }} />
                </div>
                <FolderIcon style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.folder.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', paddingRight: 6 }}>{r.count}</span>
              </div>
            ))}
          </div>
          <div
            onClick={() => showToast('New folder — not wired in this prototype')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginTop: 8, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink3)' }}
          >
            <PlusIcon size={11} />
            New folder
          </div>
        </div>

        {/* Folder contents */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isSearching ? (
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)', marginBottom: 14 }}>
              results for "{libQ}" · {searchResults.length} {searchResults.length === 1 ? 'note' : 'notes'}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12.5, color: 'var(--ink3)', flexWrap: 'wrap' }}>
                {crumbs.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.pre && <span style={{ opacity: 0.55 }}>{c.pre}</span>}
                    <span
                      className="crumb"
                      onClick={() => setSelFolder(c.id)}
                      style={{ cursor: 'pointer', fontWeight: 500, color: c.last ? 'var(--ink)' : undefined, transition: 'color 0.15s ease' }}
                    >
                      {c.name}
                    </span>
                  </div>
                ))}
              </div>
              {subFolders.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 11, marginBottom: 20 }}>
                  {subFolders.map((f, i) => (
                    <div
                      key={f.id}
                      className="lift press-98"
                      onClick={() => pickFolder(f.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 13, padding: '13px 15px', cursor: 'pointer', ...rise(i, 0.35) }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--sf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--am)', flexShrink: 0 }}>
                        <FolderIcon size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>
                          {countRec(folders, notes, f.id)} notes
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {gridSrc.map((n, i) => (
              <NoteCard key={n.id} note={n} variant="grid" index={i} />
            ))}
          </div>
          {folderEmpty && (
            <div style={{ padding: '44px 0', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: 'var(--ink2)' }}>
              Nothing here yet — this folder is waiting for its first note.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
