import type { MouseEvent } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { Checkbox } from './Checkbox'
import { StrikeText } from './StrikeText'
import { TagLink } from './TagLink'
import { PlayTriangle, NibIcon, CloseIcon } from './icons'
import type { Todo } from '../lib/types'

/**
 * A single checklist row (Today dashboard + Todos screen). Optional reference
 * chip opens the linked note/video; optional tag pulls its thread; optional
 * delete (×) removes it.
 */
export function TodoLine({ todo, dense = false, onDelete }: { todo: Todo; dense?: boolean; onDelete?: () => void }) {
  const toggleTodo = useData((s) => s.toggleTodo)
  const openNote = useUI((s) => s.openNote)
  const openWatchItem = useUI((s) => s.openWatchItem)

  const size = dense ? 17 : 18
  const radius = dense ? 5.5 : 6
  const fontSize = dense ? 13 : 13.5
  const refSize = dense ? 19 : 20

  return (
    <div
      className="hoverrow"
      onClick={() => toggleTodo(todo.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: dense ? 11 : 12,
        padding: dense ? '9px 2px' : '11px 2px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--ln)',
      }}
    >
      <Checkbox done={todo.done} size={size} radius={radius} doneColor="var(--ac)" />
      <span
        style={{
          flex: 1,
          fontSize,
          lineHeight: 1.4,
          transition: 'color 0.35s ease',
          color: todo.done ? 'var(--ink3)' : undefined,
        }}
      >
        <StrikeText text={todo.text} done={todo.done} />
      </span>
      {todo.ref && (
        <span
          className="ref-chip"
          title={todo.ref.type === 'watch' ? 'Open linked video' : 'Open linked note'}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            if (todo.ref!.type === 'watch') openWatchItem(todo.ref!.id)
            else openNote(todo.ref!.id)
          }}
          style={{
            width: refSize,
            height: refSize,
            borderRadius: 7,
            background: 'var(--sf2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--ink2)',
            flexShrink: 0,
          }}
        >
          {todo.ref.type === 'watch' ? <PlayTriangle size={8} /> : <NibIcon size={9} />}
        </span>
      )}
      {todo.tag && <TagLink tag={todo.tag} variant="muted" size={dense ? 9.5 : 10} />}
      {onDelete && (
        <span
          className="hoverdel"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={{ display: 'flex', alignItems: 'center', color: 'var(--ink3)', cursor: 'pointer', flexShrink: 0 }}
        >
          <CloseIcon size={9} />
        </span>
      )}
    </div>
  )
}
