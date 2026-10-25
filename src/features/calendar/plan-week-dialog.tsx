import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarRange, Check, Loader2, Sparkles, Wand2 } from 'lucide-react'
import type { DateKey, WorkloadMode } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { addDaysKey, formatDateKey, formatDuration, startOfWeekKey } from '@/lib/dates'
import {
  planWeek,
  rebalanceWeek,
  type PlanProposal,
  type PlannerEventInput,
  type PlannerTask,
  type RebalanceMove,
} from '@/lib/scheduler/planner'
import { createPlannedCalendarEvents, moveCalendarEvents } from '@/lib/firebase/repositories/calendarEvents'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/controls'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/page'
import { notifyError, notifySaved } from '@/components/status'
import { cn, percent } from '@/lib/utils'

type PlannerMode = 'plan' | 'rebalance'

export function PlanWeekDialog({
  open,
  onOpenChange,
  initialWeekStart,
  initialTab = 'plan',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWeekStart: DateKey
  initialTab?: PlannerMode
}) {
  const { collections, settings, today, derived } = useWorkspaceData()
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const [weekStart, setWeekStart] = useState(() => startOfWeekKey(initialWeekStart, weekStartsOn))
  const [tab, setTab] = useState<PlannerMode>(initialTab)
  const [mode, setMode] = useState<WorkloadMode>('normal')
  const [includeGoals, setIncludeGoals] = useState(true)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [selectedMoves, setSelectedMoves] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setWeekStart(startOfWeekKey(initialWeekStart, weekStartsOn))
      setTab(initialTab)
      setExcluded(new Set())
      setSelectedMoves(new Set())
    }
  }, [open, initialWeekStart, initialTab, weekStartsOn])

  const weekEnd = addDaysKey(weekStart, 6)

  const weekEvents = useMemo(
    () =>
      collections.calendarEvents.filter(
        (event) => event.dateKey >= weekStart && event.dateKey <= weekEnd,
      ),
    [collections.calendarEvents, weekStart, weekEnd],
  )

  const plannerEvents = useMemo<PlannerEventInput[]>(
    () =>
      weekEvents.map((event) => ({
        id: event.id,
        dateKey: event.dateKey,
        estimatedMinutes: event.estimatedMinutes,
        countsTowardCapacity: event.countsTowardCapacity,
        status: event.status,
        userEdited: event.userEdited,
        seriesId: event.seriesId,
        linkedEntityType: event.linkedEntityType,
        linkedEntityId: event.linkedEntityId,
        title: event.title,
        startTime: event.startTime,
      })),
    [weekEvents],
  )

  const scheduledByTask = useMemo(() => {
    const map = new Map<string, number>()
    for (const event of weekEvents) {
      if (!event.linkedEntityType || !event.linkedEntityId) continue
      if (event.status === 'canceled' || event.status === 'skipped') continue
      if (!event.countsTowardCapacity) continue
      const key = `${event.linkedEntityType}:${event.linkedEntityId}`
      map.set(key, (map.get(key) ?? 0) + event.estimatedMinutes)
    }
    return map
  }, [weekEvents])

  const plannerTasks = useMemo<PlannerTask[]>(() => {
    const tasks: PlannerTask[] = []
    for (const assignment of collections.assignments) {
      if (
        assignment.archivedAt ||
        assignment.status === 'completed' ||
        assignment.status === 'submitted' ||
        assignment.status === 'deferred'
      ) {
        continue
      }
      tasks.push({
        entityType: 'assignment',
        entityId: assignment.id,
        title: assignment.title,
        subjectId: null,
        priority: assignment.priority,
        dueDate: assignment.dueDate,
        targetFinishDate: assignment.targetFinishDate,
        estimatedMinutes: assignment.estimatedMinutes,
        status: assignment.status,
        course: assignment.course,
        scheduledMinutesThisWeek: scheduledByTask.get(`assignment:${assignment.id}`) ?? 0,
      })
    }
    for (const project of collections.projects) {
      if (project.archivedAt || project.status === 'completed') continue
      for (const milestone of collections.milestones) {
        if (
          milestone.projectId !== project.id ||
          milestone.archivedAt ||
          milestone.status === 'completed' ||
          milestone.status === 'skipped'
        ) {
          continue
        }
        tasks.push({
          entityType: 'milestone',
          entityId: milestone.id,
          title: milestone.title,
          subjectId: project.subjectId,
          priority: project.priority,
          dueDate: milestone.dueDate,
          targetFinishDate: milestone.plannedDate,
          estimatedMinutes: milestone.estimatedMinutes,
          status: milestone.status,
          course: project.course,
          scheduledMinutesThisWeek: scheduledByTask.get(`milestone:${milestone.id}`) ?? 0,
        })
      }
    }
    for (const mission of collections.missions) {
      if (
        mission.archivedAt ||
        mission.status === 'completed' ||
        mission.status === 'skipped' ||
        mission.status === 'deferred'
      ) {
        continue
      }
      tasks.push({
        entityType: 'mission',
        entityId: mission.id,
        title: mission.title,
        subjectId: mission.subjectId,
        priority: mission.priority,
        dueDate: mission.dueDate,
        targetFinishDate: mission.plannedDate,
        estimatedMinutes: mission.estimatedMinutes,
        status: mission.status,
        scheduledMinutesThisWeek: scheduledByTask.get(`mission:${mission.id}`) ?? 0,
      })
    }
    return tasks
  }, [collections.assignments, collections.missions, collections.milestones, collections.projects, scheduledByTask])

  const result = useMemo(() => {
    if (!settings) return null
    return planWeek({
      weekStart,
      today,
      settings,
      mode,
      tasks: plannerTasks,
      existingEvents: plannerEvents,
      subjectGoals: (derived?.goals ?? []).map((goal) => ({
        subjectId: goal.subject.id,
        subjectName: goal.subject.name,
        target: goal.target,
        completed: goal.completed,
        color: goal.subject.color,
      })),
      includeStudyGoals: includeGoals,
    })
  }, [settings, weekStart, today, mode, plannerTasks, plannerEvents, derived?.goals, includeGoals])

  const rebalance = useMemo(() => {
    if (!settings) return null
    const deadlines = [
      ...collections.assignments.map((assignment) => ({
        linkedEntityType: 'assignment' as const,
        linkedEntityId: assignment.id,
        priority: assignment.priority,
        dueDate: assignment.dueDate,
        targetFinishDate: assignment.targetFinishDate,
      })),
      ...collections.missions.map((mission) => ({
        linkedEntityType: 'mission' as const,
        linkedEntityId: mission.id,
        priority: mission.priority,
        dueDate: mission.dueDate,
        targetFinishDate: mission.plannedDate,
      })),
      ...collections.milestones.map((milestone) => ({
        linkedEntityType: 'milestone' as const,
        linkedEntityId: milestone.id,
        priority: 'medium' as const,
        dueDate: milestone.dueDate,
        targetFinishDate: milestone.plannedDate,
      })),
    ]
    return rebalanceWeek({
      weekStart,
      today,
      settings,
      mode,
      events: plannerEvents,
      deadlines,
    })
  }, [settings, collections.assignments, collections.missions, collections.milestones, weekStart, today, mode, plannerEvents])

  const proposals = useMemo(
    () => (result?.proposals ?? []).filter((proposal) => !excluded.has(proposal.id)),
    [result?.proposals, excluded],
  )

  const proposalsByDay = useMemo(() => {
    const map = new Map<DateKey, PlanProposal[]>()
    proposals.forEach((proposal) => {
      const list = map.get(proposal.dateKey) ?? []
      list.push(proposal)
      map.set(proposal.dateKey, list)
    })
    return map
  }, [proposals])

  const moves = useMemo(
    () => (rebalance?.moves ?? []).filter((move) => selectedMoves.has(move.eventId)),
    [rebalance?.moves, selectedMoves],
  )

  useEffect(() => {
    if (tab !== 'rebalance' || !rebalance) return
    setSelectedMoves(new Set(rebalance.moves.map((move) => move.eventId)))
    // Only re-select when the proposed set itself changes, not when the user toggles a row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rebalance?.moves.map((move) => move.eventId).join(',')])

  const applyPlan = async () => {
    if (proposals.length === 0) return
    setSaving(true)
    try {
      const missionIdsWithEvents = new Set(
        weekEvents
          .filter((event) => event.linkedEntityType === 'mission' && event.linkedEntityId)
          .map((event) => event.linkedEntityId as string),
      )
      await createPlannedCalendarEvents(
        proposals.map((proposal) => ({
          dateKey: proposal.dateKey,
          estimatedMinutes: proposal.estimatedMinutes,
          title: proposal.title,
          eventType: proposal.eventType,
          subjectId: proposal.subjectId,
          linkedEntityType: proposal.linkedEntityType,
          linkedEntityId: proposal.linkedEntityId,
        })),
        [...missionIdsWithEvents],
      )
      notifySaved(
        `${proposals.length} ${proposals.length === 1 ? 'block' : 'blocks'} scheduled`,
        formatDuration(proposals.reduce((sum, item) => sum + item.estimatedMinutes, 0)),
      )
      onOpenChange(false)
    } catch (error) {
      notifyError(error)
    } finally {
      setSaving(false)
    }
  }

  const applyRebalance = async () => {
    if (moves.length === 0) return
    setSaving(true)
    try {
      await moveCalendarEvents(
        moves.map((move) => ({
          eventId: move.eventId,
          fromDate: move.fromDate,
          toDate: move.toDate,
        })),
      )
      notifySaved(
        `${moves.length} ${moves.length === 1 ? 'block' : 'blocks'} moved`,
        'Flexible blocks were rebalanced inside this week.',
      )
      onOpenChange(false)
    } catch (error) {
      notifyError(error)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return null
  const locale = settings.locale
  const totalProposed = proposals.reduce((sum, item) => sum + item.estimatedMinutes, 0)
  const warnings = tab === 'plan' ? result?.warnings ?? [] : rebalance?.warnings ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="sm:max-w-5xl">
        <DialogHeader
          eyebrow="Weekly planning"
          title="Make the week fit before it starts."
          description="The planner protects real deadlines, daily capacity, rest days, and subject coverage. Nothing is saved until you approve the blocks."
        />
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Previous week"
              onClick={() => setWeekStart((current) => addDaysKey(current, -7))}
            >
              <ArrowRight className="size-3.5 rotate-180" />
            </Button>
            <div className="min-w-36 text-center">
              <p className="text-[12px] font-medium text-fg">
                {formatDateKey(weekStart, locale, { month: 'short', day: 'numeric' })} –{' '}
                {formatDateKey(weekEnd, locale, { month: 'short', day: 'numeric' })}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                {weekStart === startOfWeekKey(today, weekStartsOn) ? 'This week' : 'Planning window'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Next week"
              onClick={() => setWeekStart((current) => addDaysKey(current, 7))}
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setWeekStart(startOfWeekKey(today, weekStartsOn))}
            >
              Today
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={(value) => {
                setTab(value)
                if (value === 'rebalance' && selectedMoves.size === 0) {
                  setSelectedMoves(new Set(rebalance?.moves.map((move) => move.eventId) ?? []))
                }
              }}
              options={[
                { value: 'plan', label: <><Sparkles className="size-3" /> Plan</> },
                { value: 'rebalance', label: <><Wand2 className="size-3" /> Rebalance</> },
              ]}
              ariaLabel="Planning mode"
            />
            <SelectMode mode={mode} onChange={setMode} />
          </div>
        </div>

        <DialogBody className="space-y-4">
          {tab === 'plan' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[11.5px] text-muted">
                    {proposals.length} proposed · {formatDuration(totalProposed)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIncludeGoals((value) => !value)}
                    className={cn(
                      'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium transition-colors',
                      includeGoals
                        ? 'border-lime/25 bg-lime/10 text-lime'
                        : 'border-line text-faint',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        includeGoals ? 'bg-lime' : 'bg-faint',
                      )}
                    />
                    Fill weekly study goals
                  </button>
                </div>
                <div className="flex gap-2">
                  {excluded.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExcluded(new Set())}
                      className="text-[10.5px] text-faint hover:text-muted"
                    >
                      Select all
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setExcluded(new Set((result?.proposals ?? []).map((item) => item.id)))
                      }
                      className="text-[10.5px] text-faint hover:text-muted"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {result?.days.map((day) => {
                  const dayProposals = proposalsByDay.get(day.dateKey) ?? []
                  const reserved = day.existingMinutes + dayProposals.reduce((sum, item) => sum + item.estimatedMinutes, 0)
                  const fill = percent(reserved, day.plannedCapacityMinutes || 1)
                  const over = reserved > day.plannedCapacityMinutes && day.plannedCapacityMinutes > 0
                  return (
                    <div
                      key={day.dateKey}
                      className={cn(
                        'flex min-h-36 flex-col rounded-xl border p-3',
                        day.isRest
                          ? 'border-info/15 bg-info/[0.035]'
                          : over
                            ? 'border-danger/25 bg-danger/[0.035]'
                            : 'border-line bg-surface-2/35',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11.5px] font-semibold text-fg">
                            {formatDateKey(day.dateKey, locale, { weekday: 'short', day: 'numeric' })}
                          </p>
                          <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                            {day.isRest
                              ? 'Rest day'
                              : day.isUnavailable
                                ? 'Unavailable'
                                : `${formatDuration(day.plannedCapacityMinutes)} capacity`}
                          </p>
                        </div>
                        <span className={cn('font-mono text-[9px]', over ? 'text-danger' : 'text-faint')}>
                          {formatDuration(reserved)}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, fill)}
                        tone={over ? 'danger' : day.isRest ? 'teal' : 'lime'}
                        size="sm"
                        className="mt-2.5"
                      />
                      <div className="mt-2 flex-1 space-y-1">
                        {dayProposals.length === 0 ? (
                          <p className="py-2 text-[10px] text-faint/80">
                            {day.isRest ? 'Protected.' : 'No new blocks.'}
                          </p>
                        ) : (
                          dayProposals.map((proposal) => (
                            <button
                              key={proposal.id}
                              type="button"
                              onClick={() =>
                                setExcluded((current) => new Set([...current, proposal.id]))
                              }
                              className="group flex w-full items-start gap-1.5 rounded-md border border-transparent px-1 py-1 text-left hover:border-line"
                            >
                              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-lime" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[10.5px] leading-snug text-fg/90">
                                  {proposal.title}
                                </span>
                                <span className="block truncate font-mono text-[8px] text-faint">
                                  {proposal.estimatedMinutes}m · {proposal.reason}
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {result?.goalOutcomes.some((goal) => goal.target > 0) ? (
                <div className="rounded-xl border border-line bg-surface/60 p-3.5">
                  <p className="mono-label mb-2.5">Weekly coverage after this plan</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {result.goalOutcomes.map((goal) => (
                      <div key={goal.subjectId} className="flex items-center gap-2">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: goal.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">
                          {goal.subjectName}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[9px]',
                            goal.projected >= goal.target ? 'text-lime' : 'text-warning',
                          )}
                        >
                          {goal.projected}/{goal.target}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-medium text-fg">
                      {rebalance?.moves.length ?? 0} flexible {rebalance?.moves.length === 1 ? 'block' : 'blocks'} can move
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
                      Only untouched plan blocks move. Locked, completed, recurring, and user-edited
                      blocks stay exactly where they are.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedMoves(
                          new Set(rebalance?.moves.map((move) => move.eventId) ?? []),
                        )
                      }
                      className="text-[10.5px] text-faint hover:text-muted"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMoves(new Set())}
                      className="text-[10.5px] text-faint hover:text-muted"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {rebalance && rebalance.moves.length > 0 ? (
                <div className="space-y-1.5">
                  {rebalance.moves.map((move) => (
                    <MoveRow
                      key={move.eventId}
                      move={move}
                      locale={locale}
                      checked={selectedMoves.has(move.eventId)}
                      onToggle={() =>
                        setSelectedMoves((current) => {
                          const next = new Set(current)
                          if (next.has(move.eventId)) next.delete(move.eventId)
                          else next.add(move.eventId)
                          return next
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface/50 px-5 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-lime/20 bg-lime/[0.06] text-lime">
                    <Check className="size-4" />
                  </span>
                  <p className="text-[12.5px] font-medium">Nothing needs to move.</p>
                  <p className="max-w-sm text-[11px] leading-relaxed text-faint">
                    This week’s flexible load already fits the available capacity. Rest days and
                    deadlines are unchanged.
                  </p>
                </div>
              )}
            </>
          )}

          {warnings.length > 0 ? (
            <div className="space-y-1.5">
              {warnings.slice(0, 4).map((warning, index) => (
                <div
                  key={`${warning.code}-${index}`}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-[10.5px] leading-relaxed',
                    warning.severity === 'danger'
                      ? 'border-danger/20 bg-danger/[0.055] text-danger/90'
                      : 'border-warning/20 bg-warning/[0.05] text-warning/90',
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {tab === 'plan' ? (
            <Button
              variant="primary"
              onClick={applyPlan}
              disabled={saving || proposals.length === 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarRange className="size-4" />}
              Schedule {proposals.length || ''} {proposals.length === 1 ? 'block' : 'blocks'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={applyRebalance}
              disabled={saving || moves.length === 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Move {moves.length || ''} {moves.length === 1 ? 'block' : 'blocks'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectMode({
  mode,
  onChange,
}: {
  mode: WorkloadMode
  onChange: (mode: WorkloadMode) => void
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-line bg-surface-2/60 p-0.5">
      {(
        [
          { value: 'light', label: 'Light' },
          { value: 'normal', label: 'Normal' },
          { value: 'intensive', label: 'Intensive' },
        ] as Array<{ value: WorkloadMode; label: string }>
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded-[7px] px-2.5 text-[10.5px] font-medium transition-colors',
            mode === option.value
              ? 'bg-surface-3 text-fg'
              : 'text-faint hover:text-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function MoveRow({
  move,
  locale,
  checked,
  onToggle,
}: {
  move: RebalanceMove
  locale: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        checked ? 'border-lime/20 bg-lime/[0.04]' : 'border-line bg-surface-2/30 opacity-60',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-lime bg-lime text-[#0a0d08]' : 'border-line-strong',
        )}
      >
        {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-medium text-fg">{move.title}</span>
        <span className="mt-0.5 block truncate text-[10px] text-faint">{move.reason}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[9.5px] text-muted">
          {formatDateKey(move.fromDate, locale, { weekday: 'short', day: 'numeric' })}
          {' → '}
          {formatDateKey(move.toDate, locale, { weekday: 'short', day: 'numeric' })}
        </span>
        <span className="mt-0.5 block font-mono text-[8.5px] text-faint">
          {formatDuration(move.minutes)}
        </span>
      </span>
    </button>
  )
}
