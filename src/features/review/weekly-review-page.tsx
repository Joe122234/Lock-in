import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  History,
  ListTodo,
  Moon,
  NotebookPen,
  RotateCcw,
  Target,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import type {
  ActivityEvent,
  DateKey,
  WorkspaceCollections,
  WorkloadMode,
} from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { saveWeeklyReview } from '@/lib/firebase/repositories/checkins'
import { MISSION_TYPE_LABELS } from '@/lib/constants'
import {
  addDaysKey,
  endOfWeekKey,
  formatDateKey,
  formatDuration,
  formatWeekRange,
  isValidDateKey,
  startOfWeekKey,
} from '@/lib/dates'
import { plannedCapacityForDay } from '@/lib/scheduler/planner'
import { PageHeader, SectionHeader, SegmentedControl } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

const STUDY_KINDS = new Set<ActivityEvent['kind']>(['mission', 'studyBlock', 'practice'])
const COMPLETION_KINDS = new Set<ActivityEvent['kind']>(['mission', 'assignment', 'milestone'])

const WORKLOAD_LABELS: Record<WorkloadMode, string> = {
  light: 'Light',
  normal: 'Normal',
  intensive: 'Intensive',
}

const WORKLOAD_DESCRIPTIONS: Record<WorkloadMode, string> = {
  light: 'Protect recovery. Capacity is cut to roughly half.',
  normal: 'Steady week with some breathing room.',
  intensive: 'Push week — use only when the deadline is real.',
}

const OPEN_MISSION_STATUSES = new Set(['inbox', 'planned', 'inProgress', 'deferred'])
const OPEN_ASSIGNMENT_STATUSES = new Set(['inbox', 'planned', 'inProgress', 'deferred'])

interface OpenWorkItem {
  key: string
  entityType: 'mission' | 'assignment' | 'milestone' | 'project'
  title: string
  date: DateKey
  dateLabel: string
  meta: string
  subjectName: string | null
  color: string
  href: string
  estimatedMinutes: number
}

function inWeek(value: DateKey | null, start: DateKey, end: DateKey): value is DateKey {
  return value !== null && value >= start && value <= end
}

function pickWeekDate(
  primary: DateKey | null,
  primaryLabel: string,
  secondary: DateKey | null,
  secondaryLabel: string,
  start: DateKey,
  end: DateKey,
): { date: DateKey; label: string } | null {
  if (inWeek(primary, start, end)) return { date: primary, label: primaryLabel }
  if (inWeek(secondary, start, end)) return { date: secondary, label: secondaryLabel }
  return null
}

function buildOpenWorkItems(
  collections: WorkspaceCollections,
  start: DateKey,
  end: DateKey,
): OpenWorkItem[] {
  const items: OpenWorkItem[] = []
  const subjectById = new Map(collections.subjects.map((subject) => [subject.id, subject]))
  const projectById = new Map(collections.projects.map((project) => [project.id, project]))
  collections.missions.forEach((mission) => {
    if (mission.archivedAt || !OPEN_MISSION_STATUSES.has(mission.status)) return
    const picked = pickWeekDate(
      mission.plannedDate,
      'Planned',
      mission.dueDate,
      'Due',
      start,
      end,
    )
    if (!picked) return
    const subject = subjectById.get(mission.subjectId)
    items.push({
      key: `mission:${mission.id}`,
      entityType: 'mission',
      title: mission.title,
      date: picked.date,
      dateLabel: picked.label,
      meta: `${subject?.name ?? 'Study'} · ${MISSION_TYPE_LABELS[mission.missionType]}`,
      subjectName: subject?.name ?? null,
      color: subject?.color ?? '#c6f74a',
      href: `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`,
      estimatedMinutes: mission.estimatedMinutes,
    })
  })

  collections.assignments.forEach((assignment) => {
    if (assignment.archivedAt || !OPEN_ASSIGNMENT_STATUSES.has(assignment.status)) return
    const picked = pickWeekDate(
      assignment.targetFinishDate,
      'Target finish',
      assignment.dueDate,
      'Due',
      start,
      end,
    )
    if (!picked) return
    items.push({
      key: `assignment:${assignment.id}`,
      entityType: 'assignment',
      title: assignment.title,
      date: picked.date,
      dateLabel: picked.label,
      meta: assignment.course || 'Homework',
      subjectName: null,
      color: '#62a8ff',
      href: `/assignments?open=${encodeURIComponent(assignment.id)}`,
      estimatedMinutes: assignment.estimatedMinutes,
    })
  })

  collections.milestones.forEach((milestone) => {
    if (
      milestone.archivedAt ||
      milestone.status === 'completed' ||
      milestone.status === 'skipped'
    ) {
      return
    }
    const picked = pickWeekDate(
      milestone.plannedDate,
      'Planned',
      milestone.dueDate,
      'Due',
      start,
      end,
    )
    if (!picked) return
    const project = projectById.get(milestone.projectId)
    if (project?.archivedAt) return
    const subject = project?.subjectId ? subjectById.get(project.subjectId) : null
    items.push({
      key: `milestone:${milestone.id}`,
      entityType: 'milestone',
      title: milestone.title,
      date: picked.date,
      dateLabel: picked.label,
      meta: project ? `${project.title} · Milestone` : 'Project milestone',
      subjectName: subject?.name ?? null,
      color: subject?.color ?? '#b79cff',
      href: project
        ? `/projects/${encodeURIComponent(project.id)}?milestone=${encodeURIComponent(milestone.id)}`
        : '/projects',
      estimatedMinutes: milestone.estimatedMinutes,
    })
  })

  collections.projects.forEach((project) => {
    if (project.archivedAt || project.status === 'completed') return
    const picked = pickWeekDate(
      project.targetFinishDate,
      'Target finish',
      project.dueDate,
      'Due',
      start,
      end,
    )
    if (!picked) return
    const subject = project.subjectId ? subjectById.get(project.subjectId) : null
    items.push({
      key: `project:${project.id}`,
      entityType: 'project',
      title: project.title,
      date: picked.date,
      dateLabel: picked.label,
      meta: project.course || 'Project',
      subjectName: subject?.name ?? null,
      color: subject?.color ?? '#b79cff',
      href: `/projects/${encodeURIComponent(project.id)}`,
      estimatedMinutes: 0,
    })
  })

  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.title.localeCompare(b.title)
  })
}

