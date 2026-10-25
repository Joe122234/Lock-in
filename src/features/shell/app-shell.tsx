import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckSquare2,
  Flame,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Target,
} from 'lucide-react'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { KeyHint } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { formatDateKey, formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SyncErrorBanner, SyncIndicator } from './sync-indicator'
import { QuickAddDialog } from './quick-add'
import { CommandPalette } from './command-palette'

const PRIMARY_NAV = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/study', label: 'Study', icon: BookOpen },
]

const WORK_NAV = [
  { to: '/assignments', label: 'Assignments', icon: CheckSquare2, countKey: 'assignments' as const },
  { to: '/projects', label: 'Projects', icon: FolderKanban, countKey: 'projects' as const },
  { to: '/inbox', label: 'Inbox', icon: Inbox, countKey: 'inbox' as const },
]

const REFLECT_NAV = [
  { to: '/progress', label: 'Progress', icon: ChartNoAxesColumnIncreasing },
  { to: '/review', label: 'Weekly review', icon: NotebookPen },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_NAV = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/study', label: 'Study', icon: BookOpen },
  { to: '/assignments', label: 'Tasks', icon: CheckSquare2 },
  { to: '/progress', label: 'Progress', icon: ChartNoAxesColumnIncreasing },
]

function navClass(isActive: boolean) {
  return cn(
    'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors',
    isActive
      ? 'bg-lime/[0.09] text-fg'
      : 'text-muted hover:bg-white/[0.04] hover:text-fg',
  )
}

export function AppShell() {
  const { settings, derived, today } = useWorkspaceData()
  const navigate = useNavigate()
  const location = useLocation()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const locale = settings?.locale ?? 'en-US'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (typing) return
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        setQuickAddOpen(true)
      }
      if (event.key === '/') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const counts = {
    assignments: derived?.openAssignments.length ?? 0,
    projects: derived?.projects.filter((item) => item.project.status !== 'completed').length ?? 0,
    inbox: derived?.openInbox.length ?? 0,
  }
  const streak = derived?.streakStats.currentStudy ?? 0
  const consistency = derived?.streakStats.weeklyConsistency

  const pageTitle =
    [
      ['/calendar', 'Calendar'],
      ['/study', 'Study'],
      ['/assignments', 'Assignments'],
      ['/projects', 'Projects'],
      ['/inbox', 'Inbox'],
      ['/progress', 'Progress'],
      ['/review', 'Weekly review'],
      ['/settings', 'Settings'],
    ].find(([path]) => location.pathname.startsWith(path!))?.[1] ?? 'Today'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line bg-[#0a0d0a]/60 px-3 py-4 lg:flex">
        <div className="px-1.5">
          <Wordmark />
        </div>

        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className="mt-6 flex h-9 w-full items-center gap-2 rounded-lg border border-lime/20 bg-lime/[0.07] px-2.5 text-[12px] font-medium text-lime transition-colors hover:bg-lime/[0.12]"
        >
          <Plus className="size-3.5" />
          Quick capture
          <span className="ml-auto flex items-center gap-1">
            <KeyHint>N</KeyHint>
          </span>
        </button>

        <nav className="mt-6 space-y-5">
          <div>
            <p className="mono-label px-2.5 pb-1.5">Command</p>
            <div className="space-y-0.5">
              {PRIMARY_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => navClass(isActive)}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn('size-4', isActive ? 'text-lime' : 'text-faint')}
                        strokeWidth={1.8}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            <p className="mono-label px-2.5 pb-1.5">Work</p>
            <div className="space-y-0.5">
              {WORK_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navClass(isActive)}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn('size-4', isActive ? 'text-lime' : 'text-faint')}
                        strokeWidth={1.8}
                      />
                      {item.label}
                      {counts[item.countKey] > 0 ? (
                        <span className="ml-auto font-mono text-[9.5px] text-faint">
                          {counts[item.countKey]}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            <p className="mono-label px-2.5 pb-1.5">Reflect</p>
            <div className="space-y-0.5">
              {REFLECT_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navClass(isActive)}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn('size-4', isActive ? 'text-lime' : 'text-faint')}
                        strokeWidth={1.8}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        <div className="mt-auto space-y-2 pt-6">
          <div className="rounded-xl border border-line bg-surface/70 p-3">
            <div className="flex items-center justify-between">
              <span className="mono-label">Study streak</span>
              <Flame className={cn('size-3.5', streak > 0 ? 'text-lime' : 'text-faint')} />
            </div>
            <div className="mt-2 flex items-end gap-1.5">
              <span className="font-num text-[26px] font-semibold leading-none">
                {streak}
              </span>
              <span className="pb-0.5 text-[10.5px] text-faint">
                {streak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-faint">
              <span>7-day consistency</span>
              <span className="font-mono">{consistency?.percent ?? 0}%</span>
            </div>
            <Progress value={consistency?.percent ?? 0} size="sm" className="mt-1.5" />
          </div>
          <div className="flex items-center justify-between px-1">
            <SyncIndicator />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              v1.0
            </span>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0">
        <header className="glass sticky top-0 z-30 border-b border-line">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <span className="text-[12px] font-medium text-fg">
                {formatDateKey(today, locale, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span className="h-3 w-px bg-line-strong" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
                {derived ? `${formatDuration(derived.minutesThisWeek)} logged this week` : 'Loading'}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden h-8 w-56 items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 text-left text-[11.5px] text-faint transition-colors hover:border-line-strong hover:text-muted sm:flex xl:w-64"
              >
                <Search className="size-3.5" />
                <span className="flex-1">Search everything</span>
                <KeyHint>⌘K</KeyHint>
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.05] sm:hidden"
              >
                <Search className="size-4" />
              </button>
              <div className="hidden sm:block">
                <SyncIndicator compact />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setQuickAddOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More navigation"
                    className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.05] lg:hidden"
                  >
                    <Menu className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52">
                  <DropdownMenuLabel>{pageTitle}</DropdownMenuLabel>
                  <DropdownMenuItem
                    icon={<FolderKanban className="size-3.5" />}
                    onSelect={() => navigate('/projects')}
                  >
                    Projects
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Inbox className="size-3.5" />}
                    onSelect={() => navigate('/inbox')}
                  >
                    Inbox
                    {counts.inbox > 0 ? (
                      <span className="font-mono text-[9px] text-faint">{counts.inbox}</span>
                    ) : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<NotebookPen className="size-3.5" />}
                    onSelect={() => navigate('/review')}
                  >
                    Weekly review
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={<Target className="size-3.5" />}
                    onSelect={() => navigate('/study')}
                  >
                    Study subjects
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Settings className="size-3.5" />}
                    onSelect={() => navigate('/settings')}
                  >
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-[10px] text-faint">
                    <span>Firestore</span>
                    <SyncIndicator />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <SyncErrorBanner />

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-14">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[var(--safe-bottom)] lg:hidden">
        <div className="mx-auto grid h-[58px] max-w-lg grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 text-[9.5px] font-medium transition-colors',
                  isActive ? 'text-lime' : 'text-faint',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onQuickAdd={() => setQuickAddOpen(true)}
      />
    </div>
  )
}
