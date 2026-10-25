import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  ListChecks,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Assignment } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  archiveAssignment,
  bulkCompleteAssignments,
  bulkUpdateAssignments,
  completeAssignment,
  markAssignmentSubmitted,
  reopenAssignment,
} from '@/lib/firebase/repositories/assignments'
import {
  addDaysKey,
  deadlineLabel,
  formatDateKey,
  formatDuration,
} from '@/lib/dates'
import { PageHeader, SegmentedControl } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/dialog'
import { SearchInput } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { Checkbox } from '@/components/ui/controls'
import { DeadlineTone, PriorityBadge, notifyError, notifySaved } from '@/components/status'
import { FocusSessionDialog, type FocusTarget } from '@/features/focus/focus-session'
import { cn } from '@/lib/utils'
import { AssignmentEditor } from './assignment-editor'

type Tab = 'open' | 'upcoming' | 'completed' | 'all'
type Sort = 'due' | 'priority' | 'title' | 'minutes'

const OPEN_STATUSES = new Set(['inbox', 'planned', 'inProgress', 'deferred'])
const COMPLETE_STATUSES = new Set(['completed', 'submitted'])

export function AssignmentsPage() {
  const { collections, settings, today } = useWorkspaceData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('open')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('due')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)

  const locale = settings?.locale ?? 'en-US'
  const assignments = collections.assignments.filter((assignment) => !assignment.archivedAt)

  useEffect(() => {
    const id = searchParams.get('open')
    if (!id) return
    const match = assignments.find((assignment) => assignment.id === id)
    if (!match) return
    setEditing(match)
    setEditorOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    setSearchParams(next, { replace: true })
  }, [searchParams, assignments, setSearchParams])

  const stats = useMemo(() => {
    const open = assignments.filter((assignment) => OPEN_STATUSES.has(assignment.status))
    const weekEnd = addDaysKey(today, 7)
    const dueThisWeek = open.filter(
      (assignment) => assignment.dueDate && assignment.dueDate >= today && assignment.dueDate <= weekEnd,
    )
    const overdue = open.filter((assignment) => assignment.dueDate && assignment.dueDate < today)
    const complete = assignments.filter((assignment) => COMPLETE_STATUSES.has(assignment.status))
    const openMinutes = open.reduce((sum, assignment) => sum + assignment.estimatedMinutes, 0)
    return { open, dueThisWeek, overdue, complete, openMinutes }
  }, [assignments, today])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    let list = assignments.filter((assignment) => {
      if (tab === 'open') return OPEN_STATUSES.has(assignment.status)
      if (tab === 'completed') return COMPLETE_STATUSES.has(assignment.status)
      if (tab === 'upcoming') return OPEN_STATUSES.has(assignment.status) && assignment.dueDate
      return true
    })
    if (normalized) {
      list = list.filter(
        (assignment) =>
          assignment.title.toLowerCase().includes(normalized) ||
          assignment.course.toLowerCase().includes(normalized) ||
          assignment.description.toLowerCase().includes(normalized),
      )
    }
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 }
    return [...list].sort((a, b) => {
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority]
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'minutes') return b.estimatedMinutes - a.estimatedMinutes
      const aDate = a.targetFinishDate ?? a.dueDate ?? '9999-12-31'
      const bDate = b.targetFinishDate ?? b.dueDate ?? '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      return priorityRank[a.priority] - priorityRank[b.priority]
    })
  }, [assignments, tab, query, sort])

  const openIds = filtered.filter((a) => OPEN_STATUSES.has(a.status)).map((a) => a.id)
  const allSelected = openIds.length > 0 && openIds.every((id) => selected.has(id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected((current) => {
        const next = new Set(current)
        openIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((current) => new Set([...current, ...openIds]))
    }
  }

  const completeOne = async (assignment: Assignment) => {
    setBusyId(assignment.id)
    try {
      await completeAssignment(assignment.id, {
        dateKey: today,
        actualMinutes: null,
      })
      toast.success('Assignment complete', { description: assignment.title })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const reopen = async (assignment: Assignment) => {
    setBusyId(assignment.id)
    try {
      await reopenAssignment(assignment.id)
      notifySaved('Assignment reopened', 'The completion was reversed in your activity history.')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const submitWork = async (assignment: Assignment) => {
    setBusyId(assignment.id)
    try {
      await markAssignmentSubmitted(assignment.id)
      notifySaved('Marked submitted', assignment.title)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const archive = async (assignment: Assignment) => {
    setBusyId(assignment.id)
    try {
      await archiveAssignment(assignment.id)
      notifySaved('Assignment archived')
      setConfirmArchiveId(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const completeSelected = async () => {
    setBulkBusy(true)
    try {
      await bulkCompleteAssignments([...selected], today)
      notifySaved(`${selected.size} ${selected.size === 1 ? 'assignment' : 'assignments'} completed`)
      setSelected(new Set())
    } catch (error) {
      notifyError(error)
    } finally {
      setBulkBusy(false)
    }
  }

  const deferSelected = async () => {
    setBulkBusy(true)
    try {
      await bulkUpdateAssignments([...selected], { status: 'deferred', targetFinishDate: null })
      notifySaved(`${selected.size} deferred`, 'They stay in the queue, without a false date.')
      setSelected(new Set())
    } catch (error) {
      notifyError(error)
    } finally {
      setBulkBusy(false)
    }
  }

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const focus = (assignment: Assignment) => {
    setFocusTarget({
      title: assignment.title,
      subtitle: `${assignment.course}${assignment.dueDate ? ` · due ${formatDateKey(assignment.dueDate, locale)}` : ''}`,
      plannedMinutes: Math.max(10, assignment.estimatedMinutes || 25),
      color: '#62a8ff',
      onComplete: async (minutes) => {
        await completeAssignment(assignment.id, {
          dateKey: today,
          actualMinutes: minutes,
        })
        toast.success('Session logged', { description: `${formatDuration(minutes)} of real focus.` })
      },
    })
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Homework without the guesswork"
        title="Assignments"
        description="Separate the real due date from when you intend to finish. Nothing here pretends overdue work disappeared."
        actions={
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus className="size-3.5" />
            Add homework
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: 'Open work', value: stats.open.length, detail: `${formatDuration(stats.openMinutes)} estimated` },
          { label: 'Due within 7 days', value: stats.dueThisWeek.length, detail: 'Real deadlines', tone: stats.dueThisWeek.length > 0 ? 'warning' as const : undefined },
          { label: 'Overdue', value: stats.overdue.length, detail: stats.overdue.length > 0 ? 'Resume, do not rebuild' : 'Nothing late', tone: stats.overdue.length > 0 ? 'danger' as const : undefined },
          { label: 'Finished', value: stats.complete.length, detail: 'In your activity history' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
            <p className="mono-label">{stat.label}</p>
            <p
              className={cn(
                'font-num mt-2.5 text-[26px] font-semibold leading-none',
                stat.tone === 'danger' && 'text-danger',
                stat.tone === 'warning' && 'text-warning',
              )}
            >
              {stat.value}
            </p>
            <p className="mt-1.5 text-[10px] text-faint">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-surface/70">
        <div className="flex flex-col gap-2.5 border-b border-line p-3 sm:flex-row sm:items-center">
          <SegmentedControl
            value={tab}
            onChange={(value) => {
              setTab(value)
              setSelected(new Set())
            }}
            size="sm"
            className="w-full sm:w-auto"
            ariaLabel="Assignment filter"
            options={[
              { value: 'open', label: <>Open <span className="font-mono text-[9px] opacity-60">{stats.open.length}</span></> },
              { value: 'upcoming', label: 'Scheduled' },
              { value: 'completed', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onChange={(input) => setQuery(input.target.value)}
              placeholder="Search assignments or courses…"
              className="min-w-40 flex-1 sm:max-w-xs"
            />
            <select
              value={sort}
              onChange={(input) => setSort(input.target.value as Sort)}
              aria-label="Sort assignments"
              className="h-9 rounded-lg border border-line bg-surface-2/70 px-2 text-[11px] text-muted focus:border-lime/40 focus:outline-none"
            >
              <option value="due">Sort: next deadline</option>
              <option value="priority">Sort: priority</option>
              <option value="minutes">Sort: longest</option>
              <option value="title">Sort: title</option>
            </select>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-lime/15 bg-lime/[0.05] px-3 py-2">
            <span className="text-[11px] font-medium text-lime">
              {selected.size} selected
            </span>
            <Button variant="limeGhost" size="xs" onClick={completeSelected} disabled={bulkBusy}>
              <Check className="size-3" /> Mark complete
            </Button>
            <Button variant="ghost" size="xs" onClick={deferSelected} disabled={bulkBusy}>
              <CalendarClock className="size-3" /> Defer
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-[10.5px] text-faint hover:text-muted"
            >
              Clear
            </button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title={
              query
                ? 'No assignments match.'
                : tab === 'completed'
                  ? 'Nothing finished yet.'
                  : tab === 'open'
                    ? 'The homework queue is clear.'
                    : 'No assignments here.'
            }
            description={
              query
                ? 'Try a different title or course.'
                : tab === 'completed'
                  ? 'Completed and submitted work will collect here as proof of the work you did.'
                  : 'Add the real assignment with its due date. The queue will keep it visible until it is finished.'
            }
            action={
              !query && tab !== 'completed' ? (
                <Button variant="secondary" size="sm" onClick={openNew}>
                  <Plus className="size-3.5" /> Add homework
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[9.5px] text-faint">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                label="Select all open assignments"
              />
              <span className="font-mono uppercase tracking-[0.1em]">Select all</span>
              <span className="ml-auto">{filtered.length} shown</span>
            </div>
            <div className="divide-y divide-line">
              {filtered.map((assignment) => {
                const open = OPEN_STATUSES.has(assignment.status)
                const done = COMPLETE_STATUSES.has(assignment.status)
                const overdue = Boolean(assignment.dueDate && assignment.dueDate < today && open)
                const dueLabel = deadlineLabel(assignment.dueDate, today, locale)
                const targetLabel = deadlineLabel(assignment.targetFinishDate, today, locale)
                const checked = selected.has(assignment.id)
                const checklistDone = assignment.checklist.filter((item) => item.done).length
                return (
                  <div
                    key={assignment.id}
                    className={cn(
                      'group relative px-3 py-3 transition-colors sm:px-4',
                      checked || overdue ? 'bg-white/[0.015]' : 'hover:bg-white/[0.02]',
                      done && 'opacity-70',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {open ? (
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            setSelected((current) => {
                              const next = new Set(current)
                              if (value) next.add(assignment.id)
                              else next.delete(assignment.id)
                              return next
                            })
                          }
                          label={`Select ${assignment.title}`}
                          className="mt-0.5"
                        />
                      ) : (
                        <span className="mt-0.5 flex size-[18px] items-center justify-center rounded-full border border-lime/30 bg-lime/10 text-lime">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(assignment)
                            setEditorOpen(true)
                          }}
                          className="block w-full text-left"
                        >
                          <span className={cn('block text-[13px] font-medium leading-snug text-fg', done && 'line-through')}>
                            {assignment.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[10.5px] text-muted">{assignment.course}</span>
                            <PriorityBadge priority={assignment.priority} className="h-[18px] px-1.5 text-[9px]" />
                            {assignment.status === 'inProgress' ? <Badge tone="warning">In progress</Badge> : null}
                            {assignment.status === 'deferred' ? <Badge tone="outline">Deferred</Badge> : null}
                            {assignment.status === 'submitted' ? <Badge tone="success">Submitted</Badge> : null}
                          </span>
                        </button>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                          {assignment.dueDate ? (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">Due</span>
                              <DeadlineTone tone={dueLabel?.tone ?? 'normal'}>
                                {formatDateKey(assignment.dueDate, locale, { weekday: 'short', month: 'short', day: 'numeric' })}
                                {dueLabel?.tone === 'overdue' || dueLabel?.tone === 'urgent'
                                  ? ` · ${dueLabel.label}`
                                  : ''}
                              </DeadlineTone>
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">No due date</span>
                          )}
                          {assignment.targetFinishDate ? (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-faint">Finish</span>
                              <DeadlineTone tone={targetLabel?.tone === 'overdue' ? 'overdue' : 'normal'}>
                                {formatDateKey(assignment.targetFinishDate, locale, { month: 'short', day: 'numeric' })}
                              </DeadlineTone>
                            </span>
                          ) : null}
                          {assignment.estimatedMinutes > 0 ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                              <Clock3 className="size-2.5" /> {formatDuration(assignment.estimatedMinutes)}
                            </span>
                          ) : null}
                          {assignment.checklist.length > 0 ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                              <ListChecks className="size-2.5" /> {checklistDone}/{assignment.checklist.length}
                            </span>
                          ) : null}
                          {assignment.resourceLinks.length > 0 ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                              <ExternalLink className="size-2.5" /> {assignment.resourceLinks.length}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {open ? (
                          <>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => focus(assignment)}
                              aria-label={`Start focus for ${assignment.title}`}
                              className="hidden text-faint hover:text-lime sm:flex"
                            >
                              <Play className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => void completeOne(assignment)}
                              disabled={busyId === assignment.id}
                              aria-label={`Complete ${assignment.title}`}
                              className="text-faint hover:text-lime"
                            >
                              {busyId === assignment.id ? (
                                <span className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                              ) : (
                                <Circle className="size-4" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => void reopen(assignment)}
                            disabled={busyId === assignment.id}
                            aria-label={`Reopen ${assignment.title}`}
                            className="text-faint hover:text-warning"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`More actions for ${assignment.title}`}
                              className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-white/5 hover:text-fg"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>Assignment</DropdownMenuLabel>
                            <DropdownMenuItem
                              icon={<ChevronRight className="size-3.5" />}
                              onSelect={() => {
                                setEditing(assignment)
                                setEditorOpen(true)
                              }}
                            >
                              Edit details
                            </DropdownMenuItem>
                            {open ? (
                              <>
                                <DropdownMenuItem icon={<Play className="size-3.5" />} onSelect={() => focus(assignment)}>
                                  Start a focus session
                                </DropdownMenuItem>
                                <DropdownMenuItem icon={<CheckCircle2 className="size-3.5" />} onSelect={() => void completeOne(assignment)}>
                                  Mark complete
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  icon={<CalendarClock className="size-3.5" />}
                                  onSelect={() => {
                                    setEditing(assignment)
                                    setEditorOpen(true)
                                  }}
                                >
                                  Change target finish
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem icon={<RotateCcw className="size-3.5" />} onSelect={() => void reopen(assignment)}>
                                  Reopen
                                </DropdownMenuItem>
                                {assignment.status === 'completed' ? (
                                  <DropdownMenuItem icon={<Send className="size-3.5" />} onSelect={() => void submitWork(assignment)}>
                                    Mark submitted
                                  </DropdownMenuItem>
                                ) : null}
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              icon={<Archive className="size-3.5" />}
                              danger
                              onSelect={() => setConfirmArchiveId(assignment.id)}
                            >
                              Archive assignment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {assignment.checklist.length > 0 && !done ? (
                      <div className="mt-2.5 ml-6 hidden gap-1 sm:flex">
                        {assignment.checklist.slice(0, 4).map((item) => (
                          <span
                            key={item.id}
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[9px]',
                              item.done
                                ? 'border-lime/15 bg-lime/[0.05] text-lime/65 line-through'
                                : 'border-line bg-surface-2/40 text-faint',
                            )}
                          >
                            {item.label}
                          </span>
                        ))}
                        {assignment.checklist.length > 4 ? (
                          <span className="px-1 py-0.5 font-mono text-[9px] text-faint">
                            +{assignment.checklist.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <AssignmentEditor
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(false)
          if (!open) setEditing(null)
        }}
        assignment={editing}
        today={today}
      />

      <FocusSessionDialog
        open={focusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFocusTarget(null)
        }}
        target={focusTarget}
      />

      <ConfirmDialog
        open={confirmArchiveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmArchiveId(null)
        }}
        title={`Archive “${assignments.find((assignment) => assignment.id === confirmArchiveId)?.title ?? ''}”?`}
        description="It leaves the active queue but keeps its place in your activity history."
        confirmLabel="Archive"
        destructive
        loading={busyId === confirmArchiveId}
        onConfirm={() => {
          const match = assignments.find((assignment) => assignment.id === confirmArchiveId)
          if (match) void archive(match)
        }}
      />
    </div>
  )
}