function activityHref(
  activity: ActivityEvent,
  collections: WorkspaceCollections,
): string {
  if (activity.kind === 'mission') {
    return `/study/${encodeURIComponent(activity.subjectId ?? 'sat')}?mission=${encodeURIComponent(activity.entityId)}`
  }
  if (activity.kind === 'assignment') {
    return `/assignments?open=${encodeURIComponent(activity.entityId)}`
  }
  if (activity.kind === 'milestone') {
    const milestone = collections.milestones.find((item) => item.id === activity.entityId)
    return milestone
      ? `/projects/${encodeURIComponent(milestone.projectId)}?milestone=${encodeURIComponent(activity.entityId)}`
      : '/projects'
  }
  if (activity.kind === 'practice') return '/study/sat?tab=practice'
  return `/calendar?date=${activity.dateKey}`
}

const ACTIVITY_LABELS: Record<ActivityEvent['kind'], string> = {
  mission: 'Study mission',
  assignment: 'Homework',
  milestone: 'Project milestone',
  studyBlock: 'Study block',
  practice: 'SAT practice',
}

export function WeeklyReviewPage() {
  const { collections, settings, today, derived } = useWorkspaceData()
  const [searchParams, setSearchParams] = useSearchParams()
  const locale = settings?.locale ?? 'en-US'
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const currentWeekStart = startOfWeekKey(today, weekStartsOn)

  const requestedWeek = searchParams.get('week')
  const normalizedRequest =
    requestedWeek && isValidDateKey(requestedWeek)
      ? startOfWeekKey(requestedWeek, weekStartsOn)
      : null
  const weekStart =
    normalizedRequest && normalizedRequest <= currentWeekStart
      ? normalizedRequest
      : currentWeekStart
  const weekEnd = endOfWeekKey(weekStart, weekStartsOn)
  const isCurrentWeek = weekStart === currentWeekStart
  const existingReview =
    collections.weeklyReviews.find((review) => review.weekStartDate === weekStart) ?? null

  const [wins, setWins] = useState(existingReview?.wins ?? '')
  const [missed, setMissed] = useState(existingReview?.missed ?? '')
  const [weakTopics, setWeakTopics] = useState(existingReview?.weakTopics ?? '')
  const [adjustments, setAdjustments] = useState(existingReview?.adjustments ?? '')
  const [workload, setWorkload] = useState<WorkloadMode>(
    existingReview?.workloadNextWeek ?? 'normal',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWins(existingReview?.wins ?? '')
    setMissed(existingReview?.missed ?? '')
    setWeakTopics(existingReview?.weakTopics ?? '')
    setAdjustments(existingReview?.adjustments ?? '')
    setWorkload(existingReview?.workloadNextWeek ?? 'normal')
    setError(null)
    // Reset the form only when the reviewed week changes, not on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, existingReview?.id])

  const weekActivities = useMemo(
    () =>
      collections.activityEvents
        .filter(
          (activity) =>
            !activity.reversedAt &&
            activity.dateKey >= weekStart &&
            activity.dateKey <= weekEnd,
        )
        .sort((a, b) => {
          if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
          return b.occurredAt.getTime() - a.occurredAt.getTime()
        }),
    [collections.activityEvents, weekStart, weekEnd],
  )
  const meaningfulActivities = useMemo(
    () => weekActivities.filter((activity) => activity.meaningful),
    [weekActivities],
  )
  const studyActivities = useMemo(
    () => meaningfulActivities.filter((activity) => STUDY_KINDS.has(activity.kind)),
    [meaningfulActivities],
  )
  const completedMissions = weekActivities.filter((activity) => activity.kind === 'mission')
  const completedHomework = weekActivities.filter((activity) => activity.kind === 'assignment')
  const completedMilestones = weekActivities.filter((activity) => activity.kind === 'milestone')
  const completedItems = weekActivities.filter(
    (activity) =>
      COMPLETION_KINDS.has(activity.kind) || activity.kind === 'practice',
  )
  const studyMinutes = studyActivities.reduce((sum, activity) => sum + activity.minutes, 0)
  const activeDays = new Set(meaningfulActivities.map((activity) => activity.dateKey))
  const restDays = useMemo(() => {
    if (!settings) return 0
    const explicit = new Set(
      collections.calendarEvents
        .filter(
          (event) =>
            event.eventType === 'rest' &&
            event.status !== 'canceled' &&
            event.status !== 'skipped' &&
            event.dateKey >= weekStart &&
            event.dateKey <= weekEnd,
        )
        .map((event) => event.dateKey),
    )
    collections.checkIns.forEach((checkIn) => {
      if (
        checkIn.workloadMode === 'rest' &&
        checkIn.dateKey >= weekStart &&
        checkIn.dateKey <= weekEnd
      ) {
        explicit.add(checkIn.dateKey)
      }
    })
    if (settings.streakRules.preserveScheduledRestDays) {
      const dates = Array.from({ length: 7 }, (_, index) => addDaysKey(weekStart, index))
      dates.forEach((date) => {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
        const isWeekendRest =
          settings.weekendMode === 'rest' && (weekday === 0 || weekday === 6)
        if (settings.weeklyRestDay === weekday || isWeekendRest) explicit.add(date)
      })
    }
    return explicit.size
  }, [
    collections.calendarEvents,
    collections.checkIns,
    settings,
    weekStart,
    weekEnd,
  ])

  const previousWeekStart = addDaysKey(weekStart, -7)
  const previousWeekEnd = addDaysKey(weekStart, -1)
  const previousWeekMinutes = useMemo(
    () =>
      collections.activityEvents
        .filter(
          (activity) =>
            !activity.reversedAt &&
            activity.meaningful &&
            STUDY_KINDS.has(activity.kind) &&
            activity.dateKey >= previousWeekStart &&
            activity.dateKey <= previousWeekEnd,
        )
        .reduce((sum, activity) => sum + activity.minutes, 0),
    [collections.activityEvents, previousWeekStart, previousWeekEnd],
  )
  const studyDelta =
    previousWeekMinutes > 0
      ? Math.round(((studyMinutes - previousWeekMinutes) / previousWeekMinutes) * 100)
      : null

  const goalOutcomes = useMemo(() => {
    if (!settings) return []
    return [...collections.subjects]
      .filter((subject) => subject.active && !subject.archivedAt)
      .sort((a, b) => a.order - b.order)
      .map((subject) => {
        const target = settings.weeklyGoals[subject.id] ?? subject.weeklyTarget ?? 0
        const subjectActivities = studyActivities.filter(
          (activity) => activity.subjectId === subject.id,
        )
        const completed = subjectActivities.length
        return {
          subject,
          target,
          completed,
          remaining: Math.max(0, target - completed),
          percent: target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 100,
          minutes: subjectActivities.reduce((sum, activity) => sum + activity.minutes, 0),
        }
      })
  }, [collections.subjects, settings, studyActivities])
  const goalsMet = goalOutcomes.filter(
    (goal) => goal.target > 0 && goal.completed >= goal.target,
  ).length
  const goalsWithTargets = goalOutcomes.filter((goal) => goal.target > 0).length

  const openItems = useMemo(
    () =>
      buildOpenWorkItems(collections, weekStart, weekEnd),
    [collections, weekStart, weekEnd],
  )

  const nextWeekStart = addDaysKey(weekStart, 7)
  const nextWeekEnd = addDaysKey(nextWeekStart, 6)
  const nextWeekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysKey(nextWeekStart, index)),
    [nextWeekStart],
  )
  const nextWeekCapacity = useMemo(() => {
    if (!settings) return 0
    return nextWeekDates.reduce(
      (sum, date) =>
        sum + plannedCapacityForDay(date, settings, workload).plannedCapacityMinutes,
      0,
    )
  }, [nextWeekDates, settings, workload])
  const nextWeekEvents = useMemo(
    () =>
      collections.calendarEvents.filter(
        (event) =>
          event.dateKey >= nextWeekStart &&
          event.dateKey <= nextWeekEnd &&
          event.countsTowardCapacity &&
          event.status !== 'canceled' &&
          event.status !== 'skipped',
      ),
    [collections.calendarEvents, nextWeekStart, nextWeekEnd],
  )
  const scheduledNextWeekMinutes = nextWeekEvents.reduce(
    (sum, event) => sum + event.estimatedMinutes,
    0,
  )
  const nextWeekOpenItems = useMemo(
    () =>
      buildOpenWorkItems(collections, nextWeekStart, nextWeekEnd),
    [collections, nextWeekStart, nextWeekEnd],
  )
  const scheduledEntityKeys = useMemo(() => {
    const keys = new Set<string>()
    nextWeekEvents.forEach((event) => {
      if (event.linkedEntityType && event.linkedEntityId) {
        keys.add(`${event.linkedEntityType}:${event.linkedEntityId}`)
      }
    })
    return keys
  }, [nextWeekEvents])
  const unscheduledNextWeekItems = nextWeekOpenItems.filter(
    (item) => item.entityType !== 'project' && !scheduledEntityKeys.has(item.key),
  )
  const unscheduledNextWeekMinutes = unscheduledNextWeekItems.reduce(
    (sum, item) => sum + item.estimatedMinutes,
    0,
  )
  const nextWeekProjectDeadlines = nextWeekOpenItems.filter(
    (item) => item.entityType === 'project',
  ).length
  const projectedNextWeekMinutes = scheduledNextWeekMinutes + unscheduledNextWeekMinutes
  const nextWeekFill =
    nextWeekCapacity > 0
      ? Math.round((projectedNextWeekMinutes / nextWeekCapacity) * 100)
      : projectedNextWeekMinutes > 0
        ? 100
        : 0
  const nextWeekOverBy = Math.max(0, projectedNextWeekMinutes - nextWeekCapacity)
  const nextWeekFits = nextWeekOverBy === 0 && nextWeekCapacity > 0

  const savedReviews = useMemo(
    () =>
      [...collections.weeklyReviews].sort((a, b) =>
        b.weekStartDate.localeCompare(a.weekStartDate),
      ),
    [collections.weeklyReviews],
  )

  const isDirty =
    wins !== (existingReview?.wins ?? '') ||
    missed !== (existingReview?.missed ?? '') ||
    weakTopics !== (existingReview?.weakTopics ?? '') ||
    adjustments !== (existingReview?.adjustments ?? '') ||
    workload !== (existingReview?.workloadNextWeek ?? 'normal')

  const setWeek = (start: DateKey) => {
    const next = new URLSearchParams(searchParams)
    if (start === currentWeekStart) next.delete('week')
    else next.set('week', start)
    setSearchParams(next, { replace: true })
  }

  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      await saveWeeklyReview({
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        wins: wins.trim(),
        missed: missed.trim(),
        weakTopics: weakTopics.trim(),
        adjustments: adjustments.trim(),
        workloadNextWeek: workload,
        completedHomework: completedHomework.length,
        completedMissions: completedMissions.length,
        studyMinutes,
      })
      notifySaved(
        'Weekly review saved',
        `${formatWeekRange(weekStart, weekEnd, locale)} · snapshot recorded.`,
      )
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const resetDraft = () => {
    setWins(existingReview?.wins ?? '')
    setMissed(existingReview?.missed ?? '')
    setWeakTopics(existingReview?.weakTopics ?? '')
    setAdjustments(existingReview?.adjustments ?? '')
    setWorkload(existingReview?.workloadNextWeek ?? 'normal')
    setError(null)
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Close the loop"
        title="Weekly review"
        description="Look at what the week actually produced, name what broke, and set the next week's load before it sets itself."
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="iconSm"
              aria-label="Previous week"
              onClick={() => setWeek(addDaysKey(weekStart, -7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-40 rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 text-center">
              <p className="text-[11px] font-medium text-fg">
                {formatWeekRange(weekStart, weekEnd, locale)}
              </p>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
                {isCurrentWeek ? 'This week' : 'Past week'}
              </p>
            </div>
            <Button
              variant="secondary"
              size="iconSm"
              aria-label="Next week"
              disabled={isCurrentWeek}
              onClick={() => setWeek(addDaysKey(weekStart, 7))}
            >
              <ChevronRight className="size-4" />
            </Button>
            {!isCurrentWeek ? (
              <Button variant="ghost" size="sm" onClick={() => setWeek(currentWeekStart)}>
                <RotateCcw className="size-3.5" />
                This week
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <ReviewStat
          icon={<Clock3 className="size-3.5" />}
          label="Study time"
          value={formatDuration(studyMinutes)}
          detail={
            studyDelta === null
              ? previousWeekMinutes === 0
                ? 'No study logged last week'
                : 'No study logged this week'
              : `${studyDelta >= 0 ? '+' : ''}${studyDelta}% vs previous week`
          }
          tone={
            studyDelta !== null && studyDelta < 0
              ? 'warning'
              : studyMinutes > 0
                ? 'lime'
                : undefined
          }
        />
        <ReviewStat
          icon={<BookOpenCheck className="size-3.5" />}
          label="Missions done"
          value={completedMissions.length}
          detail={`${goalsMet}/${goalsWithTargets || 0} subject goals met`}
        />
        <ReviewStat
          icon={<CheckCircle2 className="size-3.5" />}
          label="Homework done"
          value={completedHomework.length}
          detail={
            completedMilestones.length > 0
              ? `+${completedMilestones.length} milestone${completedMilestones.length === 1 ? '' : 's'} shipped`
              : 'Completed homework items'
          }
        />
        <ReviewStat
          icon={<Flame className="size-3.5" />}
          label="Active days"
          value={`${activeDays.size}/7`}
          detail={
            restDays > 0
              ? `${restDays} protected rest ${restDays === 1 ? 'day' : 'days'}`
              : 'No protected rest days'
          }
          tone={activeDays.size >= 5 ? 'lime' : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <form
            onSubmit={save}
            className="overflow-hidden rounded-2xl border border-line bg-surface/75"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <NotebookPen className="size-3.5 text-lime" />
                  <h2 className="text-[13.5px] font-semibold">The honest debrief</h2>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                  Vague reviews produce vague weeks. Write what happened, not what should have.
                </p>
              </div>
              <Badge
                tone={
                  isDirty ? 'warning' : existingReview ? 'success' : 'outline'
                }
              >
                {isDirty
                  ? 'Unsaved edits'
                  : existingReview
                    ? 'Saved'
                    : 'Not saved'}
              </Badge>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field
                label="What actually moved?"
                hint="Finished work, better scores, a habit that held."
              >
                <Textarea
                  value={wins}
                  onChange={(input) => setWins(input.target.value)}
                  rows={3}
                  placeholder="e.g. Finished 4 SAT missions, logged 2 real practice sets, and kept Thursday clean."
                  className="min-h-24"
                />
              </Field>
              <Field
                label="What slipped — and why?"
                hint="Name the cause, not just the missing task."
              >
                <Textarea
                  value={missed}
                  onChange={(input) => setMissed(input.target.value)}
                  rows={3}
                  placeholder="e.g. The AP World reading was planned after 9pm; I moved it twice instead of shrinking it."
                  className="min-h-24"
                />
              </Field>
              <Field
                label="What still feels weak?"
                hint="Topics, question types, or a subject you avoided."
              >
                <Textarea
                  value={weakTopics}
                  onChange={(input) => setWeakTopics(input.target.value)}
                  rows={3}
                  placeholder="e.g. Systems of equations under time pressure; Unit 3 evidence for comparative governments."
                  className="min-h-24"
                />
              </Field>
              <Field
                label="What changes next week?"
                hint="One concrete adjustment beats five intentions."
              >
                <Textarea
                  value={adjustments}
                  onChange={(input) => setAdjustments(input.target.value)}
                  rows={3}
                  placeholder="e.g. Study before dinner on weekdays; put the SAT mistake review first on Tuesday."
                  className="min-h-24"
                />
              </Field>
            </div>

            <div className="border-t border-line px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-faint" />
                  <span className="text-[10px] text-faint">
                    Snapshot: {completedMissions.length} missions ·{' '}
                    {completedHomework.length} homework · {formatDuration(studyMinutes)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isDirty ? (
                    <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
                      <RotateCcw className="size-3.5" />
                      Discard
                    </Button>
                  ) : null}
                  <Button type="submit" variant="primary" size="sm" loading={saving}>
                    <NotebookPen className="size-3.5" />
                    {existingReview ? 'Update review' : 'Save review'}
                  </Button>
                </div>
              </div>
              {error ? (
                <p className="mt-3 rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11px] leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          </form>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface/70">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-lime" />
                  <h2 className="text-[13px] font-semibold">Completed this week</h2>
                </div>
                <Badge tone={completedItems.length > 0 ? 'lime' : 'outline'}>
                  {completedItems.length}
                </Badge>
              </div>
              {completedItems.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CheckCircle2 className="size-4" />}
                  title="Nothing completed in this week."
                  description="No history is backfilled. Finish something real and it will appear here."
                />
              ) : (
                <div className="divide-y divide-line">
                  {completedItems.slice(0, 8).map((activity) => (
                    <Link
                      key={activity.id}
                      to={activityHref(activity, collections)}
                      className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.025]"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            derived?.subjectById.get(activity.subjectId ?? '')?.color ??
                            '#8b9488',
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium text-fg/90">
                          {activity.entityTitle}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9px] text-faint">
                          <span>{ACTIVITY_LABELS[activity.kind]}</span>
                          <span>
                            {formatDateKey(activity.dateKey, locale, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          {activity.minutes > 0 ? (
                            <span className="font-mono">{formatDuration(activity.minutes)}</span>
                          ) : null}
                          {activity.practiceAttempted !== null &&
                          activity.practiceCorrect !== null ? (
                            <span className="font-mono">
                              {activity.practiceCorrect}/{activity.practiceAttempted}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                  {completedItems.length > 8 ? (
                    <p className="px-4 py-2 text-[9.5px] text-faint">
                      Showing the 8 most recent of {completedItems.length}. The counts above use all
                      of them.
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-surface/70">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <ListTodo className="size-3.5 text-warning" />
                  <h2 className="text-[13px] font-semibold">Left unfinished</h2>
                </div>
                <Badge tone={openItems.length > 0 ? 'warning' : 'outline'}>
                  {openItems.length}
                </Badge>
              </div>
              {openItems.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Target className="size-4" />}
                  title="No open work tied to this week."
                  description={
                    isCurrentWeek
                      ? 'The week is still running. Anything planned or due this week that is still open will show here.'
                      : 'Nothing scheduled or due in this week is still open. That is a clean week.'
                  }
                />
              ) : (
                <div className="divide-y divide-line">
                  {openItems.slice(0, 8).map((item) => (
                    <Link
                      key={item.key}
                      to={item.href}
                      className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.025]"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium text-fg/90">
                          {item.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9px] text-faint">
                          <span>{item.meta}</span>
                          <span className="font-mono">
                            {item.dateLabel}{' '}
                            {formatDateKey(item.date, locale, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          {item.estimatedMinutes > 0 ? (
                            <span className="font-mono">
                              {formatDuration(item.estimatedMinutes)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                  {openItems.length > 8 ? (
                    <p className="px-4 py-2 text-[9.5px] text-faint">
                      Showing 8 of {openItems.length} open items.
                    </p>
                  ) : null}
                </div>
              )}
              <div className="border-t border-line px-4 py-2.5">
                <p className="text-[9.5px] leading-relaxed text-faint">
                  Nothing is silently moved. Unfinished work stays where it is until you reschedule
                  it or decide it is not worth doing.
                </p>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-line bg-surface/70">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <History className="size-3.5 text-faint" />
                <h2 className="text-[13px] font-semibold">Review history</h2>
              </div>
              <span className="font-mono text-[9px] text-faint">
                {savedReviews.length} saved
              </span>
            </div>
            {savedReviews.length === 0 ? (
              <EmptyState
                compact
                icon={<NotebookPen className="size-4" />}
                title="No saved reviews yet."
                description="The first one is the baseline. Save it even if the week was messy."
              />
            ) : (
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {savedReviews.slice(0, 6).map((review) => {
                  const selected = review.weekStartDate === weekStart
                  return (
                    <Link
                      key={review.id}
                      to={`/review?week=${review.weekStartDate}`}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 transition-colors',
                        selected
                          ? 'border-lime/25 bg-lime/[0.045]'
                          : 'border-line bg-surface-2/30 hover:border-line-strong',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-medium text-fg/90">
                          {formatWeekRange(
                            review.weekStartDate,
                            review.weekEndDate,
                            locale,
                          )}
                        </p>
                        <Badge tone="outline">{WORKLOAD_LABELS[review.workloadNextWeek]}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[9.5px] leading-relaxed text-faint">
                        {review.wins || review.adjustments || 'Saved without a written reflection.'}
                      </p>
                      <p className="mt-1.5 font-mono text-[8.5px] text-faint/75">
                        {review.completedMissions} missions · {review.completedHomework} homework ·{' '}
                        {formatDuration(review.studyMinutes)}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface/75 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="size-3.5 text-lime" />
                <p className="mono-label">Weekly goals</p>
              </div>
              <span className="font-mono text-[9px] text-faint">
                {goalsMet}/{goalsWithTargets} met
              </span>
            </div>
            {goalOutcomes.length === 0 ? (
              <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                No active subjects. Add one in Settings to set weekly targets.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {goalOutcomes.map((goal) => (
                  <div key={goal.subject.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: goal.subject.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">
                        {goal.subject.name}
                      </span>
                      <span className="font-mono text-[9px] text-faint">
                        {goal.completed}/{goal.target}
                      </span>
                      <Badge
                        tone={
                          goal.target === 0
                            ? 'outline'
                            : goal.completed >= goal.target
                              ? 'success'
                              : goal.completed > 0
                                ? 'warning'
                                : 'neutral'
                        }
                      >
                        {goal.target === 0
                          ? 'No target'
                          : goal.completed >= goal.target
                            ? 'Met'
                            : `${goal.remaining} to go`}
                      </Badge>
                    </div>
                    <Progress
                      value={goal.percent}
                      tone={
                        goal.target > 0 && goal.completed >= goal.target ? 'teal' : 'lime'
                      }
                      size="sm"
                      className="mt-1.5"
                    />
                    <p className="mt-1 font-mono text-[8px] text-faint/75">
                      {goal.minutes > 0
                        ? `${formatDuration(goal.minutes)} of real study`
                        : 'No meaningful study activity'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 border-t border-line pt-2.5 text-[9.5px] leading-relaxed text-faint">
              Goals count meaningful study activities, matching the rest of the app. Targets live in
              Settings.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface/75 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3.5 text-warning" />
                <p className="mono-label">Next week's load</p>
              </div>
              <span className="font-mono text-[9px] text-faint">
                {formatDateKey(nextWeekStart, locale, { month: 'short', day: 'numeric' })} –{' '}
                {formatDateKey(nextWeekEnd, locale, { month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="mt-3">
              <SegmentedControl
                value={workload}
                onChange={setWorkload}
                size="sm"
                ariaLabel="Next week workload"
                className="w-full [&>button]:flex-1"
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'intensive', label: 'Intensive' },
                ]}
              />
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
                {WORKLOAD_DESCRIPTIONS[workload]}
              </p>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">Projected load</span>
                <span className="font-mono text-[9.5px] text-faint">
                  {formatDuration(projectedNextWeekMinutes)} / {formatDuration(nextWeekCapacity)}
                </span>
              </div>
              <Progress
                value={Math.min(100, nextWeekFill)}
                tone={nextWeekOverBy > 0 ? 'danger' : nextWeekFill > 85 ? 'warning' : 'lime'}
                size="sm"
                className="mt-1.5"
              />
            </div>

            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-faint">Planned capacity</span>
                <span className="font-mono text-muted">{formatDuration(nextWeekCapacity)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-faint">Already on the calendar</span>
                <span className="font-mono text-muted">
                  {formatDuration(scheduledNextWeekMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-faint">Unscheduled work</span>
                <span className="font-mono text-muted">
                  {unscheduledNextWeekItems.length} items ·{' '}
                  {formatDuration(unscheduledNextWeekMinutes)}
                </span>
              </div>
              {nextWeekProjectDeadlines > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-faint">Project deadlines</span>
                  <span className="font-mono text-muted">{nextWeekProjectDeadlines}</span>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                'mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2',
                nextWeekOverBy > 0
                  ? 'border-danger/16 bg-danger/[0.04]'
                  : nextWeekCapacity === 0
                    ? 'border-warning/16 bg-warning/[0.04]'
                    : 'border-teal/16 bg-teal/[0.04]',
              )}
            >
              {nextWeekOverBy > 0 ? (
                <TriangleAlert className="mt-0.5 size-3 shrink-0 text-danger" />
              ) : nextWeekCapacity === 0 ? (
                <Moon className="mt-0.5 size-3 shrink-0 text-warning" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-teal" />
              )}
              <p
                className={cn(
                  'text-[9.5px] leading-relaxed',
                  nextWeekOverBy > 0
                    ? 'text-danger/90'
                    : nextWeekCapacity === 0
                      ? 'text-warning/90'
                      : 'text-teal/90',
                )}
              >
                {nextWeekOverBy > 0
                  ? `Over capacity by ${formatDuration(nextWeekOverBy)}. Move work or lower the load — do not wait for the week to fail.`
                  : nextWeekCapacity === 0
                    ? 'No working capacity is configured for next week. Check rest days and capacity in Settings.'
                    : nextWeekFits
                      ? `Fits with ${formatDuration(nextWeekCapacity - projectedNextWeekMinutes)} of headroom. Leave some of it empty.`
                      : 'Load fits, but there is no slack. Keep the plan honest.'}
              </p>
            </div>

            <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
              <Link
                to={`/calendar?plan=1&date=${nextWeekStart}`}
              >
                <CalendarDays className="size-3.5" />
                Plan the week deliberately
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <p className="mt-1.5 text-center text-[8.5px] leading-relaxed text-faint/80">
              Workload mode applies to this review and the planner preview.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface/70 p-4">
            <div className="flex items-center gap-2">
              <Flame className="size-3.5 text-lime" />
              <p className="mono-label">Week facts</p>
            </div>
            <div className="mt-3 space-y-2 text-[10px]">
              <FactRow
                label="Meaningful activities"
                value={String(meaningfulActivities.length)}
              />
              <FactRow
                label="Study activities"
                value={String(studyActivities.length)}
              />
              <FactRow label="Missions completed" value={String(completedMissions.length)} />
              <FactRow label="Homework completed" value={String(completedHomework.length)} />
              <FactRow
                label="Milestones completed"
                value={String(completedMilestones.length)}
              />
              <FactRow
                label="Mistakes reviewed"
                value={String(
                  collections.mistakes.filter(
                    (mistake) =>
                      mistake.reviewedAt !== null &&
                      mistake.reviewedAt.toISOString().slice(0, 10) >= weekStart &&
                      mistake.reviewedAt.toISOString().slice(0, 10) <= weekEnd,
                  ).length,
                )}
              />
            </div>
            <p className="mt-3 border-t border-line pt-2.5 text-[9px] leading-relaxed text-faint">
              Counts are live. Reopening or reversing work changes them, because the history should
              tell the truth.
            </p>
          </section>

          {existingReview ? (
            <section className="rounded-2xl border border-line bg-surface/60 p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-3.5 text-faint" />
                <p className="mono-label">Saved snapshot</p>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Saved{' '}
                {existingReview.updatedAt.toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                . At save time it recorded {existingReview.completedMissions} missions,{' '}
                {existingReview.completedHomework} homework items, and{' '}
                {formatDuration(existingReview.studyMinutes)} of study.
              </p>
              {existingReview.completedMissions !== completedMissions.length ||
              existingReview.completedHomework !== completedHomework.length ||
              existingReview.studyMinutes !== studyMinutes ? (
                <p className="mt-2 rounded-lg border border-warning/15 bg-warning/[0.035] px-2.5 py-2 text-[9.5px] leading-relaxed text-warning/85">
                  The live week has changed since that snapshot. Saving again updates it.
                </p>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      <SectionHeader
        title="The rule"
        hint="A review is not a performance review"
        className="mb-0"
      />
      <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface/50 px-3.5 py-3">
        <Circle className="mt-0.5 size-3 shrink-0 text-lime/70" />
        <p className="max-w-3xl text-[10.5px] leading-relaxed text-faint">
          This page does not grade you, invent missed work, or auto-reschedule anything. It shows the
          week that happened, then gives you one place to decide the next one. If a task was not worth
          finishing, delete or archive it instead of carrying guilt forward.
        </p>
      </div>
    </div>
  )
}

function ReviewStat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  detail: string
  tone?: 'lime' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface/85 p-3.5 sm:p-4',
        tone === 'lime' ? 'border-lime/16' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5 text-faint">
        <span className={tone === 'lime' ? 'text-lime/80' : undefined}>{icon}</span>
        <p className="mono-label">{label}</p>
      </div>
      <p
        className={cn(
          'font-num mt-2.5 text-[24px] font-semibold leading-none tracking-[-0.02em]',
          tone === 'lime' && 'text-lime',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] leading-snug text-faint">{detail}</p>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line pb-1.5 last:border-0 last:pb-0">
      <span className="text-faint">{label}</span>
      <span className="font-mono text-muted">{value}</span>
    </div>
  )
}
