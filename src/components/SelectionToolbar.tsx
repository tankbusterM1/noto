import { useEffect, useState, type RefObject } from 'react'
import type { BlockType } from '../lib/types'
import s from './SelectionToolbar.module.css'

/*
 * The floating toolbar over a text selection inside the block canvas.
 *
 * Two things matter here:
 *  · onMouseDown must preventDefault — otherwise the click blurs the canvas and
 *    the selection is gone before the command can run.
 *  · the panel carries its own centring offset (translate(-50%,-100%)) INSIDE
 *    the keyframe, because a keyframed transform would otherwise overwrite a
 *    static one and the toolbar would fly in from the wrong place.
 */

export function SelectionToolbar({
  canvasRef,
  onTurn,
}: {
  /*
   * The REF, not its current value: `rootRef.current` is null on the first
   * render, and a prop holding that null never updates — the toolbar would
   * never find the canvas and so never appear.
   */
  canvasRef: RefObject<HTMLElement | null>
  onTurn: (t: BlockType) => void
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setAt(null)
      const canvas = canvasRef.current
      const node = sel.anchorNode
      if (!canvas || !node || !canvas.contains(node)) return setAt(null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width && !rect.height) return setAt(null)
      setAt({ x: rect.left + rect.width / 2, y: rect.top - 8 })
    }
    document.addEventListener('selectionchange', read)
    window.addEventListener('scroll', read, true)
    return () => {
      document.removeEventListener('selectionchange', read)
      window.removeEventListener('scroll', read, true)
    }
  }, [canvasRef])

  if (!at) return null

  /*
   * Blocks are stored as plain text and synced as markdown, so the toolbar
   * writes MARKERS, not <b> tags: execCommand('bold') would look right and then
   * vanish on save, because the block only keeps innerText. insertText also
   * fires an `input` event, so the block's normal save path picks it up and the
   * read view renders it bold.
   */
  const wrap = (marker: string) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString()
    document.execCommand('insertText', false, marker + text + marker)
  }

  return (
    <div
      className={s.bar}
      style={{ left: at.x, top: at.y }}
      // Keep the selection alive through the click.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className={s.btn} title="Bold" onClick={() => wrap('**')}>
        <b>B</b>
      </button>
      <button type="button" className={s.btn} title="Italic" onClick={() => wrap('*')}>
        <i>i</i>
      </button>
      <span className={s.sep} />
      <button type="button" className={s.btn} title="Turn into heading" onClick={() => onTurn('h2')}>
        H
      </button>
      <button type="button" className={s.btn} title="Turn into quote" onClick={() => onTurn('q')}>
        ❝
      </button>
      <button type="button" className={s.btn} title="Turn into bullet list" onClick={() => onTurn('ul')}>
        –
      </button>
      <button type="button" className={s.btn} title="Turn into to-do" onClick={() => onTurn('todo')}>
        ☐
      </button>
    </div>
  )
}
