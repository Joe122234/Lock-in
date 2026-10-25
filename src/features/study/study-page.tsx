import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  ListTodo,
  NotebookPen,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Mission } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { completeMission } from '@/lib/firebase/repositories/missions'
import {
  addDaysKey,
  daysBetween,
  deadlineLabel,
  endOfWeekKey,
  formatDateKey,
  formatDuration,
  startOfWeekKey,
} from '@/lib/dates'
import { MISSION_TYPE_LABELS } from '@/lib/constants'
import { PageHeader, SectionHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge, SubjectDot } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { DeadlineTone } from '@/components/status'
import { SubjectIcon } from '@/components/subject-icon'
import { FocusSessionDialog, type FocusTarget } from '@/features/focus/focus-session'
import { cn } from '@/lib/utils'
import { MissionEditor } from './mission-editor'
import { MissionCompleteDialog } from './mission-complete-dialog'

export function StudyPage() {
  const navigate = useNavigate()
  const { collections, settings, today, derived } = useWorkspaceData()
  const [missionEditorOpen, setMissionEditorOpen] = useState(false)
  const [editingMission, setEditingMission] = useState<Mission | null>(null)
  const [completingMission, setCompletingMission] = useState<Mission | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)

  const locale = settings?.locale ?? 'en-US'
  const subjects = derived?.subjects ?? []
  const goals = derived?.goals ?? []
  const openMissions = useMemo(
    () =>
      collections.missions
        .filter(
          (mission) =>
            !mission.archivedAt &&
            mission.status !== 'completed' &&
            mission.status !== 'skipped',
        )
        .sort((a, b) => {
          const aDate = a.dueDate ?? a.plannedDate ?? '9999-12-31'
          const bDate = b.dueDate ?? b.plannedDate ?? '9999-12-31'
          if (aDate !== bDate) return aDate.localeCompare(bDate)
          return a.title.localeCompare(b.title)
        }),
    [collections.missions],
  )

  const weekStart = startOfWeekKey(today, settings?.weekStartsOn ?? 1)
  const weekEnd = endOfWeekKey(today, settings?.weekStartsOn ?? 1)
  const weekStudyActivities = useMemo(
    () =>
      collections.activityEvents.filter(
        (activity) =>
          !activity.reversedAt &&
          activity.meaningful &&
          activity.dateKey >= weekStart &&
          activity.dateKey <= weekEnd &&
          ['mission', 'studyBlock', 'practice'].includes(activity.kind),
      ),
    [collections.activityEvents, weekStart, weekEnd],
  )
  const completedThisWeek = weekStudyActivities.filter(
    (activity) => activity.kind === 'mission',
  ).length

  const activeTopics = collections.topics.filter((topic) => !topic.archivedAt)
  const confidentTopics = activeTopics.filter((topic) => topic.stage === 'confident').length

  const satFullTests = useMemo(
    () =>
      collections.practiceRecords
        .filter((record) => record.totalScore !== null)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [collections.practiceRecords],
  )
  const latestSatScore = satFullTests.at(-1)?.totalScore ?? null
  const bestSatScore =
    satFullTests.length > 0
      ? Math.max(...satFullTests.map((record) => record.totalScore ?? 0))
      : null

  const reviewsDue = useMemo(() => {
    const dueMissions = collections.missions
      .filter(
        (mission) =>
          !mission.archivedAt &&
          mission.reviewAgainDate !== null &&
          mission.reviewAgainDate <= addDaysKey(today, 3),
      )
      .map((mission) => ({
        kind: 'mission' as const,
        id: mission.id,
        title: mission.title,
        date: mission.reviewAgainDate as string,
        subjectId: mission.subjectId,
        href: `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`,
        overdue: (mission.reviewAgainDate as string) < today,
      }))
    const dueMistakes = collections.mistakes
      .filter(
        (mistake) =>
          mistake.status !== 'mastered' &&
          mistake.nextReviewDate !== null &&
          mistake.nextReviewDate <= addDaysKey(today, 3),
      )
      .map((mistake) => ({
        kind: 'mistake' as const,
        id: mistake.id,
        title: mistake.skill,
        date: mistake.nextReviewDate as string,
        subjectId: 'sat',
        href: '/study/sat?tab=mistakes',
        overdue: (mistake.nextReviewDate as string) < today,
      }))
    return [...dueMissions, ...dueMistakes].sort((a, b) => a.date.localeCompare(b.date))
  }, [collections.missions, collections.mistakes, today])

  const recentActivity = useMemo(
    () =>
      collections.activityEvents
        .filter(
          (activity) =>
            !activity.reversedAt &&
            activity.meaningful &&
            ['mission', 'practice', 'studyBlock'].includes(activity.kind),
        )
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 6),
    [collections.activityEvents],
  )

  const goalBySubject = new Map(goals.map((goal) => [goal.subject.id, goal]))
  const openBySubject = new Map<string, Mission[]>()
  openMissions.forEach((mission) => {
    const list = openBySubject.get(mission.subjectId) ?? []
    list.push(mission)
    openBySubject.set(mission.subjectId, list)
  })

  const overallGoalDone = goals.reduce((sum, goal) => sum + Math.min(goal.completed, goal.target), 0)
  const overallGoalTarget = goals.reduce((sum, goal) => sum + goal.target, 0)

  const startFocus = (mission: Mission) => {
    setFocusTarget({
      title: mission.title,
      subtitle: `${derived?.subjectById.get(mission.subjectId)?.name ?? 'Study'} · ${formatDuration(mission.estimatedMinutes)}`,
      plannedMinutes: Math.max(10, mission.estimatedMinutes || 30),
      color: derived?.subjectById.get(mission.subjectId)?.color ?? '#c6f74a',
      onComplete: async (minutes) => {
        await completeMission(mission.id, { dateKey: today, actualMinutes: minutes })
        toast.success('Mission complete', {
          description: `${minutes} real minutes logged.`,
        })
      },
    })
  }

  const firstMission = openMissions[0] ?? null

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Inputs, not intentions"
        title="Study"
        description="Every subject has a real target, a topic map, and a queue of concrete missions. Progress is earned by finished work."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingMission(null)
                setMissionEditorOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              New mission
            </Button>
            {firstMission ? (
              <Button variant="primary" size="sm" onClick={() => startFocus(firstMission)}>
                <Play className="size-3.5" />
                Start focus
              </Button>
            ) : null}
          </>
        }
      />

      {settings?.targetSatDate ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-lime/15 bg-lime/[0.035] px-3.5 py-2.5">
          <Target className="size-3.5 text-lime" />
          <span className="text-[11.5px] font-medium text-lime">
            SAT on {formatDateKey(settings.targetSatDate, locale, { month: 'long', day: 'numeric' })}
          </span>
          <span className="text-[10.5px] text-faint">
            {daysBetween(today, settings.targetSatDate) >= 0
              ? `${daysBetween(today, settings.targetSatDate)} days to build the score.`
              : 'Target date has passed — set a new date in Settings.'}
          </span>
          <Link
            to="/study/sat"
            className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-lime/80 hover:text-lime"
          >
            SAT workspace <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatBlock
          label="Missions this week"
          value={completedThisWeek}
          detail={
            overallGoalTarget > 0
              ? `${overallGoalDone}/${overallGoalTarget} across subject goals`
              : 'Set weekly targets in Settings'
          }
        />
        <StatBlock
          label="Studied this week"
          value={formatDuration(derived?.minutesThisWeek ?? 0)}
          detail="Only completed study time"
        />
        <StatBlock
          label="Open missions"
          value={openMissions.length}
          detail={
            openMissions.filter(
              (mission) => mission.plannedDate !== null && mission.plannedDate < today,
            ).length > 0
              ? `${openMissions.filter((mission) => mission.plannedDate !== null && mission.plannedDate < today).length} past their planned day`
              : 'Queue is current'
          }
          tone={
            openMissions.some(
              (mission) => mission.plannedDate !== null && mission.plannedDate < today,
            )
              ? 'warning'
              : undefined
          }
        />
        <StatBlock
          label="Topics confident"
          value={`${confidentTopics}/${activeTopics.length}`}
          detail="Self-assessed stage, not a score"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <SectionHeader
            title="Subjects"
            hint="Targets, topics, and the next real mission"
            action={
              <Link
                to="/settings"
                className="text-[10.5px] text-faint transition-colors hover:text-muted"
              >
                Adjust targets
              </Link>
            }
          />
          <div className="grid gap-3 md:grid-cols-2">
            {subjects.map((subject) => {
              const goal = goalBySubject.get(subject.id)
              const subjectMissions = openBySubject.get(subject.id) ?? []
              const nextMission = subjectMissions[0] ?? null
              const topics = activeTopics.filter((topic) => topic.subjectId === subject.id)
              const confident = topics.filter((topic) => topic.stage === 'confident').length
              const learning = topics.filter(
                (topic) => topic.stage === 'learning' || topic.stage === 'review',
              ).length
              const examDays = subject.examDate ? daysBetween(today, subject.examDate) : null
              const satScore = subject.id === 'sat' ? latestSatScore : null

              return (
                <div
                  key={subject.id}
                  className="group relative flex flex-col rounded-2xl border border-line bg-surface/80 p-4 transition-colors hover:border-line-strong sm:p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl border"
                        style={{
                          color: subject.color,
                          backgroundColor: `${subject.color}12`,
                          borderColor: `${subject.color}28`,
                        }}
                      >
                        <SubjectIcon icon={subject.icon} size={17} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[13.5px] font-semibold leading-tight text-fg">
                          {subject.name}
                        </h2>
                        <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">
                          {subject.type === 'sat' ? 'SAT' : 'AP'}
                          {subject.examDate
                            ? ` · exam ${formatDateKey(subject.examDate, locale, { month: 'short', day: 'numeric' })}`
                            : ' · no exam date'}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/study/${subject.id}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-fg"
                      aria-label={`Open ${subject.name}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                        Weekly goal
                      </span>
                      <span className="font-mono text-[9px] text-muted">
                        {goal?.completed ?? 0}/{goal?.target ?? subject.weeklyTarget}
                      </span>
                    </div>
                    <Progress
                      value={goal?.percent ?? 0}
                      tone={goal && goal.remaining === 0 ? 'teal' : 'lime'}
                      size="sm"
                      className="mt-2"
                    />
                  </div>

                  <div className="mt-3.5 grid grid-cols-3 gap-2 border-y border-line py-3">
                    <div>
                      <p className="font-num text-[16px] font-semibold leading-none">
                        {subjectMissions.length}
                      </p>
                      <p className="mt-1 text-[9px] text-faint">open</p>
                    </div>
                    <div>
                      <p className="font-num text-[16px] font-semibold leading-none">
                        {confident}
                        <span className="text-[10px] font-normal text-faint">/{topics.length}</span>
                      </p>
                      <p className="mt-1 text-[9px] text-faint">confident</p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          'font-num text-[16px] font-semibold leading-none',
                          examDays !== null && examDays < 0 && 'text-danger',
                          examDays !== null && examDays >= 0 && examDays <= 14 && 'text-warning',
                        )}
                      >
                        {satScore !== null && subject.id === 'sat'
                          ? satScore
                          : examDays !== null
                            ? examDays < 0
                              ? 'Past'
                              : examDays
                            : '—'}
                      </p>
                      <p className="mt-1 text-[9px] text-faint">
                        {subject.id === 'sat' && satScore !== null
                          ? 'latest score'
                          : 'days to exam'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 min-h-10 flex-1">
                    {nextMission ? (
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-fg/90">
                            {nextMission.title}
                          </p>
                          <p className="mt-0.5 font-mono text-[8.5px] text-faint">
                            {nextMission.dueDate
                              ? `due ${formatDateKey(nextMission.dueDate, locale, { month: 'short', day: 'numeric' })}`
                              : nextMission.plannedDate
                                ? `planned ${formatDateKey(nextMission.plannedDate, locale, { month: 'short', day: 'numeric' })}`
                                : 'unscheduled'}
                            {' · '}
                            {formatDuration(nextMission.estimatedMinutes)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10.5px] leading-relaxed text-faint">
                        {learning > 0
                          ? `${learning} topics are in learning or review. Add the next concrete mission.`
                          : 'No open missions. The subject is not “done” unless you decide it is.'}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button asChild variant="secondary" size="xs" className="flex-1">
                      <Link to={`/study/${subject.id}`}>Open subject</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setEditingMission(null)
                        setMissionEditorOpen(true)
                      }}
                    >
                      <Plus className="size-3" /> Mission
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="size-3.5 text-warning" />
                <p className="mono-label">Review due</p>
              </div>
              <Badge tone={reviewsDue.length > 0 ? 'warning' : 'outline'}>
                {reviewsDue.length}
              </Badge>
            </div>
            {reviewsDue.length === 0 ? (
              <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                Nothing scheduled for review in the next three days. Mistakes and low-confidence
                missions will appear here when they are due.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {reviewsDue.slice(0, 5).map((item) => (
                  <Link
                    key={`${item.kind}-${item.id}`}
                    to={item.href}
                    className="group flex items-start gap-2 rounded-lg border border-transparent px-1.5 py-1.5 transition-colors hover:border-line hover:bg-white/[0.025]"
                  >
                    {item.kind === 'mistake' ? (
                      <NotebookPen className="mt-0.5 size-3 shrink-0 text-warning/80" />
                    ) : (
                      <BookOpenCheck className="mt-0.5 size-3 shrink-0 text-info/80" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] font-medium text-fg/90">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[8.5px] text-faint">
                        {item.kind === 'mistake' ? 'Mistake' : 'Mission'} ·{' '}
                        {formatDateKey(item.date, locale, { month: 'short', day: 'numeric' })}
                        {item.overdue ? ' · overdue' : ''}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-3 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="size-3.5 text-lime" />
                <p className="mono-label">SAT evidence</p>
              </div>
              <Link
                to="/study/sat?tab=practice"
                className="text-[10px] text-faint hover:text-lime"
              >
                Practice log
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-surface-2/35 p-3">
                <p className="font-num text-[24px] font-semibold leading-none">
                  {latestSatScore ?? '—'}
                </p>
                <p className="mt-1.5 text-[9px] text-faint">latest full test</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/35 p-3">
                <p className="font-num text-[24px] font-semibold leading-none">
                  {bestSatScore ?? '—'}
                </p>
                <p className="mt-1.5 text-[9px] text-faint">best full test</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              {satFullTests.length > 0
                ? `${satFullTests.length} scored ${satFullTests.length === 1 ? 'test' : 'tests'} recorded. Accuracy and mistakes live in the SAT workspace.`
                : 'No scores yet. Log a real practice set or test — the app will not invent a baseline.'}
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
              <Link to="/study/sat">
                <Sparkles className="size-3.5" /> Open SAT workspace
              </Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-line bg-surface/70 p-4">
            <div className="flex items-center gap-2">
              <Flame className="size-3.5 text-lime" />
              <p className="mono-label">This week</p>
            </div>
            <div className="mt-3 space-y-2.5">
              {goals.map((goal) => (
                <div key={goal.subject.id}>
                  <div className="flex items-center gap-2">
                    <SubjectDot color={goal.subject.color} />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">
                      {goal.subject.name}
                    </span>
                    <span className="font-mono text-[9px] text-faint">
                      {goal.completed}/{goal.target}
                    </span>
                  </div>
                  <Progress
                    value={goal.percent}
                    tone={goal.remaining === 0 ? 'teal' : 'lime'}
                    size="sm"
                    className="mt-1.5"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-line bg-surface/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5">
            <div>
              <h2 className="text-[13.5px] font-semibold">Mission queue</h2>
              <p className="mt-0.5 text-[10px] text-faint">
                One outcome per row. Finish it or schedule it — do not just stare at it.
              </p>
            </div>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 text-[10.5px] text-faint hover:text-lime"
            >
              <CalendarDays className="size-3" /> Calendar
            </Link>
          </div>

          {openMissions.length === 0 ? (
            <EmptyState
              icon={<BookOpenCheck className="size-5" />}
              title="No open study missions."
              description="If the work is real, name it. If it is not real, leave it out."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingMission(null)
                    setMissionEditorOpen(true)
                  }}
                >
                  <Plus className="size-3.5" /> Add a mission
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-line">
              {openMissions.slice(0, 8).map((mission) => {
                const subject = derived?.subjectById.get(mission.subjectId)
                const dueLabel = deadlineLabel(mission.dueDate, today, locale)
                const overdue = mission.dueDate !== null && mission.dueDate < today
                return (
                  <div
                    key={mission.id}
                    className="group flex items-start gap-2.5 px-3 py-3 transition-colors hover:bg-white/[0.02] sm:px-4"
                  >
                    <span
                      className="mt-1 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: subject?.color ?? '#c6f74a' }}
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`,
                          )
                        }
                        className="block w-full text-left"
                      >
                        <span className="block text-[12.5px] font-medium leading-snug text-fg">
                          {mission.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9.5px]">
                          <span className="text-muted">{subject?.name ?? 'Study'}</span>
                          <span className="text-faint">{MISSION_TYPE_LABELS[mission.missionType]}</span>
                          {mission.dueDate ? (
                            <DeadlineTone tone={dueLabel?.tone ?? 'normal'}>
                              Due {formatDateKey(mission.dueDate, locale, { month: 'short', day: 'numeric' })}
                              {dueLabel?.tone === 'overdue' ? ` · ${dueLabel.label}` : ''}
                            </DeadlineTone>
                          ) : mission.plannedDate ? (
                            <span className="font-mono text-[9px] text-faint">
                              Planned {formatDateKey(mission.plannedDate, locale, { month: 'short', day: 'numeric' })}
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint/70">
                              Unscheduled
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                            <Clock3 className="size-2.5" /> {formatDuration(mission.estimatedMinutes)}
                          </span>
                          {mission.status === 'deferred' ? <Badge tone="warning">Deferred</Badge> : null}
                          {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                        </span>
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => startFocus(mission)}
                        aria-label={`Start focus for ${mission.title}`}
                        className="hidden text-faint hover:text-lime sm:flex"
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => setCompletingMission(mission)}
                        aria-label={`Complete ${mission.title}`}
                        className="text-faint hover:text-lime"
                      >
                        <Check className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface/70 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo className="size-3.5 text-lime" />
              <p className="mono-label">Recent proof</p>
            </div>
            <Badge tone="outline">{recentActivity.length}</Badge>
          </div>
          {recentActivity.length === 0 ? (
            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              Finished missions and logged practice will appear here. There is no starter history.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentActivity.map((activity) => {
                const subject = activity.subjectId
                  ? derived?.subjectById.get(activity.subjectId)
                  : null
                return (
                  <div key={activity.id} className="flex items-start gap-2">
                    <span
                      className="mt-1 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: subject?.color ?? '#919b8e' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] font-medium text-fg/85">
                        {activity.entityTitle}
                      </p>
                      <p className="mt-0.5 font-mono text-[8.5px] text-faint">
                        {formatDateKey(activity.dateKey, locale, { month: 'short', day: 'numeric' })}
                        {activity.minutes > 0 ? ` · ${formatDuration(activity.minutes)}` : ''}
                        {activity.practiceAttempted !== null && activity.practiceCorrect !== null
                          ? ` · ${activity.practiceCorrect}/${activity.practiceAttempted}`
                          : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {openMissions.length > 0 && !settings?.targetSatDate ? (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface/60 px-3.5 py-2.5">
          <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" />
          <p className="text-[10.5px] leading-relaxed text-faint">
            No SAT target date is set. A countdown only helps when the date is real — add the actual
            test date in Settings, or leave it blank.
          </p>
        </div>
      ) : null}

      <MissionEditor
        open={missionEditorOpen}
        onOpenChange={setMissionEditorOpen}
        mission={editingMission}
        defaultSubjectId={subjects[0]?.id ?? 'sat'}
      />
      <MissionCompleteDialog
        open={completingMission !== null}
        onOpenChange={(open) => {
          if (!open) setCompletingMission(null)
        }}
        mission={completingMission}
      />
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

function StatBlock({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string | number
  detail: string
  tone?: 'warning'
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
      <p className="mono-label">{label}</p>
      <p
        className={cn(
          'font-num mt-2.5 text-[24px] font-semibold leading-none tracking-[-0.02em]',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] leading-snug text-faint">{detail}</p>
    </div>
  )
}
