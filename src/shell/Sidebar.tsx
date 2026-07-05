import type { ReactNode } from 'react'
import { useUI, type Screen } from '../store/ui'
import { useData } from '../store/data'
import {
  Caret,
  TodayIcon,
  NotesIcon,
  JournalIcon,
  TodosIcon,
  WatchIcon,
  ReviewIcon,
  SearchIcon,
  AppearanceIcon,
} from '../components/icons'
import s from './Sidebar.module.css'

/** Which nav row is highlighted for the current screen. */
function isActive(navId: Screen, screen: Screen): boolean {
  if (navId === 'notes') return screen === 'notes' || screen === 'editor'
  if (navId === 'queue') return screen === 'queue' || screen === 'session'
  return screen === navId
}

interface NavItemProps {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  right?: ReactNode
}

function NavItem({ icon, label, active, onClick, right }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${s.navItem} ${active ? s.active : ''}`}
    >
      <span className={s.navIcon}>{icon}</span>
      <span className={s.navLabel}>{label}</span>
      {right}
    </button>
  )
}

export function Sidebar() {
  const screen = useUI((st) => st.screen)
  const slim = useUI((st) => st.slim)
  const dark = useUI((st) => st.dark)
  const setScreen = useUI((st) => st.setScreen)
  const toggleSlim = useUI((st) => st.toggleSlim)
  const toggleTheme = useUI((st) => st.toggleTheme)

  const notes = useData((st) => st.notes)
  const srs = useData((st) => st.srs)
  const todos = useData((st) => st.todos)
  const watch = useData((st) => st.watch)
  const journal = useData((st) => st.journal)
  const doneToday = useData((st) => st.doneToday)

  const notesCount = notes.length
  const todosLeft = todos.filter((t) => !t.done).length
  const dueCount = notes.filter((n) => {
    const sr = srs[n.id]
    return sr && sr.due <= 0
  }).length
  const inReview = notes.filter((n) => srs[n.id]).length
  const reviewsWeek = 23 + doneToday
  const vaultFiles = notes.length + watch.length + journal.length + todos.length

  const width = screen === 'session' ? 0 : slim ? 64 : 236
  const go = (target: Screen) => () => setScreen(target)

  return (
    <aside
      className={`${s.sidebar} ${slim ? s.slim : ''}`}
      style={{ width }}
    >
      {/* Brand + collapse toggle */}
      <div className={s.header}>
        {!slim && (
          <div className={s.brand}>
            <div className={s.brandName}>
              Noto<span className={s.brandDot}>.</span>
            </div>
            <div className={s.brandTag}>notes that stay</div>
          </div>
        )}
        <button
          type="button"
          className={s.collapse}
          onClick={toggleSlim}
          title={slim ? 'Expand sidebar' : 'Collapse sidebar — immersive mode'}
          aria-label={slim ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Caret className={s.caret} />
        </button>
      </div>

      {/* Today */}
      <div className={s.navGroup}>
        <NavItem
          icon={<TodayIcon />}
          label="Today"
          active={isActive('today', screen)}
          onClick={go('today')}
        />
      </div>

      {/* Workspace */}
      <div className={s.section}>
        <div className={s.sectionLabel}>Workspace</div>
        <div className={s.sectionInner}>
          <NavItem
            icon={<NotesIcon />}
            label="Notes"
            active={isActive('notes', screen)}
            onClick={go('notes')}
            right={<span className={s.count}>{notesCount}</span>}
          />
          <NavItem
            icon={<JournalIcon />}
            label="Journal"
            active={isActive('journal', screen)}
            onClick={go('journal')}
          />
          <NavItem
            icon={<TodosIcon />}
            label="Todos"
            active={isActive('todos', screen)}
            onClick={go('todos')}
            right={<span className={s.count}>{todosLeft}</span>}
          />
          <NavItem
            icon={<WatchIcon />}
            label="Watch Later"
            active={isActive('watch', screen)}
            onClick={go('watch')}
          />
        </div>
      </div>

      {/* Memory */}
      <div className={s.section}>
        <div className={s.sectionLabel}>Memory</div>
        <div className={s.sectionInner}>
          <NavItem
            icon={<ReviewIcon />}
            label="Review"
            active={isActive('queue', screen)}
            onClick={go('queue')}
            right={
              dueCount > 0
                ? slim
                  ? <span className={s.dot} />
                  : <span className={s.badge}>{dueCount}</span>
                : undefined
            }
          />
        </div>
      </div>

      <div className={s.spacer} />

      {/* Footer */}
      <div className={s.footer}>
        <div className={s.vault}>
          {inReview} notes in review
          <br />
          {reviewsWeek} reviews this week
          <br />
          <span className={s.vaultAmber}>vault</span> · local-first ·{' '}
          {vaultFiles} files
        </div>

        {/* Search opens the ⌘K palette — wired in step 5. */}
        <button
          type="button"
          className={s.footBtn}
          title="Search everything · ⌘K"
        >
          <span className={s.footIcon}>
            <SearchIcon />
          </span>
          <span className={s.footLabel}>Search</span>
          <span className={s.kbd}>⌘K</span>
        </button>

        <button type="button" className={s.footBtn} onClick={toggleTheme}>
          <span className={s.footIcon}>
            <AppearanceIcon />
          </span>
          <span className={s.footLabel}>Appearance</span>
          <span className={s.themeLabel}>{dark ? 'dark' : 'light'}</span>
        </button>
      </div>
    </aside>
  )
}
