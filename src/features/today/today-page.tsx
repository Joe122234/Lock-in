import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BatteryLow,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  FolderKanban,
  ListTodo,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Sun,
  Target,
  Timer,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  addDaysKey,
  daysBetween,
  deadlineLabel,
  formatDateKey,
  formatDuration,
  formatTime,
  formatTimeRange,
  getGreeting,
  getWeekday,
  minutesSinceMidnight,
  timeToMinutes,
  weekdayNarrow,
} from '@/lib/dates'
import { plannedCapacityForDay } from '@/lib/scheduler/planner'
import { completeTrackedEntity } from '@/lib/workspace/complete'
import { upsertCheckIn } from '@/lib/firebase/repositories/checkins'
import type { CalendarEvent, EnergyLevel, Weekday } from '@/types/domain'
import { PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, PanelLabel } from '@/components/ui/card'
import { Badge, SubjectBadge, SubjectDot } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown'
import { DeadlineTone, PriorityBadge, notifyError } from '@/components/status'
import { FocusSessionDialog, type FocusTarget } from '@/features/focus/focus-session'
import { useWorkspace } from '@/providers/workspace-provider'
import { cn } from '@/lib/utils'

const ENERGY_OPTIONS: Array<{ value: EnergyLevel; label: string; icon: typeof Zap }> = [
  { value: 'low', label: 'Low', icon: BatteryLow },
  { value: 'normal', label: 'Normal', icon: Zap },
  { value: 'high', label: 'High', icon: Flame },
]

function weekDots(
  days: Array<{ dateKey: string; studyActive: boolean; rest: boolean; active: boolean }>,
  today: string,
) {
  const map = new Map(days.map((day) => [day.dateKey, day]))
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysKey(today, index - 6)
    const day = map.get(dateKey)
    return {
      dateKey,
      study: day?.studyActive ?? false,
      rest: day?.rest ?? false,
      active: day?.active ?? false,
      isToday: dateKey === today,
      weekday: weekdayNarrow((new Date(`${dateKey}T12:00:00`).getDay() as Weekday), 'en-US'),
      dayNumber: Number(dateKey.slice(8, 10)),
    }
  })
}

