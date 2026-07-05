import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useData } from '../store/data'
import { LANGS } from '../lib/constants'
import { blockId, type Block, type BlockType, type Note } from '../lib/types'
import { ExternalArrow, LightbulbIcon } from './icons'
import { ImgBlock } from './NoteBlocks'
import s from './NoteBlocks.module.css'

/*
 * Fluid, Notion/Obsidian-style block editor. Blocks are *uncontrolled*
 * contentEditables (content set once on mount, keyed by a stable block id) so
 * React never resets the cursor mid-typing. Keyboard drives structure:
 *   Enter        split the block → a new paragraph (Shift+Enter = soft newline)
 *   Backspace    at block start → merge into the previous block
 *   # / >        at line start + space → heading / quote
 *   - / *        at line start + space → bullet list
 *   ``` + Enter  → code block
 * Programmatic text changes (split/merge/markdown) update the DOM directly
 * since the blocks are uncontrolled; the store is kept in sync for persistence.
 */

const TEXT_TYPES: BlockType[] = ['p', 'h2', 'q', 'call']

function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const r = sel.getRangeAt(0).cloneRange()
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

function placeCaret(el: HTMLElement, offset: number) {
  el.focus()
  const node = el.firstChild
  const sel = window.getSelection()
  const range = document.createRange()
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.textContent?.length ?? 0))
  } else {
    range.setStart(el, 0)
  }
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** One uncontrolled editable region (content initialised on mount). */
function Editable({
  refKey,
  initial,
  className,
  style,
  register,
  onKeyDown,
  onInput,
  onBlur,
  ...rest
}: {
  refKey: string
  initial: string
  className?: string
  style?: CSSProperties
  register: (key: string, el: HTMLElement | null) => void
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onInput?: (el: HTMLDivElement) => void
  onBlur?: (el: HTMLDivElement) => void
} & { 'data-ph'?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.innerText = initial
    register(refKey, ref.current)
    return () => register(refKey, null)
    // mount only — content is uncontrolled from here on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={className}
      style={style}
      onKeyDown={onKeyDown}
      onInput={(e) => onInput?.(e.currentTarget)}
      onBlur={(e) => onBlur?.(e.currentTarget)}
      {...rest}
    />
  )
}

