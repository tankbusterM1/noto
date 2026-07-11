import { useRef, type ReactNode } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { LANGS } from '../lib/constants'
import { MONO } from '../lib/ui'
import { safeHref } from '../lib/url'
import { ImageIcon, ExternalArrow, LightbulbIcon } from './icons'
import type { Block, Note } from '../lib/types'
import s from './NoteBlocks.module.css'

/**
 * Renders a note's ordered blocks.
 *  - `readOnly` (review session / reading mode): no contentEditable, and
 *    inline markdown (**bold**, *italic*, `code`, [links]) renders styled
 *    instead of showing the raw markers.
 *  - `full` (reading mode): also renders the img / link / call blocks the
 *    review session intentionally drops.
 * When editable, raw text is shown and saved byte-faithfully on blur — never
 * style text inside the contentEditable path.
 */

// One-level inline markdown for read views: wikilink, bold, italic, strike,
// code, link.
const INLINE_RE = /(\[\[[^[\]]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g

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

export function NoteBlocks({ note, readOnly = false, full = false }: { note: Note; readOnly?: boolean; full?: boolean }) {
  const updateNote = useData((st) => st.updateNote)

  const blocks: Block[] = note.blocks
  const editable = readOnly
    ? {}
    : { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false }
  // Read views render inline markdown styled; the editable path stays raw.
  const txt = (s?: string): ReactNode => (readOnly ? <Inline text={s} /> : s)

  const saveText = (index: number, text: string) => {
    if (blocks[index]?.text === text) return
    updateNote(note.id, { blocks: blocks.map((b, i) => (i === index ? { ...b, text } : b)) })
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
    readOnly ? undefined : (e: React.FocusEvent<HTMLElement>) => saveText(index, e.currentTarget.innerText)

  return (
    <div className={`${s.blocks} ${readOnly ? s.readOnly : ''}`}>
      {blocks.map((b, i) => {
        const key = `${note.id}:${i}`
        const lang = b.lang || ''

        switch (b.t) {
          case 'h2': {
            const size = readOnly
              ? b.level === 1 ? 25 : b.level === 3 ? 18 : 21
              : b.level === 1 ? 27 : b.level === 3 ? 19 : 23
            return (
              <h2 key={key} className={s.h2} style={{ fontSize: size }} {...editable} onBlur={onBlurText(i)}>
                {txt(b.text)}
              </h2>
            )
          }
          case 'p':
            return (
              <p key={key} className={s.p} {...editable} onBlur={onBlurText(i)}>
                {txt(b.text)}
              </p>
            )
          case 'ul':
            return (
              <div key={key} className={s.list}>
                {(b.items ?? []).map((item, j) => (
                  <div key={j} className={s.listItem}>
                    <div className={s.bullet} />
                    <div
                      className={s.listText}
                      {...editable}
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
              <div key={key} className={s.codeWrap}>
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
            return (
              <div key={key} className={s.quote} {...editable} onBlur={onBlurText(i)}>
                {txt(b.text)}
              </div>
            )
          case 'img':
            if (readOnly && !full) return null
            if (readOnly)
              return (
                <figure key={key} className={s.imgFig}>
                  {b.src && <img src={b.src} alt={b.text || ''} style={{ maxWidth: '100%', borderRadius: 14, display: 'block' }} />}
                  {b.text && <figcaption className={s.imgCaption}>{b.text}</figcaption>}
                </figure>
              )
            return (
              <ImgBlock
                key={key}
                src={b.src}
                caption={b.text}
                onSrc={(url) => updateNote(note.id, { blocks: blocks.map((x, j) => (j === i ? { ...x, src: url } : x)) })}
                onCaption={(text) => saveText(i, text)}
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
                key={key}
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
              <div key={key} className={s.callout}>
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
      })}
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
