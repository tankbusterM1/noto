/**
 * Task text with the strike line that sweeps across on completion
 * (README "Motion": a strike line whose width animates 0 → 100%).
 * The outer element supplies the text color; the line inherits it.
 */
export function StrikeText({
  text,
  done,
  thickness = 1.5,
}: {
  text: string
  done: boolean
  thickness?: number
}) {
  return (
    <span style={{ position: 'relative' }}>
      {text}
      <span
        style={{
          position: 'absolute',
          left: -2,
          top: '53%',
          height: thickness,
          background: 'currentColor',
          opacity: 0.75,
          borderRadius: 2,
          pointerEvents: 'none',
          transition: 'width 0.35s cubic-bezier(0.65,0,0.35,1)',
          width: done ? '100%' : '0%',
        }}
      />
    </span>
  )
}