export function NoteEditor({ note }: { note: Note }) {
  const updateNote = useData((st) => st.updateNote)
  const els = useRef(new Map<string, HTMLElement>())
  const pending = useRef<{ key: string; offset: number } | null>(null)
  const blocks = note.blocks

  const register = (key: string, el: HTMLElement | null) => {
    if (el) els.current.set(key, el)
    else els.current.delete(key)
  }

  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const el = els.current.get(p.key)
    if (el) placeCaret(el, p.offset)
  })

  const commit = (next: Block[], focus?: { key: string; offset: number }) => {
    if (focus) pending.current = focus
    updateNote(note.id, { blocks: next })
  }

  const idxOf = (id: string) => blocks.findIndex((b) => b.id === id)

  // ── text-block editing (p/h2/q/call) ──────────────────────────────
  const saveBlockText = (block: Block, el: HTMLElement) => {
    const text = el.innerText
    if (text === block.text) return
    commit(blocks.map((b) => (b.id === block.id ? { ...b, text } : b)))
  }

  const splitTextBlock = (block: Block, el: HTMLElement) => {
    const off = caretOffset(el)
    const full = el.innerText
    const before = full.slice(0, off)
    const after = full.slice(off)
    el.innerText = before
    const nb: Block = { id: blockId(), t: 'p', text: after }
    const i = idxOf(block.id!)
    commit([...blocks.slice(0, i), { ...block, text: before }, nb, ...blocks.slice(i + 1)], { key: nb.id!, offset: 0 })
  }

  const mergeIntoPrev = (block: Block, el: HTMLElement): boolean => {
    const i = idxOf(block.id!)
    if (i <= 0) return false
    const prev = blocks[i - 1]
    if (!TEXT_TYPES.includes(prev.t)) return false
    const prevEl = els.current.get(prev.id!)
    const prevText = prevEl ? prevEl.innerText : prev.text ?? ''
    const merged = prevText + el.innerText
    if (prevEl) prevEl.innerText = merged
    commit([...blocks.slice(0, i - 1), { ...prev, text: merged }, ...blocks.slice(i + 1)], { key: prev.id!, offset: prevText.length })
    return true
  }

  const convert = (block: Block, t: BlockType, strip: number, el: HTMLElement) => {
    const rest = el.innerText.slice(strip)
    if (t === 'ul') {
      commit(blocks.map((b) => (b.id === block.id ? { id: b.id, t: 'ul', items: [rest] } : b)), { key: `${block.id}:0`, offset: 0 })
    } else if (t === 'code') {
      commit(blocks.map((b) => (b.id === block.id ? { id: b.id, t: 'code', lang: 'python', text: rest } : b)), { key: block.id!, offset: 0 })
    } else {
      el.innerText = rest
      commit(blocks.map((b) => (b.id === block.id ? { ...b, t, text: rest } : b)), { key: block.id!, offset: 0 })
    }
  }

  const textKeyDown = (block: Block) => (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.t === 'p' && el.innerText === '```') {
        e.preventDefault()
        convert(block, 'code', 3, el)
        return
      }
      e.preventDefault()
      splitTextBlock(block, el)
    } else if (e.key === 'Backspace' && caretOffset(el) === 0) {
      if (mergeIntoPrev(block, el)) e.preventDefault()
    } else if (e.key === ' ' && block.t === 'p') {
      const t = el.innerText
      if (caretOffset(el) === t.length) {
        if (t === '#' || t === '##') { e.preventDefault(); convert(block, 'h2', t.length, el) }
        else if (t === '>') { e.preventDefault(); convert(block, 'q', 1, el) }
        else if (t === '-' || t === '*') { e.preventDefault(); convert(block, 'ul', 1, el) }
      }
    }
  }

  // ── list editing ──────────────────────────────────────────────────
  const saveItems = (block: Block, next: string[]) =>
    commit(blocks.map((b) => (b.id === block.id ? { ...b, items: next } : b)))

  const listKeyDown = (block: Block, j: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const items = block.items ?? []
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const off = caretOffset(el)
      const full = el.innerText
      const before = full.slice(0, off)
      const after = full.slice(off)
      if (!before && !after && j === items.length - 1) {
        // empty last item → exit the list into a new paragraph
        const trimmed = items.slice(0, j)
        const nb: Block = { id: blockId(), t: 'p', text: '' }
        const i = idxOf(block.id!)
        const next = trimmed.length
          ? [...blocks.slice(0, i), { ...block, items: trimmed }, nb, ...blocks.slice(i + 1)]
          : [...blocks.slice(0, i), nb, ...blocks.slice(i + 1)]
        commit(next, { key: nb.id!, offset: 0 })
        return
      }
      el.innerText = before
      const nextItems = [...items.slice(0, j), before, after, ...items.slice(j + 1)]
      saveItems(block, nextItems)
      pending.current = { key: `${block.id}:${j + 1}`, offset: 0 }
    } else if (e.key === 'Backspace' && caretOffset(el) === 0) {
      if (j === 0) {
        // first item, at start → turn the list back into a paragraph
        if (items.length === 1) {
          e.preventDefault()
          commit(blocks.map((b) => (b.id === block.id ? { id: b.id, t: 'p', text: items[0] } : b)), { key: block.id!, offset: 0 })
        }
        return
      }
      e.preventDefault()
      const prevText = items[j - 1]
      const merged = prevText + el.innerText
      const nextItems = [...items.slice(0, j - 1), merged, ...items.slice(j + 1)]
      saveItems(block, nextItems)
      pending.current = { key: `${block.id}:${j - 1}`, offset: prevText.length }
    }
  }

  const cycleLang = (block: Block) => {
    const lang = block.lang || ''
    const next = LANGS[(LANGS.indexOf(lang as (typeof LANGS)[number]) + 1) % LANGS.length]
    commit(blocks.map((b) => (b.id === block.id ? { ...b, lang: next } : b)))
  }

  return (
    <div className={s.blocks}>
      {blocks.map((b) => {
        const key = b.id!
        switch (b.t) {
          case 'h2':
            return <Editable key={key} refKey={key} initial={b.text ?? ''} className={s.h2} register={register} onKeyDown={textKeyDown(b)} onBlur={(el) => saveBlockText(b, el)} />
          case 'p':
            return <Editable key={key} refKey={key} initial={b.text ?? ''} className={s.p} data-ph="Write, or press # / - / > / ``` …" register={register} onKeyDown={textKeyDown(b)} onBlur={(el) => saveBlockText(b, el)} />
          case 'q':
            return <Editable key={key} refKey={key} initial={b.text ?? ''} className={s.quote} register={register} onKeyDown={textKeyDown(b)} onBlur={(el) => saveBlockText(b, el)} />
          case 'call':
            return (
              <div key={key} className={s.callout}>
                <span className={s.calloutIcon}><LightbulbIcon style={{ color: 'var(--am)' }} /></span>
                <Editable refKey={key} initial={b.text ?? ''} className={s.calloutText} register={register} onKeyDown={textKeyDown(b)} onBlur={(el) => saveBlockText(b, el)} />
              </div>
            )
          case 'ul':
            return (
              <div key={key} className={s.list}>
                {(b.items ?? []).map((item, j) => (
                  <div key={j} className={s.listItem}>
                    <div className={s.bullet} />
                    <Editable refKey={`${key}:${j}`} initial={item} className={s.listText} register={register} onKeyDown={listKeyDown(b, j)} onBlur={(el) => {
                      const items = [...(b.items ?? [])]
                      items[j] = el.innerText
                      saveItems(b, items)
                    }} />
                  </div>
                ))}
              </div>
            )
          case 'code':
            return (
              <div key={key} className={s.codeWrap}>
                <Editable refKey={key} initial={b.text ?? ''} className={s.code} register={register} onBlur={(el) => saveBlockText(b, el)} />
                <div className={s.langChip} title="Click to cycle language" onClick={() => cycleLang(b)}>{b.lang || ''} ↺</div>
              </div>
            )
          case 'img':
            return (
              <ImgBlock
                key={key}
                src={b.src}
                caption={b.text}
                onSrc={(url) => commit(blocks.map((x) => (x.id === b.id ? { ...x, src: url } : x)))}
                onCaption={(text) => commit(blocks.map((x) => (x.id === b.id ? { ...x, text } : x)))}
              />
            )
          case 'link': {
            const initial = (b.domain || 'L')[0].toUpperCase()
            return (
              <div key={key} className={s.link}>
                <div className={s.linkTile}>{initial}</div>
                <div className={s.linkBody}>
                  <Editable refKey={key} initial={b.text ?? ''} className={s.linkTitle} register={register} onBlur={(el) => saveBlockText(b, el)} />
                  <div className={s.linkDomain}>{b.domain}</div>
                </div>
                <ExternalArrow style={{ color: 'var(--ink3)', flexShrink: 0 }} />
              </div>
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}
