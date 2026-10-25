import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckSquare2,
  CornerDownLeft,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Target,
} from 'lucide-react'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { SearchInput } from '@/components/ui/field'
import { SubjectDot } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ResultItem {
  id: string
  group: string
  title: string
  meta: string
  icon: React.ReactNode
  href: string
  color?: string
}

const QUICK_LINKS: ResultItem[] = [
  { id: 'page-today', group: 'Jump to', title: 'Today', meta: 'Command center', icon: <LayoutDashboard className="size-3.5" />, href: '/' },
  { id: 'page-calendar', group: 'Jump to', title: 'Calendar', meta: 'Plan the week', icon: <CalendarDays className="size-3.5" />, href: '/calendar' },
  { id: 'page-study', group: 'Jump to', title: 'Study', meta: 'Subjects and missions', icon: <BookOpen className="size-3.5" />, href: '/study' },
  { id: 'page-assignments', group: 'Jump to', title: 'Assignments', meta: 'Homework queue', icon: <CheckSquare2 className="size-3.5" />, href: '/assignments' },
  { id: 'page-projects', group: 'Jump to', title: 'Projects', meta: 'Milestones and delivery', icon: <FolderKanban className="size-3.5" />, href: '/projects' },
  { id: 'page-inbox', group: 'Jump to', title: 'Inbox', meta: 'Unprocessed capture', icon: <Inbox className="size-3.5" />, href: '/inbox' },
  { id: 'page-progress', group: 'Jump to', title: 'Progress', meta: 'Streaks and trends', icon: <ChartNoAxesColumnIncreasing className="size-3.5" />, href: '/progress' },
  { id: 'page-review', group: 'Jump to', title: 'Weekly review', meta: 'Close the loop', icon: <NotebookPen className="size-3.5" />, href: '/review' },
  { id: 'page-settings', group: 'Jump to', title: 'Settings', meta: 'Workspace controls', icon: <Settings className="size-3.5" />, href: '/settings' },
]

export function CommandPalette({
  open,
  onOpenChange,
  onQuickAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onQuickAdd: () => void
}) {
  const navigate = useNavigate()
  const { collections, subjectColor } = useWorkspaceData()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return QUICK_LINKS

    const items: ResultItem[] = []
    for (const subject of collections.subjects.filter((item) => item.active)) {
      if (subject.name.toLowerCase().includes(q)) {
        items.push({
          id: `subject-${subject.id}`,
          group: 'Subjects',
          title: subject.name,
          meta: 'Open subject',
          icon: <SubjectDot color={subject.color} size={7} />,
          href: `/study/${subject.id}`,
          color: subject.color,
        })
      }
    }
    for (const topic of collections.topics) {
      if (topic.archivedAt || !topic.name.toLowerCase().includes(q)) continue
      const subject = collections.subjects.find((item) => item.id === topic.subjectId)
      items.push({
        id: `topic-${topic.id}`,
        group: 'Topics',
        title: topic.name,
        meta: subject?.name ?? 'Topic',
        icon: <Target className="size-3.5" style={{ color: subject?.color }} />,
        href: `/study/${topic.subjectId}`,
      })
    }
    for (const mission of collections.missions) {
      if (mission.archivedAt || !mission.title.toLowerCase().includes(q)) continue
      items.push({
        id: `mission-${mission.id}`,
        group: 'Missions',
        title: mission.title,
        meta: collections.subjects.find((item) => item.id === mission.subjectId)?.name ?? 'Study',
        icon: <BookOpen className="size-3.5" />,
        href: `/study/${mission.subjectId}?mission=${mission.id}`,
        color: subjectColor(mission.subjectId),
      })
    }
    for (const assignment of collections.assignments) {
      if (assignment.archivedAt || !assignment.title.toLowerCase().includes(q)) continue
      items.push({
        id: `assignment-${assignment.id}`,
        group: 'Homework',
        title: assignment.title,
        meta: assignment.course || 'Assignment',
        icon: <CheckSquare2 className="size-3.5" />,
        href: `/assignments?open=${assignment.id}`,
      })
    }
    for (const project of collections.projects) {
      if (project.archivedAt || !project.title.toLowerCase().includes(q)) continue
      items.push({
        id: `project-${project.id}`,
        group: 'Projects',
        title: project.title,
        meta: project.course || 'Project',
        icon: <FolderKanban className="size-3.5" />,
        href: `/projects/${project.id}`,
      })
    }
    for (const inbox of collections.inboxItems) {
      if (inbox.convertedAt || !inbox.title.toLowerCase().includes(q)) continue
      items.push({
        id: `inbox-${inbox.id}`,
        group: 'Inbox',
        title: inbox.title,
        meta: 'Unprocessed',
        icon: <Inbox className="size-3.5" />,
        href: '/inbox',
      })
    }
    return items.slice(0, 18)
  }, [query, collections, subjectColor])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const choose = (item: ResultItem) => {
    onOpenChange(false)
    navigate(item.href)
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ResultItem[]>()
    results.forEach((item) => {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    })
    return [...map.entries()]
  }, [results])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        showClose={false}
        className="top-auto sm:top-[14%] sm:-translate-y-0"
      >
        <div className="border-b border-line px-4 py-3">
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) => Math.min(results.length - 1, index + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(0, index - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const item = results[activeIndex]
                if (item) choose(item)
              }
            }}
            placeholder="Search tasks, subjects, projects, or jump somewhere…"
            className="h-10 border-0 bg-transparent px-0 pl-8 text-[14px] focus:bg-transparent"
          />
        </div>
        <div ref={listRef} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl border border-line text-faint">
                <Search className="size-4" />
              </span>
              <div>
                <p className="text-[13px] font-medium">No matches for “{query}”</p>
                <p className="mt-1 text-[11.5px] text-faint">
                  Search titles, courses, topics, or projects.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  onQuickAdd()
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-lime/10 px-3 py-1.5 text-[11.5px] font-medium text-lime hover:bg-lime/15"
              >
                <Plus className="size-3.5" /> Capture something new
              </button>
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="mono-label px-2.5 py-2">{group}</p>
                {items.map((item) => {
                  const index = results.indexOf(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-result-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                        activeIndex === index ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]',
                      )}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2"
                        style={item.color ? { color: item.color, borderColor: `${item.color}2a` } : undefined}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-fg">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-faint">
                          {item.meta}
                        </span>
                      </span>
                      {activeIndex === index ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-faint" />
                      ) : (
                        <ArrowRight className="size-3.5 shrink-0 text-transparent" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] text-faint">
            <kbd className="rounded border border-line-strong px-1 font-mono text-[9px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-faint">
            <kbd className="rounded border border-line-strong px-1 font-mono text-[9px]">↵</kbd>
            open
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-faint">
            <kbd className="rounded border border-line-strong px-1 font-mono text-[9px]">esc</kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
