import type { CSSProperties, MouseEvent } from 'react'
import s from './Checkbox.module.css'

/**
 * The animated check control shared by todos / goals / rituals / week / watch.
 * On `done`, the check path draws in via stroke-dashoffset (12 → 0) and the box
 * fills to `doneColor` — "a pen finishing a task" (README "Motion").
 */
interface CheckboxProps {
  done: boolean
  shape?: 'square' | 'round'
  size?: number
  radius?: number
  borderColor?: string
  doneColor?: string
  checkStroke?: number
  checkSize?: number
  hoverBorder?: string
  title?: string
  onClick?: (e: MouseEvent) => void
}

export function Checkbox({
  done,
  shape = 'square',
  size = 18,
  radius = 6,
  borderColor = 'var(--ink3)',
  doneColor = 'var(--ac)',
  checkStroke = 2.2,
  checkSize = 10,
  hoverBorder,
  title,
  onClick,
}: CheckboxProps) {
  const style = {
    width: size,
    height: size,
    borderRadius: shape === 'round' ? 999 : radius,
    border: `1.5px solid ${done ? doneColor : borderColor}`,
    background: done ? doneColor : 'transparent',
    ...(hoverBorder ? { '--hb': hoverBorder } : {}),
  } as CSSProperties

  return (
    <span
      className={`${s.box} ${hoverBorder ? s.hoverable : ''}`}
      style={style}
      onClick={onClick}
      title={title}
    >
      <svg
        width={checkSize}
        height={checkSize}
        viewBox="0 0 12 12"
        fill="none"
        stroke="var(--bg)"
        strokeWidth={checkStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline
          points="2,6.5 4.8,9 10,3.5"
          style={{
            strokeDasharray: 12,
            strokeDashoffset: done ? 0 : 12,
            transition: 'stroke-dashoffset 0.3s cubic-bezier(0.65,0,0.35,1) 0.06s',
          }}
        />
      </svg>
    </span>
  )
}
