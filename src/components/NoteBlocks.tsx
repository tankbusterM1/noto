import { useData } from '../store/data'
import { LANGS } from '../lib/constants'
import { ImageIcon, ExternalArrow, LightbulbIcon } from './icons'
import type { Block, Note } from '../lib/types'
import s from './NoteBlocks.module.css'

/**
 * Renders a note's ordered blocks. `readOnly` (review session) drops the
 * contentEditable affordances and the img/link/call blocks, matching the
 * prototype's session renderer. Appended blocks (`extra`) and code-language
 * overrides (`langO`) come from the data store.
 *
 * NOTE: text edits to existing blocks are not persisted — the prototype
 * doesn't wire contentEditable back to storage. Formatting (execCommand) and
 * block *appends* are live; body persistence is a flagged stub.
 */
export function NoteBlocks({ note, readOnly = false }: { note: Note; readOnly?: boolean }) {
  const extra = useData((st) => st.extra)
  const langO = useData((st) => st.langO)
  const setLang = useData((st) => st.setLang)

  const blocks: Block[] = [...note.blocks, ...(extra[note.id] ?? [])]
  const editable = readOnly
    ? {}
    : { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false }

  return (
    <div className={`${s.blocks} ${readOnly ? s.readOnly : ''}`}>
      {blocks.map((b, i) => {
        const key = `${note.id}:${i}`
        const lang = langO[key] || b.lang || ''

        switch (b.t) {
          case 'h2':
            return (
              <h2 key={key} className={s.h2} {...editable}>
                {b.text}
              </h2>
            )
          case 'p':
            return (
              <p key={key} className={s.p} {...editable}>
                {b.text}
              </p>
            )
          case 'ul':
            return (
              <div key={key} className={s.list}>
                {(b.items ?? []).map((item, j) => (
                  <div key={j} className={s.listItem}>
                    <div className={s.bullet} />
                    <div className={s.listText} {...editable}>
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            )
          case 'code':
            return (
              <div key={key} className={s.codeWrap}>
                <div className={s.code} {...editable}>
                  {b.text}
                </div>
                {readOnly ? (
                  <div className={s.langLabel}>{lang}</div>
                ) : (
                  <div
                    className={s.langChip}
                    title="Click to cycle language"
                    onClick={() => {
                      const next = LANGS[(LANGS.indexOf(lang as (typeof LANGS)[number]) + 1) % LANGS.length]
                      setLang(key, next)
                    }}
                  >
                    {lang} ↺
                  </div>
                )}
              </div>
            )
          case 'q':
            return (
              <div key={key} className={s.quote} {...editable}>
                {b.text}
              </div>
            )
          case 'img':
            if (readOnly) return null
            return (
              <figure key={key} className={s.imgFig}>
                {/* STUB: real image upload/drop is not wired — this is the drop affordance only. */}
                <div className={s.imgDrop}>
                  <ImageIcon size={26} strokeWidth={1.3} />
                  <span className={s.imgHint}>drop an image · paste · or click</span>
                </div>
                <figcaption className={s.imgCaption} {...editable}>
                  {b.text}
                </figcaption>
              </figure>
            )
          case 'link': {
            if (readOnly) return null
            const initial = (b.domain || 'L')[0].toUpperCase()
            return (
              <div key={key} className={s.link}>
                <div className={s.linkTile}>{initial}</div>
                <div className={s.linkBody}>
                  <div className={s.linkTitle} {...editable}>
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
                <div className={s.calloutText} {...editable}>
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