export function TodayPage() {
  const workspace = useWorkspaceData()
  const { settings, derived, collections, today, getSubject } = workspace
  const { sync } = useWorkspace()
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [checkInSaving, setCheckInSaving] = useState(false)
  const [reflection, setReflection] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const timezone = settings?.timezone ?? 'UTC'
  const [nowMinutes, setNowMinutes] = useState(() => minutesSinceMidnight(timezone))
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const reflectionRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const update = () => setNowMinutes(minutesSinceMidnight(timezone))
    update()
    const interval = window.setInterval(update, 30_000)
    return () => window.clearInterval(interval)
  }, [timezone])

  useEffect(() => {
    const key = `lock-in:nudge-dismissed:${today}`
    setNudgeDismissed(window.localStorage.getItem(key) === '1')
  }, [today])

  if (!settings || !derived) return null
  const { locale } = settings
  const checkIn = collections.checkIns.find((item) => item.dateKey === today) ?? null
  const scheduledRest = settings.weeklyRestDay !== null && getWeekday(today) === settings.weeklyRestDay
  const mode = checkIn?.workloadMode ?? (scheduledRest ? 'rest' : 'normal')
  const energy = checkIn?.energy ?? null
  const isRest = mode === 'rest'
  const lowEnergy = mode === 'lowEnergy'
  const nudgeTime = timeToMinutes(settings.reminders.dailyNudgeTime)
  const nudgeDue =
    settings.reminders.inAppEnabled &&
    settings.reminders.dailyNudgeEnabled &&
    nudgeTime !== null &&
    nowMinutes >= nudgeTime &&
    !isRest &&
    !nudgeDismissed &&
    !checkIn?.reflection?.trim()

  const dismissNudge = () => {
    window.localStorage.setItem(`lock-in:nudge-dismissed:${today}`, '1')
    setNudgeDismissed(true)
  }

  const openReflection = () => {
    reflectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => reflectionRef.current?.focus(), 300)
  }

  const openQueue = derived.queue.filter((task) => !task.overdue || task.status !== 'completed')
  const focusTask = lowEnergy
    ? openQueue.find((task) => task.estimatedMinutes <= 30) ?? openQueue[0]
    : openQueue[0]

  const focusSubject = focusTask ? getSubject(focusTask.subjectId) : null
  const greeting = getGreeting(settings.timezone, locale)

  const capacityMode = isRest ? 'light' : lowEnergy ? 'light' : 'normal'
  const dayCapacity = plannedCapacityForDay(today, settings, capacityMode)
  const plannedMinutes = derived.todayEvents
    .filter((event) => event.countsTowardCapacity && event.status !== 'canceled' && event.status !== 'skipped')
    .reduce((sum, event) => sum + event.estimatedMinutes, 0)
  const totalGoalTarget = derived.goals.reduce((sum, goal) => sum + goal.target, 0)
  const totalGoalDone = derived.goals.reduce((sum, goal) => sum + Math.min(goal.completed, goal.target), 0)
  const satDate = settings.targetSatDate
  const satDays = satDate ? daysBetween(today, satDate) : null
  const latestPractice = [...collections.practiceRecords].sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0]
  const dots = weekDots(derived.streakDays, today)
  const atRiskProjects = derived.projects.filter((item) => item.progress.atRisk).slice(0, 3)
  const upcomingProjects = (atRiskProjects.length > 0 ? atRiskProjects : derived.projects.filter((item) => item.project.status !== 'completed')).slice(0, 3)

  const completeTask = async (task: NonNullable<typeof focusTask>, minutes?: number) => {
    setCompletingId(task.entityId)
    try {
      await completeTrackedEntity({
        entityType: task.entityType,
        entityId: task.entityId,
        dateKey: today,
        actualMinutes: minutes,
      })
      toast.success('Marked complete', { description: task.title })
    } catch (error) {
      notifyError(error)
    } finally {
      setCompletingId(null)
    }
  }

  const completeEvent = async (event: CalendarEvent) => {
    setCompletingId(event.id)
    try {
      if (
        event.linkedEntityId &&
        (event.linkedEntityType === 'mission' ||
          event.linkedEntityType === 'assignment' ||
          event.linkedEntityType === 'milestone')
      ) {
        await completeTrackedEntity({
          entityType: event.linkedEntityType,
          entityId: event.linkedEntityId,
          dateKey: today,
          actualMinutes: event.estimatedMinutes,
        })
      } else {
        await completeTrackedEntity({
          entityType: 'calendarEvent',
          entityId: event.id,
          dateKey: today,
        })
      }
      toast.success('Block complete', { description: event.title })
    } catch (error) {
      notifyError(error)
    } finally {
      setCompletingId(null)
    }
  }

  const saveCheckIn = async (next: {
    energy?: EnergyLevel | null
    workloadMode?: 'normal' | 'lowEnergy' | 'rest'
    reflection?: string
  }) => {
    setCheckInSaving(true)
    try {
      await upsertCheckIn(today, {
        energy: next.energy !== undefined ? next.energy : energy,
        workloadMode: next.workloadMode ?? mode,
        reflection: next.reflection !== undefined ? next.reflection : checkIn?.reflection ?? '',
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setCheckInSaving(false)
    }
  }

  const openFocusForTask = (task: NonNullable<typeof focusTask>) => {
    setFocusTarget({
      title: task.title,
      subtitle: `${workspace.subjectName(task.subjectId)}${task.course ? ` · ${task.course}` : ''}`,
      plannedMinutes: Math.max(10, task.estimatedMinutes || 25),
      color: workspace.subjectColor(task.subjectId),
      onComplete: async (minutes) => {
        await completeTrackedEntity({
          entityType: task.entityType,
          entityId: task.entityId,
          dateKey: today,
          actualMinutes: minutes,
        })
        toast.success('Session logged', {
          description: `${formatDuration(minutes)} of real focus.`,
        })
      },
    })
  }

  const openFocusForEvent = (event: CalendarEvent) => {
    setFocusTarget({
      title: event.title,
      subtitle: `${event.eventType === 'study' ? 'Study block' : event.eventType} · ${formatTimeRange(event.startTime, event.endTime, locale)}`,
      plannedMinutes: Math.max(10, event.estimatedMinutes),
      color: workspace.subjectColor(event.subjectId),
      onComplete: async (minutes) => {
        if (
          event.linkedEntityId &&
          (event.linkedEntityType === 'mission' ||
            event.linkedEntityType === 'assignment' ||
            event.linkedEntityType === 'milestone')
        ) {
          await completeTrackedEntity({
            entityType: event.linkedEntityType,
            entityId: event.linkedEntityId,
            dateKey: today,
            actualMinutes: minutes,
          })
        } else {
          await completeTrackedEntity({
            entityType: 'calendarEvent',
            entityId: event.id,
            dateKey: today,
          })
        }
        toast.success('Block logged')
      },
    })
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{formatDateKey(today, locale, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            <span className="text-line-strong">·</span>
            <span className="text-faint">{settings.workspaceName}</span>
          </span>
        }
        title={
          <>
            {greeting}. <span className="text-muted">{focusTask ? 'Here’s the next move.' : 'Protect the open space.'}</span>
          </>
        }
        description={
          isRest
            ? 'Rest is part of the plan today. Your streak is preserved unless you choose to work.'
            : lowEnergy
              ? 'Recovery mode is on. The plan is deliberately lighter — small, real progress only.'
              : 'One clear next move beats a crowded list. Everything else stays visible without taking over.'
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to="/calendar?plan=1">
                <CalendarDays className="size-3.5" />
                Plan week
              </Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/calendar">
                Today’s schedule
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </>
        }
      />

      {nudgeDue ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-lime/20 bg-lime/[0.045] px-4 py-3"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime/10 text-lime">
            <BellRing className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-fg">Daily check-in is open.</p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              You set this nudge for {formatTime(settings.reminders.dailyNudgeTime, locale)}. Log one
              line about how the day actually went.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={dismissNudge}>
              Dismiss
            </Button>
            <Button variant="primary" size="sm" onClick={openReflection}>
              Log reflection
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface/90 p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Study streak</span>
            <Flame className={cn('size-3.5', derived.streakStats.currentStudy > 0 ? 'text-lime' : 'text-faint')} />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-num text-[26px] font-semibold leading-none">{derived.streakStats.currentStudy}</span>
            <span className="text-[10px] text-faint">days</span>
          </div>
          <div className="mt-3 flex justify-between gap-1">
            {dots.map((dot) => (
              <div key={dot.dateKey} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    'flex aspect-square w-full max-w-5 items-center justify-center rounded-[4px] border text-[7px]',
                    dot.study
                      ? 'border-lime/30 bg-lime/80 text-[#0a0d08]'
                      : dot.rest
                        ? 'border-info/20 bg-info/10 text-info/70'
                        : dot.active
                          ? 'border-lime/25 bg-lime/20 text-lime'
                          : 'border-line bg-white/[0.03] text-transparent',
                  )}
                  title={`${dot.dateKey}${dot.study ? ' · study' : dot.rest ? ' · rest' : ''}`}
                />
                <span className={cn('font-mono text-[7.5px] uppercase', dot.isToday ? 'text-fg' : 'text-faint')}>
                  {dot.weekday}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface/90 p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">SAT countdown</span>
            <Target className="size-3.5 text-lime" />
          </div>
          {satDate && satDays !== null ? (
            <>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="font-num text-[26px] font-semibold leading-none text-lime">{Math.max(0, satDays)}</span>
                <span className="text-[10px] text-faint">days</span>
              </div>
              <p className="mt-2 text-[10px] text-faint">
                {formatDateKey(satDate, locale, { month: 'short', day: 'numeric' })}
                {latestPractice?.totalScore ? ` · last ${latestPractice.totalScore}` : ''}
              </p>
              <Link to="/study/sat" className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-medium text-lime/85 hover:text-lime">
                Open SAT prep <ChevronRight className="size-3" />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2.5 text-[12px] leading-snug text-muted">Set your official test date to start the countdown.</p>
              <Link to="/settings#dates" className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-lime/85 hover:text-lime">
                Add date <ChevronRight className="size-3" />
              </Link>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface/90 p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Logged this week</span>
            <Timer className="size-3.5 text-faint" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-num text-[26px] font-semibold leading-none">{Math.floor(derived.minutesThisWeek / 60)}</span>
            <span className="text-[10px] text-faint">h {derived.minutesThisWeek % 60}m</span>
          </div>
          <p className="mt-2 text-[10px] text-faint">
            {derived.streakStats.weeklyConsistency.qualifying}/{derived.streakStats.weeklyConsistency.eligible} qualifying days
          </p>
          <Progress value={derived.streakStats.weeklyConsistency.percent} size="sm" className="mt-2.5" />
        </div>

        <div className="rounded-2xl border border-line bg-surface/90 p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Weekly goals</span>
            <Sparkles className="size-3.5 text-faint" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-num text-[26px] font-semibold leading-none">{totalGoalDone}</span>
            <span className="text-[10px] text-faint">/ {totalGoalTarget} sessions</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {derived.goals.map((goal) => (
              <div key={goal.subject.id} className="flex items-center gap-1.5">
                <SubjectDot color={goal.subject.color} size={5} />
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${goal.percent}%`,
                      backgroundColor: goal.subject.color,
                    }}
                  />
                </div>
                <span className="font-mono text-[8px] text-faint">
                  {goal.completed}/{goal.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)] xl:gap-5">
        <div className="space-y-4 xl:space-y-5">
          <section
            className="relative overflow-hidden rounded-[22px] border border-lime/16 bg-[linear-gradient(135deg,rgba(198,247,74,0.065),rgba(14,17,15,0.6)_52%,rgba(14,17,15,0.95))] p-5 sm:p-6"
            aria-labelledby="next-move-title"
          >
            <div className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full bg-lime/[0.06] blur-3xl" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="mono-label flex items-center gap-1.5 text-lime/85">
                  <span className="size-1.5 rounded-full bg-lime pulse-dot" />
                  Next move
                </span>
                {lowEnergy ? <Badge tone="info">Recovery mode</Badge> : isRest ? <Badge tone="info">Rest day</Badge> : null}
              </div>

              {focusTask ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <SubjectBadge
                      name={focusSubject?.name ?? workspace.subjectName(focusTask.subjectId)}
                      color={focusSubject?.color ?? '#93a09a'}
                    />
                    <PriorityBadge priority={focusTask.priority} />
                    {focusTask.status === 'inProgress' ? <Badge tone="warning">In progress</Badge> : null}
                  </div>
                  <h2 id="next-move-title" className="mt-3 max-w-2xl text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.035em] sm:text-[28px]">
                    {focusTask.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="size-3.5 text-faint" />
                      {formatDuration(focusTask.estimatedMinutes)}
                    </span>
                    {focusTask.course ? <span>{focusTask.course}</span> : null}
                    {focusTask.actionDate ? (
                      <DeadlineTone tone={deadlineLabel(focusTask.actionDate, today, locale)?.tone ?? 'normal'}>
                        {deadlineLabel(focusTask.actionDate, today, locale)?.label}
                      </DeadlineTone>
                    ) : null}
                  </div>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button variant="primary" onClick={() => openFocusForTask(focusTask)} className="sm:min-w-36">
                      <Play className="size-4" />
                      Start focus
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void completeTask(focusTask)}
                      disabled={completingId === focusTask.entityId}
                    >
                      <Check className="size-4" />
                      {completingId === focusTask.entityId ? 'Saving…' : 'Mark done'}
                    </Button>
                    <Link
                      to={focusTask.href}
                      className="inline-flex h-10 items-center justify-center gap-1.5 px-2 text-[12px] text-muted hover:text-fg"
                    >
                      Open details <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                  <div className="mt-5 border-t border-line/80 pt-3.5">
                    <p className="mono-label mb-2">Why this</p>
                    <div className="flex flex-wrap gap-1.5">
                      {focusTask.reasons.map((reason) => (
                        <span key={reason} className="rounded-md border border-line bg-black/20 px-2 py-1 text-[10.5px] text-muted">
                          {reason}
                        </span>
                      ))}
                      {focusTask.goalDeficit ? (
                        <span className="rounded-md border border-lime/15 bg-lime/[0.06] px-2 py-1 text-[10.5px] text-lime/80">
                          weekly goal still open
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-4">
                  <h2 id="next-move-title" className="text-balance text-[24px] font-semibold tracking-[-0.035em] sm:text-[28px]">
                    Nothing is queued.
                  </h2>
                  <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-muted">
                    That is either a genuinely clear board or a sign it needs one real task. Add
                    homework, a study mission, or capture a loose end.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild variant="primary">
                      <Link to="/study">
                        <Plus className="size-4" />
                        Create a study mission
                      </Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link to="/assignments">
                        <ListTodo className="size-4" />
                        Add homework
                      </Link>
                    </Button>
                  </div>
                </div>
              )}

              {openQueue.length > 1 ? (
                <div className="mt-5 grid gap-1.5 border-t border-line/80 pt-3.5 sm:grid-cols-2">
                  {openQueue.slice(1, 3).map((task) => (
                    <Link
                      key={`${task.entityType}-${task.entityId}`}
                      to={task.href}
                      className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1.5 hover:border-line hover:bg-black/15"
                    >
                      <SubjectDot color={workspace.subjectColor(task.subjectId)} size={6} />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted group-hover:text-fg">
                        {task.title}
                      </span>
                      <span className="font-mono text-[9px] text-faint">{task.estimatedMinutes}m</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <Card>
            <CardHeader action={<Badge tone="neutral"><Clock3 className="size-3" /> {formatDuration(plannedMinutes)} planned</Badge>}>
              <PanelLabel right={<Link to="/calendar" className="text-[10.5px] text-faint hover:text-muted">Open calendar</Link>}>
                Today’s schedule
              </PanelLabel>
              <CardTitleRow title="The shape of the day." subtitle={`${derived.todayEvents.length} blocks · ${formatDuration(Math.max(0, plannedMinutes))} of ${formatDuration(dayCapacity.plannedCapacityMinutes)} capacity`} />
            </CardHeader>
            <CardBody className="p-3 pt-3 sm:p-4 sm:pt-3">
              {derived.todayEvents.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CalendarDays className="size-4" />}
                  title="No blocks scheduled."
                  description={isRest ? 'Deliberate rest is the plan. Leave it empty.' : 'Plan one realistic study or homework block instead of hoping the day creates itself.'}
                  action={!isRest ? <Button asChild size="sm" variant="secondary"><Link to="/calendar">Plan today</Link></Button> : undefined}
                />
              ) : (
                <div className="space-y-0.5">
                  {derived.todayEvents.map((event, index) => {
                    const done = event.status === 'completed'
                    const skipped = event.status === 'skipped' || event.status === 'canceled'
                    const color = workspace.subjectColor(event.subjectId)
                    const eventSubject = getSubject(event.subjectId)
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.025]',
                          (done || skipped) && 'opacity-55',
                        )}
                      >
                        <span className="w-11 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-faint">
                          {event.startTime ?? '—'}
                        </span>
                        <span className="h-8 w-[2px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <button
                          type="button"
                          onClick={() => void completeEvent(event)}
                          disabled={done || completingId === event.id}
                          aria-label={done ? 'Completed' : `Complete ${event.title}`}
                          className={cn(
                            'flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
                            done
                              ? 'border-lime bg-lime text-[#0a0d08]'
                              : 'border-line-strong bg-surface-2 text-transparent hover:border-lime/60 hover:text-lime/70',
                          )}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-[12.5px] font-medium', done && 'line-through')}>{event.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-faint">
                            <span>{formatTimeRange(event.startTime, event.endTime, locale)}</span>
                            {eventSubject ? (
                              <>
                                <span className="size-0.5 rounded-full bg-line-strong" />
                                <span style={{ color: eventSubject.color }}>{eventSubject.name}</span>
                              </>
                            ) : null}
                            {event.recurrenceRule ? <Badge tone="outline" className="h-4 px-1.5 text-[8.5px]">Recurring</Badge> : null}
                          </div>
                        </div>
                        <span className="hidden font-mono text-[9px] text-faint sm:block">{formatDuration(event.estimatedMinutes)}</span>
                        <button
                          type="button"
                          onClick={() => openFocusForEvent(event)}
                          disabled={done || skipped}
                          className="hidden size-7 items-center justify-center rounded-md text-faint hover:bg-white/5 hover:text-lime group-hover:flex"
                          aria-label={`Start focus for ${event.title}`}
                        >
                          <Play className="size-3.5" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`More actions for ${event.title}`}
                              className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-white/5 hover:text-fg"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem icon={<Play className="size-3.5" />} onSelect={() => openFocusForEvent(event)}>
                              Start focus
                            </DropdownMenuItem>
                            <DropdownMenuItem icon={<CheckCircle2 className="size-3.5" />} onSelect={() => void completeEvent(event)}>
                              Mark complete
                            </DropdownMenuItem>
                            <DropdownMenuItem icon={<CalendarDays className="size-3.5" />} onSelect={() => { window.location.href = '/calendar' }}>
                              Edit in calendar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {index < derived.todayEvents.length - 1 ? null : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:gap-5">
            <Card>
              <CardHeader action={<Link to="/assignments" className="text-[10.5px] text-faint hover:text-muted">All work</Link>}>
                <PanelLabel>Due soon</PanelLabel>
              </CardHeader>
              <CardBody className="p-3 pt-2.5">
                {derived.deadlines.length === 0 ? (
                  <EmptyState compact title="No deadlines on the horizon." description="Assignments and projects with real dates will surface here." />
                ) : (
                  <div className="space-y-0.5">
                    {derived.deadlines.slice(0, 5).map((item) => {
                      const label = deadlineLabel(item.targetFinishDate ?? item.dueDate, today, locale)
                      return (
                        <Link
                          key={`${item.entityType}-${item.entityId}`}
                          to={item.href}
                          className="flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-white/[0.03]"
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: workspace.subjectColor(item.subjectId) }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11.5px] text-fg/90">{item.title}</span>
                            <span className="mt-0.5 block truncate text-[9.5px] text-faint">{item.course ?? item.entityType}</span>
                          </span>
                          <DeadlineTone tone={label?.tone ?? 'normal'} className="text-right text-[9px]">
                            {label?.label ?? 'No date'}
                          </DeadlineTone>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader action={<Link to="/projects" className="text-[10.5px] text-faint hover:text-muted">All projects</Link>}>
                <PanelLabel>Project watch</PanelLabel>
              </CardHeader>
              <CardBody className="p-3 pt-2.5">
                {upcomingProjects.length === 0 ? (
                  <EmptyState compact title="No active projects." description="Larger deliverables will show their milestone progress and risk here." />
                ) : (
                  <div className="space-y-2.5">
                    {upcomingProjects.map(({ project, progress }) => (
                      <Link key={project.id} to={`/projects/${project.id}`} className="block rounded-lg px-1.5 py-1 hover:bg-white/[0.025]">
                        <div className="flex items-center gap-2">
                          <FolderKanban className="size-3.5 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{project.title}</span>
                          {progress.atRisk ? <Badge tone="warning" className="h-[18px] px-1.5 text-[8.5px]">At risk</Badge> : null}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress
                            value={progress.percent}
                            size="sm"
                            tone={progress.atRisk ? 'warning' : 'lime'}
                            className="flex-1"
                          />
                          <span className="font-mono text-[8.5px] text-faint">{progress.percent}%</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        <div className="space-y-4 xl:space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-white/[0.012] px-4 py-3">
              <PanelLabel>Daily check-in</PanelLabel>
              <span className={cn('flex items-center gap-1 text-[9.5px]', sync.phase === 'error' ? 'text-danger' : 'text-faint')}>
                {checkInSaving ? 'Saving…' : checkIn ? 'Saved to Firestore' : 'Not logged yet'}
              </span>
            </div>
            <CardBody className="space-y-4 p-4">
              <div>
                <p className="text-[11.5px] font-medium">Energy right now</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {ENERGY_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const active = energy === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void saveCheckIn({ energy: option.value })}
                        disabled={checkInSaving}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] transition-colors',
                          active
                            ? 'border-lime/35 bg-lime/10 text-lime'
                            : 'border-line bg-surface-2/40 text-faint hover:border-line-strong hover:text-muted',
                        )}
                      >
                        <Icon className="size-4" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-[11.5px] font-medium">How should today run?</p>
                <div className="mt-2 space-y-1.5">
                  {[
                    { value: 'normal', label: 'Normal day', detail: 'Use the full plan.', icon: Sun },
                    { value: 'lowEnergy', label: 'Low energy', detail: 'Shorter blocks, one priority.', icon: BatteryLow },
                    { value: 'rest', label: 'Rest day', detail: 'Protect the streak. Recover.', icon: Moon },
                  ].map((option) => {
                    const Icon = option.icon
                    const active = mode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void saveCheckIn({ workloadMode: option.value as 'normal' | 'lowEnergy' | 'rest' })}
                        disabled={checkInSaving}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-lime/30 bg-lime/[0.075]'
                            : 'border-line bg-surface-2/30 hover:border-line-strong',
                        )}
                      >
                        <Icon className={cn('size-4', active ? 'text-lime' : 'text-faint')} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-[11.5px] font-medium', active ? 'text-fg' : 'text-muted')}>{option.label}</span>
                          <span className="mt-0.5 block text-[9.5px] text-faint">{option.detail}</span>
                        </span>
                        {active ? <Check className="size-3.5 text-lime" /> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-medium">One-line reflection</p>
                  <span className="font-mono text-[8.5px] text-faint">optional</span>
                </div>
                <textarea
                  ref={reflectionRef}
                  value={reflection ?? checkIn?.reflection ?? ''}
                  onChange={(event) => setReflection(event.target.value)}
                  onBlur={() => {
                    if (reflection !== null) {
                      void saveCheckIn({ reflection })
                      setReflection(null)
                    }
                  }}
                  rows={2}
                  placeholder="What would make today count?"
                  className="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2/60 px-2.5 py-2 text-[11.5px] leading-relaxed placeholder:text-faint focus:border-lime/40 focus:outline-none"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader action={<Link to="/progress" className="text-[10.5px] text-faint hover:text-muted">Progress</Link>}>
              <PanelLabel>Subject coverage</PanelLabel>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">Weekly completed sessions against the goals you set.</p>
            </CardHeader>
            <CardBody className="space-y-3.5 p-4 pt-3">
              {derived.goals.map((goal) => (
                <Link key={goal.subject.id} to={`/study/${goal.subject.id}`} className="block group">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <SubjectDot color={goal.subject.color} size={6} />
                      <span className="truncate text-[11.5px] text-fg/90 group-hover:text-fg">{goal.subject.name}</span>
                    </span>
                    <span className="font-mono text-[9.5px] text-faint">{goal.completed}/{goal.target}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${goal.percent}%`, backgroundColor: goal.subject.color }}
                    />
                  </div>
                </Link>
              ))}
              {derived.goals.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-faint">No active subjects yet.</p>
              ) : null}
              <div className="flex items-center gap-1.5 border-t border-line pt-3 text-[10px] text-faint">
                <Target className="size-3" />
                Goals reset every {formatDateKey(addDaysKey(today, 0), locale, { weekday: 'long' })} week.
              </div>
            </CardBody>
          </Card>

          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <div className="flex items-start gap-2.5">
              <Settings2 className="mt-0.5 size-3.5 shrink-0 text-faint" />
              <div>
                <p className="text-[11px] font-medium text-muted">The system is editable.</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                  Capacity, rest days, goals, and streak rules all live in Settings. Change the plan
                  when life changes — not the record of what happened.
                </p>
                <Link to="/settings" className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-fg/75 hover:text-lime">
                  Open settings <ChevronRight className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FocusSessionDialog
        open={focusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFocusTarget(null)
        }}
        target={focusTarget}
      />
    </div>
  )
}

function CardTitleRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mt-1.5">
      <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h2>
      <p className="mt-1 text-[10.5px] text-faint">{subtitle}</p>
    </div>
  )
}
