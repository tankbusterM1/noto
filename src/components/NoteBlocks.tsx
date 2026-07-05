import { useRef } from 'react'
import { useData } from '../store/data'
import { LANGS } from '../lib/constants'
import { ImageIcon, ExternalArrow, LightbulbIcon } from './icons'
import type { Block, Note } from '../lib/types'
import s from './NoteBlocks.module.css'

/**
 * Renders a note's ordered blocks. `readOnly` (review session) drops the
 * contentEditable affordances and the img/link/call blocks.
 *
 * When editable, text edits + list-item edits + the code language chip persist
 * to the note (autosaved on blur via the data store → Dexie). Appended blocks
 * come from the editor toolbar (also persisted).
 */
export function NoteBlocks({ note, readOnly = false }: { note: Note; readOnly?: boolean }) {
  const updateNote = useData((st) => st.updateNote)

  const blocks: Block[] = note.blocks
  const editable = readOnly
    ? {}
    : { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false }

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
                {b.text}
              </h2>
            )
          }
          case 'p':
            return (
              <p key={key} className={s.p} {...editable} onBlur={onBlurText(i)}>
                {b.text}
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
                      {item}
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
                {b.text}
              </div>
            )
          case 'img':
            if (readOnly) return null
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
            if (readOnly) return null
            const initial = (b.domain || 'L')[0].toUpperCase()
            return (
              <div key={key} className={s.link}>
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
            if (readOnly) return null
            return (
              <div key={key} className={s.callout}>
                <span className={s.calloutIcon}>
                  <LightbulbIcon style={{ color: 'var(--am)' }} />
                </span>
                <div className={s.calloutText} {...editable} onBlur={onBlurText(i)}>
                  {b.text}
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
