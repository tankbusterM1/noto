import { useUI, type Screen } from '../store/ui'
import s from './ScreenPlaceholder.module.css'

const TITLES: Record<Screen, { kicker: string; title: string }> = {
  today: { kicker: 'Desktop · Today', title: 'Today' },
  notes: { kicker: 'Library', title: 'Notes' },
  editor: { kicker: 'Note editor', title: 'Editor' },
  queue: { kicker: 'Memory · spaced review', title: 'Review' },
  session: { kicker: 'Review session', title: 'Session' },
  journal: { kicker: 'Daily journal', title: 'Journal' },
  todos: { kicker: 'Todos', title: 'Todos' },
  watch: { kicker: 'Watch later', title: 'Watch Later' },
}

export function ScreenPlaceholder() {
  const screen = useUI((st) => st.screen)
  const { kicker, title } = TITLES[screen]

  return (
    <div className={s.wrap} key={screen}>
      <div className={s.kicker}>{kicker}</div>
      <h1 className={s.title}>{title}</h1>
      <div className={s.card}>
        <p className={s.note}>
          The shell, theming, and navigation are live — this screen is built in
          step 4.
        </p>
        <div className={s.hint}>screen: {screen}</div>
      </div>
    </div>
  )
}
