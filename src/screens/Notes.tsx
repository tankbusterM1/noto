import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useData, TRASH_TTL_DAYS } from '../store/data'
import { useUI } from '../store/ui'
import { kidsOf, notesIn, countRec, pathOf } from '../lib/tree'
import { noteFullText, blocksSnippet } from '../lib/format'
import { agoMs } from '../lib/dates'
import { MONO, SERIF, kicker, rise, clamp } from '../lib/ui'
import { NoteCard } from '../components/NoteCard'
import { EmptyState } from '../components/EmptyState'
import { ContextMenu, type MenuState } from '../components/ContextMenu'
import { GridIcon, FolderIcon, TreeCaret, SearchIcon, PlusIcon, CloseIcon, TrashIcon, ReviewIcon } from '../components/icons'
import type { Folder, Note } from '../lib/types'

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
  const srs = useData((s) => s.srs)
  const newNote = useData((s) => s.newNote)
  const newFolder = useData((s) => s.newFolder)
  const renameFolder = useData((s) => s.renameFolder)
  const deleteFolder = useData((s) => s.deleteFolder)
  const deleteNote = useData((s) => s.deleteNote)
  const addToReview = useData((s) => s.addToReview)
  const startSession = useData((s) => s.startSession)
  const trash = useData((s) => s.trash)
  const restoreNote = useData((s) => s.restoreNote)
  const purgeNote = useData((s) => s.purgeNote)
  const emptyTrash = useData((s) => s.emptyTrash)
  const openNote = useUI((s) => s.openNote)
  const selFolder = useUI((s) => s.selFolder)
  const libQ = useUI((s) => s.libQ)
  const expanded = useUI((s) => s.expanded)
  const renamingFolder = useUI((s) => s.renamingFolder)
  const setSelFolder = useUI((s) => s.setSelFolder)
  const setLibQ = useUI((s) => s.setLibQ)
  const setExpanded = useUI((s) => s.setExpanded)
  const toggleExpand = useUI((s) => s.toggleExpand)
  const startRenameFolder = useUI((s) => s.startRenameFolder)
  const stopRenameFolder = useUI((s) => s.stopRenameFolder)
  const showToast = useUI((s) => s.showToast)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [binArmed, setBinArmed] = useState(false)
  const binTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const emptyBin = () => {
    if (binArmed) {
      emptyTrash()
      setBinArmed(false)
      return
    }
    setBinArmed(true)
    clearTimeout(binTimer.current)
    binTimer.current = setTimeout(() => setBinArmed(false), 3000)
  }

  // Deleting a folder is now a safe, recoverable subtree delete (its notes go to
  // the recycle bin), so it takes a confirm: first click arms the row and toasts
  // the consequence, second click within 3s commits.
  const [armedFolder, setArmedFolder] = useState<string | null>(null)
  const folderTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const promptDeleteFolder = (id: string, name: string) => {
    if (armedFolder === id) {
      setArmedFolder(null)
      deleteFolder(id)
      return
    }
    setArmedFolder(id)
    clearTimeout(folderTimer.current)
    folderTimer.current = setTimeout(() => setArmedFolder(null), 3000)
    const n = countRec(folders, notes, id)
    showToast(n ? `Delete “${name}”? ${n} ${n === 1 ? 'note' : 'notes'} → bin · click again` : `Delete “${name}”? Click again`)
  }

  const folderMenu = (e: MouseEvent, folder: Folder) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New note here', icon: <PlusIcon size={11} />, onClick: () => { setSelFolder(folder.id); newNote() } },
        { label: 'New subfolder', icon: <FolderIcon size={13} />, onClick: () => newFolder(folder.id) },
        { label: '', onClick: () => {}, divider: true },
        { label: 'Rename', onClick: () => startRenameFolder(folder.id) },
        { label: 'Delete folder', icon: <TrashIcon size={12} />, danger: true, onClick: () => promptDeleteFolder(folder.id, folder.name) },
      ],
    })
  }

  const noteMenu = (e: MouseEvent, note: Note) => {
    e.preventDefault()
    e.stopPropagation()
    const inReview = !!srs[note.id]
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', onClick: () => openNote(note.id) },
        inReview
          ? { label: 'Review now', icon: <ReviewIcon size={13} />, onClick: () => startSession([note.id]) }
          : { label: 'Add to review', icon: <ReviewIcon size={13} />, onClick: () => addToReview(note.id) },
        { label: '', onClick: () => {}, divider: true },
        { label: 'Delete note', icon: <TrashIcon size={12} />, danger: true, onClick: () => deleteNote(note.id) },
      ],
    })
  }

  const bgMenu = (e: MouseEvent) => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New note', icon: <PlusIcon size={11} />, onClick: () => newNote() },
        { label: 'New folder', icon: <FolderIcon size={13} />, onClick: () => newFolder(selFolder === 'all' ? null : selFolder) },
      ],
    })
  }

  const q = libQ.toLowerCase()
  const isSearching = q.length > 0
  const isTrash = selFolder === 'trash' && !isSearching

  // Disarm "Empty bin" whenever we leave the trash view or the bin empties.
  // Otherwise the armed flag survives an unmount of the button, and a later
  // first click (which looks safe) would irreversibly erase the bin.
  useEffect(() => {
    if (!isTrash || trash.length === 0) setBinArmed(false)
  }, [isTrash, trash.length])

  // Full-text search across title, tags, and every block body.
  const searchResults = notes.filter((n) => noteFullText(n).includes(q))

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
              onKeyDown={(e) => e.key === 'Escape' && setLibQ('')}
              placeholder="Search all notes…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
            />
            {libQ && (
              <span onClick={() => setLibQ('')} title="Clear" style={{ cursor: 'pointer', color: 'var(--ink3)', fontSize: 13, padding: '0 2px', flexShrink: 0 }}>
                ×
              </span>
            )}
          </div>
          <button
            className="btn-dark"
            onClick={() => newNote()}
            style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <PlusIcon />
            New note
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {/* Folder tree */}
        <div style={{ width: 216, flexShrink: 0 }} onContextMenu={bgMenu}>
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
            {rows.map((r) => {
              const renaming = renamingFolder === r.folder.id
              return (
                <div
                  key={r.folder.id}
                  className="frow tint"
                  onClick={() => {
                    if (!renaming) pickFolder(r.folder.id)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRenameFolder(r.folder.id)
                  }}
                  onContextMenu={(e) => folderMenu(e, r.folder)}
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
                  {renaming ? (
                    <input
                      autoFocus
                      defaultValue={r.folder.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        else if (e.key === 'Escape') stopRenameFolder()
                      }}
                      onBlur={(e) => {
                        renameFolder(r.folder.id, e.target.value)
                        stopRenameFolder()
                      }}
                      style={{ flex: 1, minWidth: 0, border: '1px solid var(--am)', borderRadius: 5, background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', padding: '1px 5px', outline: 'none' }}
                    />
                  ) : (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Double-click to rename">
                        {r.folder.name}
                      </span>
                      {armedFolder === r.folder.id ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            promptDeleteFolder(r.folder.id, r.folder.name)
                          }}
                          title="Click to confirm — the folder's notes move to the bin"
                          style={{ display: 'flex', alignItems: 'center', color: 'var(--g1)', cursor: 'pointer', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', paddingRight: 6 }}
                        >
                          delete?
                        </span>
                      ) : (
                        <>
                          <span
                            className="frow-del"
                            onClick={(e) => {
                              e.stopPropagation()
                              promptDeleteFolder(r.folder.id, r.folder.name)
                            }}
                            title="Delete folder"
                            style={{ display: 'flex', alignItems: 'center', color: 'var(--ink3)', cursor: 'pointer', paddingRight: 2 }}
                          >
                            <CloseIcon size={9} />
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)', paddingRight: 6 }}>{r.count}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div
            className="crumb"
            onClick={() => newFolder(selFolder === 'all' ? null : selFolder)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', marginTop: 8, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink3)', transition: 'color 0.15s ease' }}
          >
            <PlusIcon size={11} />
            New folder
          </div>

          {/* Recently deleted — the recycle bin */}
          <div style={{ height: 1, background: 'var(--ln)', margin: '10px 2px 6px' }} />
          <div
            className="tint"
            onClick={() => { setSelFolder('trash'); setLibQ('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: isTrash ? 'var(--ink)' : 'var(--ink2)', background: isTrash ? 'var(--sf2)' : undefined }}
          >
            <TrashIcon size={13} />
            <span style={{ flex: 1 }}>Recently deleted</span>
            {trash.length > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--am)' }}>{trash.length}</span>}
          </div>
        </div>

        {/* Folder contents */}
        <div style={{ flex: 1, minWidth: 0 }} onContextMenu={isTrash ? undefined : bgMenu}>
          {isTrash ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink3)' }}>
                  recently deleted · {trash.length} {trash.length === 1 ? 'note' : 'notes'}
                </div>
                {trash.length > 0 && (
                  <button
                    className="del-btn"
                    onClick={emptyBin}
                    style={{ border: `1px solid ${binArmed ? 'var(--g1)' : 'var(--ln)'}`, background: 'transparent', color: binArmed ? 'var(--g1)' : 'var(--ink3)', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {binArmed ? 'Click again to erase all forever' : 'Empty bin'}
                  </button>
                )}
              </div>
              {trash.length === 0 ? (
                <EmptyState icon={<TrashIcon size={20} />} title="Nothing deleted — the bin is empty." hint={`deleted notes rest here until you restore them — the bin clears itself after ${TRASH_TTL_DAYS} days`} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                  {trash.map((t, i) => {
                    const daysLeft = Math.max(0, TRASH_TTL_DAYS - Math.floor((Date.now() - t.deletedAt) / 86_400_000))
                    return (
                    <div key={t.id} className="trash-card" style={{ background: 'var(--sf)', border: '1px dashed var(--ln)', borderRadius: 15, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, ...rise(i) }}>
                      <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 500, lineHeight: 1.25 }}>{t.title}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, ...clamp(2) }}>{blocksSnippet(t.blocks) || 'empty note'}</div>
                      <div style={{ flex: 1, minHeight: 4 }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--ln)', paddingTop: 10 }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>
                          <span>deleted {agoMs(t.deletedAt)}</span>
                          <span style={{ color: daysLeft <= 3 ? 'var(--am)' : 'var(--ink3)' }}>
                            {daysLeft === 0 ? 'auto-deletes today' : `auto-deletes in ${daysLeft}d`}
                          </span>
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => restoreNote(t.id)} className="press" style={{ border: '1px solid var(--g4)', background: 'transparent', color: 'var(--g4)', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            ↺ Restore
                          </button>
                          <button onClick={() => purgeNote(t.id)} className="del-btn" title="Delete forever" style={{ border: '1px solid var(--ln)', background: 'transparent', color: 'var(--ink3)', borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
                            <TrashIcon size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : isSearching ? (
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
              <NoteCard key={n.id} note={n} variant="grid" index={i} onContextMenu={(e) => noteMenu(e, n)} />
            ))}
          </div>
          {folderEmpty && (
            <div style={{ padding: '44px 0', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: 'var(--ink2)' }}>
              Nothing here yet — this folder is waiting for its first note.
            </div>
          )}
          {isSearching && gridSrc.length === 0 && (
            <div style={{ marginTop: 6 }}>
              <EmptyState title={`Nothing in the vault matches “${libQ}”.`} hint="⌘K → type it → create note" />
            </div>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
