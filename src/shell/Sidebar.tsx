import type { ReactNode } from 'react'
import { useUI, type Screen } from '../store/ui'
import { useData } from '../store/data'
import { reviewsLastWeek } from '../lib/srs'
import { todayEpochDay } from '../lib/dates'
import {
  Caret,
  TodayIcon,
  NotesIcon,
  LoomIcon,
  JournalIcon,
  TodosIcon,
  WatchIcon,
  ReviewIcon,
  SearchIcon,
  AppearanceIcon,
  GearIcon,
  TrashIcon,
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
      // The label span is hidden in the collapsed icon rail (slim mode), leaving
      // an icon-only button — so name it explicitly for screen readers, and title
      // it so hovering an icon in the rail shows what it is.
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
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
  const sbOpen = useUI((st) => st.sbOpen)
  const dark = useUI((st) => st.dark)
  const setScreen = useUI((st) => st.setScreen)
  const setSelFolder = useUI((st) => st.setSelFolder)
  const toggleSlim = useUI((st) => st.toggleSlim)
  const toggleSidebar = useUI((st) => st.toggleSidebar)
  const toggleTheme = useUI((st) => st.toggleTheme)
  const openPalette = useUI((st) => st.openPalette)
  const openSettings = useUI((st) => st.openSettings)

  const notes = useData((st) => st.notes)
  const srs = useData((st) => st.srs)
  const todos = useData((st) => st.todos)
  const watch = useData((st) => st.watch)
  const journal = useData((st) => st.journal)
  const ledgerByDay = useData((st) => st.ledgerByDay)
  const trashCount = useData((st) => st.trash.length)

  const notesCount = notes.length
  const todosLeft = todos.filter((t) => !t.done).length
  const dueCount = notes.filter((n) => {
    const sr = srs[n.id]
    return sr && sr.due <= 0
  }).length
  const inReview = notes.filter((n) => srs[n.id]).length
  const reviewsWeek = reviewsLastWeek(ledgerByDay, todayEpochDay())
  const vaultFiles = notes.length + watch.length + journal.length + todos.length

  const width = screen === 'session' || !sbOpen ? 0 : slim ? 64 : 236
  const go = (target: Screen) => () => setScreen(target)

  // Caret cycles wide → icon rail → fully hidden (Obsidian-style focus mode);
  // the floating chip (or ⌘\) brings it back at full width.
  const collapseStep = () => {
    if (!slim) toggleSlim()
    else {
      toggleSlim()
      toggleSidebar()
    }
  }

  return (
    <>
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
          onClick={collapseStep}
          title={slim ? 'Hide sidebar — full screen · ⌘\\' : 'Collapse sidebar — immersive mode'}
          aria-label={slim ? 'Hide sidebar' : 'Collapse sidebar'}
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
            onClick={() => {
              setSelFolder('all')
              go('notes')()
            }}
            right={<span className={s.count}>{notesCount}</span>}
          />
          <NavItem
            icon={<LoomIcon />}
            label="Loom"
            active={isActive('loom', screen)}
            onClick={go('loom')}
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
          <NavItem
            icon={<TrashIcon size={16} />}
            label="Recently deleted"
            active={isActive('trash', screen)}
            onClick={go('trash')}
            right={trashCount > 0 ? <span className={s.count}>{trashCount}</span> : undefined}
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

        {/* Search opens the ⌘K palette. */}
        <button
          type="button"
          className={s.footBtn}
          onClick={openPalette}
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

        <button type="button" className={s.footBtn} onClick={openSettings} title="Settings">
          <span className={s.footIcon}>
            <GearIcon />
          </span>
          <span className={s.footLabel}>Settings</span>
        </button>
      </div>
    </aside>

    {/* Floating reopen chip — the only chrome left in full-screen mode. */}
    {!sbOpen && screen !== 'session' && (
      <button
        type="button"
        className={s.reopen}
        onClick={toggleSidebar}
        title="Open sidebar · ⌘\"
        aria-label="Open sidebar"
      >
        <Caret style={{ transform: 'rotate(180deg)' }} />
      </button>
    )}
    </>
  )
}
