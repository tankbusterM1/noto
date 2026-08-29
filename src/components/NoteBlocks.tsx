import { createElement, memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { LANGS } from '../lib/constants'
import { MONO } from '../lib/ui'
import { safeHref } from '../lib/url'
import { HL_SRC, TC_SRC, HL_SCAN, TC_SCAN, PEN_KEY, RULE_RE, type Pen } from '../lib/ink'
import { ImageIcon, ExternalArrow, LightbulbIcon } from './icons'
import { BlockMenu } from './BlockMenu'
import { SelectionToolbar } from './SelectionToolbar'
import { blockId, type Block, type BlockType, type Note } from '../lib/types'
import s from './NoteBlocks.module.css'

/**
 * Renders a note's ordered blocks.
 *
 *  - `readOnly` (review / reading mode): no contentEditable, and inline
 *    markdown (**bold**, *italic*, `code`, [links], ==highlight==) renders styled
 *  - editing: the block canvas — a gutter per row (insert + grip), a block menu,
 *    drag reorder, block-aware keys and a floating selection toolbar
 *  - `full` (reading mode): also renders the img / link / call blocks the
 *    compact review card leaves out
 */

// One-level inline markdown for read views: wikilink, highlight, text colour,
// bold, italic, strike, code, link.
const INLINE_RE = new RegExp(
  '(\\[\\[[^[\\]]+\\]\\]|' + HL_SCAN + '|' + TC_SCAN + '|\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|~~[^~]+~~|`[^`]+`|\\[[^\\]]+\\]\\([^)\\s]+\\))',
  'g',
)
const HL_ONE = new RegExp('^' + HL_SRC + '$')
const TC_ONE = new RegExp('^' + TC_SRC + '$')

/** Open a [[wikilink]] target by title (toast when it doesn't exist). */
function openByTitle(title: string) {
  const t = title.trim()
  const found = useData.getState().notes.find((n) => n.title.trim().toLowerCase() === t.toLowerCase())
  if (found) useUI.getState().openNote(found.id)
  else useUI.getState().showToast('No note titled “' + t + '” yet')
}

export function Inline({ text }: { text?: string }): ReactNode {
  const parts = (text ?? '').split(INLINE_RE)
  return (
    <>
      {parts.map((p, i) => {
        let m = p.match(/^\[\[([^[\]]+)\]\]$/)
        if (m) {
          const t = m[1].trim()
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                openByTitle(t)
              }}
              title={'Open “' + t + '”'}
              style={{ color: 'var(--ac)', cursor: 'pointer', borderBottom: '1px dashed rgba(53,81,142,0.45)' }}
            >
              {t}
            </span>
          )
        }
        m = p.match(HL_ONE)
        if (m)
          return (
            <mark
              key={i}
              style={{
                background: `var(--hl-${PEN_KEY[(m[1] as Pen) ?? 'amber']})`,
                color: 'inherit',
                borderRadius: 3,
                padding: '0.05em 0.15em',
                boxDecorationBreak: 'clone',
              }}
            >
              {m[2]}
            </mark>
          )
        m = p.match(TC_ONE)
        if (m)
          return (
            <span key={i} style={{ color: `var(--tc-${PEN_KEY[m[1] as Pen]})` }}>
              {m[2]}
            </span>
          )
        m = p.match(/^\*\*([^*]+)\*\*$/)
        if (m) return <strong key={i}>{m[1]}</strong>
        m = p.match(/^\*([^*]+)\*$/)
        if (m) return <em key={i}>{m[1]}</em>
        m = p.match(/^~~([^~]+)~~$/)
        if (m) return <s key={i}>{m[1]}</s>
        m = p.match(/^`([^`]+)`$/)
        if (m)
          return (
            <code key={i} style={{ fontFamily: MONO, color: 'var(--am)', fontSize: '0.88em' }}>
              {m[1]}
            </code>
          )
        m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
        if (m) {
          // Untrusted URL (notes sync between devices) — only http(s)/mailto get
          // a live href; a javascript:/data: link degrades to plain styled text.
          const href = safeHref(m[2])
          return href ? (
            <a key={i} href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--ac)' }}>
              {m[1]}
            </a>
          ) : (
            <span key={i} style={{ color: 'var(--ac)' }}>
              {m[1]}
            </span>
          )
        }
        return p
      })}
    </>
  )
}

/* ── caret-safe editable ─────────────────────────────────────────────
 * React must never re-commit the text of a field you're typing in: patching
 * the text node collapses the caret to the start. So the element is
 * uncontrolled — its text is written imperatively when the block's identity
 * changes, and the memo below ignores `initial` entirely, so a store update
 * mid-keystroke re-renders nothing.
 */
interface EditableProps {
  tag: 'div' | 'h2' | 'p'
  syncKey: string
  initial: string
  className: string
  placeholder?: string
  onInput: (text: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void
  onFocus?: () => void
}

const Editable = memo(
  function Editable({ tag, syncKey, initial, className, placeholder, onInput, onKeyDown, onFocus }: EditableProps) {
    const ref = useRef<HTMLElement>(null)
    useEffect(() => {
      const el = ref.current
      if (el && el.innerText !== initial) el.innerText = initial
      // Only on identity change — never on every keystroke.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncKey])
    return createElement(tag, {
      ref,
      className,
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: false,
      'data-ph': placeholder,
      'data-sync': syncKey,
      onInput: (e: React.FormEvent<HTMLElement>) => onInput(e.currentTarget.innerText),
      onKeyDown,
      onFocus,
    })
  },
  (a, b) =>
    a.syncKey === b.syncKey && a.className === b.className && a.placeholder === b.placeholder && a.tag === b.tag,
)

/** Caret offset in plain-text characters from the start of `el`. */
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const r = sel.getRangeAt(0).cloneRange()
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

/** Put the caret at the start or end of a block's editable element. */
function focusBlock(root: HTMLElement | null, id: string, at: 'start' | 'end') {
  const el = root?.querySelector<HTMLElement>(`[data-sync^="${id}"]`)
  if (!el) return
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(at === 'start')
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

const newBlock = (t: BlockType, text = ''): Block => {
  const b: Block = { id: blockId(), t }
  if (t === 'ul') b.items = text ? [text] : ['']
  else if (t === 'div') return b
  else if (t === 'code') {
    b.text = text
    b.lang = 'ts'
  } else if (t === 'todo') {
    b.text = text
    b.done = false
  } else b.text = text
  if (t === 'h2') b.level = 2
  return b
}

/** The plain text of a block, for carrying across a turn-into. */
const blockText = (b: Block): string => (b.t === 'ul' ? (b.items ?? []).join(' · ') : (b.text ?? ''))

export function NoteBlocks({ note, readOnly = false, full = false }: { note: Note; readOnly?: boolean; full?: boolean }) {
  const updateNote = useData((st) => st.updateNote)

  const blocks: Block[] = note.blocks
  const editable = readOnly
    ? {}
    : { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false }
  // Read views render inline markdown styled; the editable path stays raw.
  const txt = (s2?: string): ReactNode => (readOnly ? <Inline text={s2} /> : s2)

  // ── live text, ahead of the store ────────────────────────────────
  // Keystrokes land here first so a structural edit (split, delete, turn) can
  // read what is on screen right now, while the Dexie write stays debounced.
  const draft = useRef(new Map<string, string>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ i: number; mode: 'insert' | 'turn'; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  // Mirrored in a ref: the first dragover can fire before the dragstart's state
  // update has re-rendered, and a stale closure would swallow the indicator.
  const dragRef = useRef<number | null>(null)
  const [over, setOver] = useState<{ i: number; after: boolean } | null>(null)
  const [pendingFocus, setPendingFocus] = useState<{ id: string; at: 'start' | 'end' } | null>(null)

  useEffect(() => {
    draft.current.clear()
    setMenu(null)
    setHover(null)
  }, [note.id])

  useEffect(() => {
    if (!pendingFocus) return
    focusBlock(rootRef.current, pendingFocus.id, pendingFocus.at)
    setPendingFocus(null)
  }, [pendingFocus, blocks])

  /** Current blocks with any un-flushed keystrokes folded in. */
  const live = (): Block[] =>
    blocks.map((b) => {
      const id = b.id ?? ''
      if (b.t === 'ul') {
        const items = (b.items ?? []).map((it, j) => draft.current.get(`${id}#${j}`) ?? it)
        return { ...b, items }
      }
      const d = draft.current.get(id)
      return d === undefined ? b : { ...b, text: d }
    })

  const commit = (next: Block[]) => {
    draft.current.clear()
    clearTimeout(saveTimer.current)
    updateNote(note.id, { blocks: next })
  }

  /** A keystroke: keep it local, then write through once typing settles. */
  const typed = (key: string, text: string) => {
    draft.current.set(key, text)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateNote(note.id, { blocks: live() })
      draft.current.clear()
    }, 400)
  }

  const setBlock = (i: number, patch: Partial<Block>) => {
    const next = live().map((b, j) => (j === i ? { ...b, ...patch } : b))
    commit(next)
  }

  const insertAt = (i: number, t: BlockType) => {
    const b = newBlock(t)
    const next = live()
    next.splice(i + 1, 0, b)
    commit(next)
    if (t !== 'div' && t !== 'img') setPendingFocus({ id: b.id!, at: 'start' })
  }

  const turnInto = (i: number, t: BlockType) => {
    const cur = live()[i]
    if (!cur) return
    const carried = blockText(cur)
    const b = newBlock(t, carried)
    b.id = cur.id ?? b.id
    const next = live().map((x, j) => (j === i ? b : x))
    commit(next)
    if (t !== 'div' && t !== 'img') setPendingFocus({ id: b.id!, at: 'end' })
  }

  const removeAt = (i: number) => {
    const next = live()
    const prev = next[i - 1]
    next.splice(i, 1)
    if (next.length === 0) next.push(newBlock('p'))
    commit(next)
    if (prev?.id) setPendingFocus({ id: prev.id, at: 'end' })
  }

  /** Enter inside a text block: split at the caret. A to-do begets a to-do. */
  const splitAt = (i: number, el: HTMLElement) => {
    const cur = live()[i]
    const text = el.innerText
    const off = caretOffset(el)
    const head = text.slice(0, off)
    const tail = text.slice(off)
    const sameKind: BlockType = cur.t === 'todo' ? 'todo' : cur.t === 'q' || cur.t === 'call' ? cur.t : 'p'
    const b = newBlock(sameKind, tail)
    const next = live().map((x, j) => (j === i ? { ...x, text: head } : x))
    next.splice(i + 1, 0, b)
    commit(next)
    setPendingFocus({ id: b.id!, at: 'start' })
  }

  const moveBlock = (from: number, toIndex: number) => {
    const next = live()
    const [moved] = next.splice(from, 1)
    next.splice(from < toIndex ? toIndex - 1 : toIndex, 0, moved)
    commit(next)
  }

  const openMenu = (i: number, mode: 'insert' | 'turn', el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setMenu({ i, mode, x: r.left, y: r.bottom + 6 })
  }

  const saveItem = (index: number, j: number, text: string) => {
    const items = (blocks[index].items ?? []).map((it, k) => (k === j ? text : it))
    updateNote(note.id, { blocks: blocks.map((b, i) => (i === index ? { ...b, items } : b)) })
  }
  const cycleLang = (index: number, lang: string) => {
    const next = LANGS[(LANGS.indexOf(lang as (typeof LANGS)[number]) + 1) % LANGS.length]
    updateNote(note.id, { blocks: blocks.map((b, i) => (i === index ? { ...b, lang: next } : b)) })
  }
  const onBlurText = (index: number) =>
    readOnly
      ? undefined
      : (e: React.FocusEvent<HTMLElement>) => {
          const text = e.currentTarget.innerText
          if (blocks[index]?.text === text) return
          updateNote(note.id, { blocks: live().map((b, i) => (i === index ? { ...b, text } : b)) })
        }

  /** Keys inside a text-ish block. */
  const blockKeys = (i: number, b: Block) => (e: React.KeyboardEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (e.key === '/' && el.innerText.trim() === '') {
      e.preventDefault()
      openMenu(i, 'insert', el)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      splitAt(i, el)
      return
    }
    if (e.key === 'Backspace' && el.innerText === '' && blocks.length > 1) {
      e.preventDefault()
      removeAt(i)
      return
    }
    // Keep the draft honest for keys that mutate text without firing input yet.
    if (b.id) draft.current.set(b.id, el.innerText)
  }

  const rows = (
    <>
      {blocks.map((b, i) => {
        const id = b.id ?? `i${i}`
        const key = `${note.id}:${id}`
        const lang = b.lang || ''

        // Gutter alignment: headings sit lower, cards lower still.
        const gutterTop = b.t === 'h2' ? 20 : b.t === 'img' || b.t === 'link' || b.t === 'code' ? 14 : 5

        const body = (() => {
          switch (b.t) {
            case 'h2': {
              const size = readOnly
                ? b.level === 1 ? 25 : b.level === 3 ? 18 : 21
                : b.level === 1 ? 27 : b.level === 3 ? 19 : 23
              if (readOnly)
                return (
                  <h2 className={s.h2} style={{ fontSize: size }}>
                    {txt(b.text)}
                  </h2>
                )
              return (
                <Editable
                  tag="h2"
                  syncKey={id}
                  initial={b.text ?? ''}
                  className={s.h2}
                  placeholder="Heading"
                  onInput={(t) => typed(id, t)}
                  onKeyDown={blockKeys(i, b)}
                />
              )
            }
            case 'p':
              // Legacy notes stored a rule as a paragraph of dashes; keep reading
              // those as a divider even though new ones are real `div` blocks.
              if (readOnly && RULE_RE.test(b.text ?? '')) return <hr className={s.divider} />
              if (readOnly)
                return <p className={s.p}>{txt(b.text)}</p>
              return (
                <Editable
                  tag="p"
                  syncKey={id}
                  initial={b.text ?? ''}
                  className={s.p}
                  placeholder="Write, or press / for blocks"
                  onInput={(t) => typed(id, t)}
                  onKeyDown={blockKeys(i, b)}
                />
              )
            case 'div':
              return <hr className={s.divider} />
            case 'todo':
              return (
                <div className={s.todo}>
                  <button
                    type="button"
                    className={`${s.tick} ${b.done ? s.tickOn : ''}`}
                    onClick={() => !readOnly && setBlock(i, { done: !b.done })}
                    aria-label={b.done ? 'Mark as not done' : 'Mark as done'}
                  >
                    {b.done && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4,13 9.5,18 20,6" className={s.tickPath} />
                      </svg>
                    )}
                  </button>
                  {readOnly ? (
                    <div className={`${s.todoText} ${b.done ? s.todoDone : ''}`}>{txt(b.text)}</div>
                  ) : (
                    <Editable
                      tag="div"
                      syncKey={id}
                      initial={b.text ?? ''}
                      className={`${s.todoText} ${b.done ? s.todoDone : ''}`}
                      placeholder="To-do"
                      onInput={(t) => typed(id, t)}
                      onKeyDown={blockKeys(i, b)}
                    />
                  )}
                </div>
              )
            case 'ul':
              return (
                <div className={s.list}>
                  {(b.items ?? []).map((item, j) => (
                    <div key={j} className={s.listItem}>
                      <div className={s.bullet} />
                      <div
                        className={s.listText}
                        {...editable}
                        data-sync={`${id}#${j}`}
                        onBlur={readOnly ? undefined : (e) => saveItem(i, j, e.currentTarget.innerText)}
                      >
                        {txt(item)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            case 'code':
              return (
                <div className={s.codeWrap}>
                  <div className={s.code} {...editable} onBlur={onBlurText(i)}>
                    {b.text}
                  </div>
                  {readOnly ? (
                    <div className={s.langLabel}>{lang}</div>
                  ) : (
                    <div className={s.langChip} title="Click to cycle language" onClick={() => cycleLang(i, lang)}>
                      {lang} ↺
                    </div>
                  )}
                </div>
              )
            case 'q':
              if (readOnly) return <div className={s.quote}>{txt(b.text)}</div>
              return (
                <Editable
                  tag="div"
                  syncKey={id}
                  initial={b.text ?? ''}
                  className={s.quote}
                  placeholder="Quote"
                  onInput={(t) => typed(id, t)}
                  onKeyDown={blockKeys(i, b)}
                />
              )
            case 'img':
              if (readOnly && !full) return null
              if (readOnly)
                return (
                  <figure className={s.imgFig}>
                    {b.src && <img src={b.src} alt={b.text || ''} style={{ maxWidth: '100%', borderRadius: 14, display: 'block' }} />}
                    {b.text && <figcaption className={s.imgCaption}>{b.text}</figcaption>}
                  </figure>
                )
              return (
                <ImgBlock
                  src={b.src}
                  caption={b.text}
                  onSrc={(url) => setBlock(i, { src: url })}
                  onCaption={(text) => setBlock(i, { text })}
                />
              )
            case 'link': {
              if (readOnly && !full) return null
              const initial = (b.domain || 'L')[0].toUpperCase()
              // window.open() bypasses React's href sanitiser, so gate it on the
              // same allow-list — an unsafe URL simply isn't clickable.
              const href = safeHref(b.url ?? 'https://' + (b.domain ?? ''))
              return (
                <div
                  className={s.link}
                  onClick={readOnly && href ? () => window.open(href, '_blank', 'noopener') : undefined}
                  style={readOnly && href ? { cursor: 'pointer' } : undefined}
                  title={readOnly ? href : undefined}
                >
                  <div className={s.linkTile}>{initial}</div>
                  <div className={s.linkBody}>
                    <div className={s.linkTitle} {...editable} onBlur={onBlurText(i)}>
                      {b.text}
                    </div>
                    <div className={s.linkDomain}>{b.domain}</div>
                  </div>
                  <ExternalArrow style={{ color: 'var(--ink3)', flexShrink: 0 }} />
                </div>
              )
            }
            case 'call':
              if (readOnly && !full) return null
              return (
                <div className={s.callout}>
                  <span className={s.calloutIcon}>
                    <LightbulbIcon style={{ color: 'var(--am)' }} />
                  </span>
                  <div className={s.calloutText} {...editable} onBlur={onBlurText(i)}>
                    {txt(b.text)}
                  </div>
                </div>
              )
            default:
              return null
          }
        })()

        if (body === null) return null
        if (readOnly) return <div key={key}>{body}</div>

        return (
          <div
            key={key}
            className={`${s.row} ${drag === i ? s.rowDragging : ''} ${
              over?.i === i ? (over.after ? s.rowOverAfter : s.rowOverBefore) : ''
            }`}
            // mouseover, not mouseenter: the pointer lands on the text leaf, and
            // mouseenter doesn't bubble from it.
            onMouseOver={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            onDragOver={(e) => {
              if (dragRef.current === null) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setOver({ i, after: e.clientY > r.top + r.height / 2 })
            }}
            onDrop={(e) => {
              const from = dragRef.current
              if (from === null) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const after = e.clientY > r.top + r.height / 2
              moveBlock(from, i + (after ? 1 : 0))
              dragRef.current = null
              setDrag(null)
              setOver(null)
            }}
          >
            <div className={`${s.gutter} ${hover === i ? s.gutterOn : ''}`} style={{ top: gutterTop }}>
              <button
                type="button"
                className={s.gutterBtn}
                title="Add a block below"
                onClick={(e) => openMenu(i, 'insert', e.currentTarget)}
              >
                +
              </button>
              <button
                type="button"
                className={s.gutterBtn}
                title="Drag to move · click to turn into…"
                draggable
                onDragStart={() => {
                  dragRef.current = i
                  setDrag(i)
                }}
                onDragEnd={() => {
                  dragRef.current = null
                  setDrag(null)
                  setOver(null)
                }}
                onClick={(e) => openMenu(i, 'turn', e.currentTarget)}
              >
                <span className={s.grip}>
                  {Array.from({ length: 6 }, (_, d) => (
                    <span key={d} className={s.gripDot} />
                  ))}
                </span>
              </button>
            </div>
            {body}
          </div>
        )
      })}
    </>
  )

  if (readOnly) return <div className={`${s.blocks} ${s.readOnly}`}>{rows}</div>

  return (
    <div className={s.canvasWrap}>
      <div className={s.blocks} ref={rootRef}>
        {rows}
      </div>
      {menu && (
        <BlockMenu
          x={menu.x}
          y={menu.y}
          mode={menu.mode}
          onClose={() => setMenu(null)}
          onPick={(t) => {
            const { i, mode } = menu
            setMenu(null)
            if (mode === 'insert') insertAt(i, t)
            else turnInto(i, t)
          }}
        />
      )}
      <SelectionToolbar
        canvasRef={rootRef}
        onTurn={(t) => {
          const sel = window.getSelection()
          const node = sel?.anchorNode
          const host = node && (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)
          const rowEl = host?.closest<HTMLElement>(`[data-sync]`)
          const sync = rowEl?.getAttribute('data-sync')?.split('#')[0]
          const i = blocks.findIndex((b) => (b.id ?? '') === sync)
          if (i >= 0) turnInto(i, t)
        }}
      />
    </div>
  )
}

/** Editable image block: click / drop to upload; stored as a data-URL. */
export function ImgBlock({
  src,
  caption,
  onSrc,
  onCaption,
}: {
  src?: string
  caption?: string
  onSrc: (dataUrl: string) => void
  onCaption: (text: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const read = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => onSrc(reader.result as string)
    reader.readAsDataURL(file)
  }
  return (
    <figure className={s.imgFig}>
      {src ? (
        <img
          src={src}
          alt={caption || ''}
          title="Click to replace"
          onClick={() => inputRef.current?.click()}
          style={{ maxWidth: '100%', borderRadius: 14, display: 'block', cursor: 'pointer' }}
        />
      ) : (
        <div
          className={s.imgDrop}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            read(e.dataTransfer.files[0])
          }}
        >
          <ImageIcon size={26} strokeWidth={1.3} />
          <span className={s.imgHint}>drop an image · or click</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => read(e.target.files?.[0])} />
      <figcaption
        className={s.imgCaption}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onCaption(e.currentTarget.innerText)}
      >
        {caption}
      </figcaption>
    </figure>
  )
}
