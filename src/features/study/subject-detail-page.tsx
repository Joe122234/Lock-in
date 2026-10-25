import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  GraduationCap,
  ListChecks,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import type { Mistake, Mission, PracticeRecord, Topic, TopicStage } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  archiveMission,
  completeMission,
  reopenMission,
  updateMission,
} from '@/lib/firebase/repositories/missions'
import { reviewMistake } from '@/lib/firebase/repositories/practice'
import { updateTopic } from '@/lib/firebase/repositories/subjects'
import {
  daysBetween,
  deadlineLabel,
  formatDateKey,
  formatDuration,
  endOfWeekKey,
  startOfWeekKey,
} from '@/lib/dates'
import { MISSION_TYPE_LABELS } from '@/lib/constants'
import { Breadcrumb, SegmentedControl } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import {
  DeadlineTone,
  PriorityBadge,
  notifyError,
  notifySaved,
} from '@/components/status'
import { SubjectIcon } from '@/components/subject-icon'
import { FocusSessionDialog, type FocusTarget } from '@/features/focus/focus-session'
import { cn, percent } from '@/lib/utils'
import { MissionEditor } from './mission-editor'
import { MissionCompleteDialog } from './mission-complete-dialog'
import { TopicEditor } from './topic-editor'
import { PracticeEditor } from './practice-editor'
import { MistakeEditor } from './mistake-editor'
import { SubjectEditor } from './subject-editor'
import {
  MISTAKE_STATUS_LABELS,
  PRACTICE_SECTION_LABELS,
  PRACTICE_TYPE_LABELS,
  TOPIC_STAGE_LABELS,
  TOPIC_STAGE_ORDER,
  TOPIC_STAGE_TONE,
} from './study-constants'

type StudyTab = 'missions' | 'topics' | 'practice' | 'mistakes'
type MissionFilter = 'open' | 'completed' | 'all'

const OPEN_MISSION_STATUSES = new Set(['inbox', 'planned', 'inProgress', 'deferred'])

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { collections, settings, today, derived } = useWorkspaceData()
  const [tab, setTab] = useState<StudyTab>(() => {
    const value = searchParams.get('tab')
    return value === 'topics' || value === 'practice' || value === 'mistakes'
      ? value
      : 'missions'
  })
  const [missionFilter, setMissionFilter] = useState<MissionFilter>('open')
  const [missionQuery, setMissionQuery] = useState('')
  const [topicQuery, setTopicQuery] = useState('')
  const [mistakeFilter, setMistakeFilter] = useState<'due' | 'open' | 'mastered' | 'all'>('due')
  const [missionEditorOpen, setMissionEditorOpen] = useState(false)
  const [editingMission, setEditingMission] = useState<Mission | null>(null)
  const [completingMission, setCompletingMission] = useState<Mission | null>(null)
  const [topicEditorOpen, setTopicEditorOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [practiceEditorOpen, setPracticeEditorOpen] = useState(false)
  const [editingPractice, setEditingPractice] = useState<PracticeRecord | null>(null)
  const [mistakeEditorOpen, setMistakeEditorOpen] = useState(false)
  const [editingMistake, setEditingMistake] = useState<Mistake | null>(null)
  const [subjectEditorOpen, setSubjectEditorOpen] = useState(false)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [busyMissionId, setBusyMissionId] = useState<string | null>(null)
  const [busyTopicId, setBusyTopicId] = useState<string | null>(null)
  const [busyMistakeId, setBusyMistakeId] = useState<string | null>(null)
  const [confirmArchiveMissionId, setConfirmArchiveMissionId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const subject = subjectId
    ? collections.subjects.find((item) => item.id === subjectId) ?? null
    : null
  const locale = settings?.locale ?? 'en-US'
  const isSat = subjectId === 'sat'
  const highlightMissionId = searchParams.get('mission')

  useEffect(() => {
    const requested = searchParams.get('tab')
    if (
      requested === 'topics' ||
      requested === 'practice' ||
      requested === 'mistakes' ||
      requested === 'missions'
    ) {
      setTab(requested)
    }
  }, [searchParams])

  useEffect(() => {
    if (highlightMissionId) {
      setTab('missions')
      setMissionFilter('open')
      const timeout = window.setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 120)
      return () => window.clearTimeout(timeout)
    }
  }, [highlightMissionId])

  const subjectMissions = useMemo(
    () =>
      collections.missions
        .filter((mission) => mission.subjectId === subjectId && !mission.archivedAt)
        .sort((a, b) => {
          const aOpen = OPEN_MISSION_STATUSES.has(a.status) ? 0 : 1
          const bOpen = OPEN_MISSION_STATUSES.has(b.status) ? 0 : 1
          if (aOpen !== bOpen) return aOpen - bOpen
          const aDate = a.dueDate ?? a.plannedDate ?? '9999-12-31'
          const bDate = b.dueDate ?? b.plannedDate ?? '9999-12-31'
          if (aDate !== bDate) return aDate.localeCompare(bDate)
          return a.title.localeCompare(b.title)
        }),
    [collections.missions, subjectId],
  )
  const topics = useMemo(
    () =>
      collections.topics
        .filter((topic) => topic.subjectId === subjectId && !topic.archivedAt)
        .sort((a, b) => {
          const groupCompare = (a.group ?? '').localeCompare(b.group ?? '')
          if (groupCompare !== 0) return groupCompare
          return a.order - b.order
        }),
    [collections.topics, subjectId],
  )
  const practiceRecords = useMemo(
    () =>
      isSat
        ? [...collections.practiceRecords].sort((a, b) => {
            if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
            return b.createdAt.getTime() - a.createdAt.getTime()
          })
        : [],
    [collections.practiceRecords, isSat],
  )
  const mistakes = useMemo(
    () =>
      isSat
        ? [...collections.mistakes].sort((a, b) => {
            if (a.status !== b.status) {
              const rank: Record<Mistake['status'], number> = {
                open: 0,
                reviewed: 1,
                mastered: 2,
              }
              return rank[a.status] - rank[b.status]
            }
            const aDate = a.nextReviewDate ?? a.createdAt.toISOString().slice(0, 10)
            const bDate = b.nextReviewDate ?? b.createdAt.toISOString().slice(0, 10)
            return aDate.localeCompare(bDate)
          })
        : [],
    [collections.mistakes, isSat],
  )

  const weekStart = startOfWeekKey(today, settings?.weekStartsOn ?? 1)
  const weekEnd = endOfWeekKey(today, settings?.weekStartsOn ?? 1)
  const weeklyActivities = useMemo(
    () =>
      collections.activityEvents.filter(
        (activity) =>
          !activity.reversedAt &&
          activity.meaningful &&
          activity.subjectId === subjectId &&
          activity.dateKey >= weekStart &&
          activity.dateKey <= weekEnd,
      ),
    [collections.activityEvents, subjectId, weekStart, weekEnd],
  )
  const weeklyGoal = derived?.goals.find((goal) => goal.subject.id === subjectId) ?? null
  const openMissions = subjectMissions.filter((mission) =>
    OPEN_MISSION_STATUSES.has(mission.status),
  )
  const nextMission = openMissions[0] ?? null
  const filteredMissions = useMemo(() => {
    const normalized = missionQuery.trim().toLowerCase()
    return subjectMissions.filter((mission) => {
      if (missionFilter === 'open' && !OPEN_MISSION_STATUSES.has(mission.status)) return false
      if (
        missionFilter === 'completed' &&
        mission.status !== 'completed' &&
        mission.status !== 'skipped'
      ) {
        return false
      }
      if (!normalized) return true
      return (
        mission.title.toLowerCase().includes(normalized) ||
        mission.description.toLowerCase().includes(normalized) ||
        (derived?.topicById.get(mission.topicId ?? '')?.name ?? '')
          .toLowerCase()
          .includes(normalized)
      )
    })
  }, [subjectMissions, missionFilter, missionQuery, derived?.topicById])

  const filteredTopics = useMemo(() => {
    const normalized = topicQuery.trim().toLowerCase()
    if (!normalized) return topics
    return topics.filter(
      (topic) =>
        topic.name.toLowerCase().includes(normalized) ||
        (topic.group ?? '').toLowerCase().includes(normalized),
    )
  }, [topics, topicQuery])

  const topicGroups = useMemo(() => {
    const groups = new Map<string, Topic[]>()
    filteredTopics.forEach((topic) => {
      const group = topic.group?.trim() || 'Ungrouped'
      const list = groups.get(group) ?? []
      list.push(topic)
      groups.set(group, list)
    })
    return groups
  }, [filteredTopics])

  const topicsById = derived?.topicById ?? new Map<string, Topic>()
  const openMistakes = mistakes.filter((mistake) => mistake.status !== 'mastered')
  const dueMistakes = openMistakes.filter(
    (mistake) => mistake.nextReviewDate !== null && mistake.nextReviewDate <= today,
  )
  const filteredMistakes = useMemo(() => {
    if (mistakeFilter === 'all') return mistakes
    if (mistakeFilter === 'mastered') {
      return mistakes.filter((mistake) => mistake.status === 'mastered')
    }
    if (mistakeFilter === 'due') {
      return mistakes.filter(
        (mistake) =>
          mistake.status !== 'mastered' &&
          mistake.nextReviewDate !== null &&
          mistake.nextReviewDate <= today,
      )
    }
    return mistakes.filter((mistake) => mistake.status === 'open')
  }, [mistakes, mistakeFilter, today])

  const practiceAccuracy = useMemo(() => {
    const attempts = practiceRecords.reduce((sum, record) => sum + record.attempted, 0)
    const correct = practiceRecords.reduce((sum, record) => sum + record.correct, 0)
    return attempts > 0 ? percent(correct, attempts) : null
  }, [practiceRecords])

  const fullTests = useMemo(
    () =>
      [...practiceRecords]
        .filter((record) => record.totalScore !== null)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [practiceRecords],
  )

  const accuracyChart = useMemo(
    () =>
      [...practiceRecords]
        .filter((record) => record.attempted > 0)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .slice(-14)
        .map((record) => ({
          date: formatDateKey(record.dateKey, locale, { month: 'short', day: 'numeric' }),
          accuracy: percent(record.correct, record.attempted),
          source: record.source,
        })),
    [practiceRecords, locale],
  )

  const scoreChart = useMemo(
    () =>
      fullTests.slice(-10).map((record) => ({
        date: formatDateKey(record.dateKey, locale, { month: 'short', day: 'numeric' }),
        score: record.totalScore,
        source: record.source,
      })),
    [fullTests, locale],
  )

  const latestScore = fullTests.at(-1)?.totalScore ?? null
  const bestScore =
    fullTests.length > 0 ? Math.max(...fullTests.map((record) => record.totalScore ?? 0)) : null
  const firstScore = fullTests[0]?.totalScore ?? null
  const scoreDelta =
    latestScore !== null && firstScore !== null && fullTests.length > 1
      ? latestScore - firstScore
      : null

  const changeTab = (next: StudyTab) => {
    setTab(next)
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    if (next !== 'missions') params.delete('mission')
    setSearchParams(params, { replace: true })
  }

  const startFocus = (mission: Mission) => {
    setFocusTarget({
      title: mission.title,
      subtitle: `${subject?.name ?? 'Study'} · ${formatDuration(mission.estimatedMinutes)}`,
      plannedMinutes: Math.max(10, mission.estimatedMinutes || 30),
      color: subject?.color ?? '#c6f74a',
      onComplete: async (minutes) => {
        await completeMission(mission.id, { dateKey: today, actualMinutes: minutes })
        toast.success('Mission complete', {
          description: `${minutes} real minutes logged.`,
        })
      },
    })
  }

  const scheduleToday = async (mission: Mission) => {
    setBusyMissionId(mission.id)
    try {
      await updateMission(mission.id, { plannedDate: today })
      notifySaved('Mission scheduled for today', mission.title)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyMissionId(null)
    }
  }

  const unschedule = async (mission: Mission) => {
    setBusyMissionId(mission.id)
    try {
      await updateMission(mission.id, { plannedDate: null })
      notifySaved('Mission unscheduled', 'Its calendar block was canceled.')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyMissionId(null)
    }
  }

  const reopen = async (mission: Mission) => {
    setBusyMissionId(mission.id)
    try {
      await reopenMission(mission.id)
      notifySaved('Mission reopened', 'Its completion was reversed in activity history.')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyMissionId(null)
    }
  }

  const archive = async (mission: Mission) => {
    setBusyMissionId(mission.id)
    try {
      await archiveMission(mission.id)
      notifySaved('Mission archived', 'Its calendar block was canceled.')
      setConfirmArchiveMissionId(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyMissionId(null)
    }
  }

  const changeTopicStage = async (topic: Topic, stage: TopicStage) => {
    if (topic.stage === stage) return
    setBusyTopicId(topic.id)
    try {
      await updateTopic(topic.id, { stage })
      toast.success(`${TOPIC_STAGE_LABELS[stage]}`, { description: topic.name })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyTopicId(null)
    }
  }

  const updateMistakeStatus = async (mistake: Mistake, status: Mistake['status']) => {
    setBusyMistakeId(mistake.id)
    try {
      await reviewMistake(mistake.id, status, status === 'open' ? mistake.nextReviewDate : null)
      notifySaved(
        status === 'mastered'
          ? 'Mistake mastered'
          : status === 'reviewed'
            ? 'Mistake reviewed'
            : 'Mistake reopened',
        status === 'reviewed'
          ? 'It will only return when you set a next review date.'
          : mistake.skill,
      )
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyMistakeId(null)
    }
  }

  if (!settings) return null

  if (!subject || subject.archivedAt) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface/70 px-6 py-20 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-faint">
          <GraduationCap className="size-5" />
        </span>
        <div>
          <h1 className="text-[16px] font-semibold">Subject not found.</h1>
          <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-faint">
            It may have been archived. The rest of your study record is unchanged.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/study">Back to study</Link>
        </Button>
      </div>
    )
  }

  const examDays = subject.examDate ? daysBetween(today, subject.examDate) : null
  const topicMissions = new Map<string, Mission[]>()
  subjectMissions.forEach((mission) => {
    if (!mission.topicId) return
    const list = topicMissions.get(mission.topicId) ?? []
    list.push(mission)
    topicMissions.set(mission.topicId, list)
  })
  const topicMistakes = new Map<string, number>()
  mistakes.forEach((mistake) => {
    if (!mistake.topicId) return
    topicMistakes.set(mistake.topicId, (topicMistakes.get(mistake.topicId) ?? 0) + 1)
  })
  const confidentTopicCount = topics.filter((topic) => topic.stage === 'confident').length
  const nextOrder = topics.reduce((max, topic) => Math.max(max, topic.order), 0) + 1
  const tabOptions: Array<{ value: StudyTab; label: React.ReactNode }> = [
    {
      value: 'missions',
      label: (
        <>
          Missions <span className="font-mono text-[9px] opacity-60">{openMissions.length}</span>
        </>
      ),
    },
    { value: 'topics', label: <>Topics <span className="font-mono text-[9px] opacity-60">{topics.length}</span></> },
    ...(isSat
      ? [
          {
            value: 'practice' as const,
            label: (
              <>
                Practice{' '}
                <span className="font-mono text-[9px] opacity-60">{practiceRecords.length}</span>
              </>
            ),
          },
          {
            value: 'mistakes' as const,
            label: (
              <>
                Mistakes{' '}
                <span className="font-mono text-[9px] opacity-60">{openMistakes.length}</span>
              </>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-5 sm:space-y-6">
      <Breadcrumb
        items={[{ label: 'Study', href: '/study' }, { label: subject.name }]}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
              style={{
                color: subject.color,
                backgroundColor: `${subject.color}12`,
                borderColor: `${subject.color}28`,
              }}
            >
              <SubjectIcon icon={subject.icon} size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{subject.type === 'sat' ? 'SAT' : 'AP'}</Badge>
                {examDays !== null ? (
                  <Badge tone={examDays < 0 ? 'danger' : examDays <= 14 ? 'warning' : 'neutral'}>
                    {examDays < 0
                      ? 'Exam date passed'
                      : `${examDays} ${examDays === 1 ? 'day' : 'days'} to exam`}
                  </Badge>
                ) : (
                  <Badge tone="outline">No exam date</Badge>
                )}
              </div>
              <h1 className="mt-2 text-balance text-[25px] font-semibold leading-[1.12] tracking-[-0.035em] text-fg sm:text-[31px]">
                {subject.name}
              </h1>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSubjectEditorOpen(true)}>
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">Subject settings</span>
            <span className="sm:hidden">Settings</span>
          </Button>
          {isSat ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingPractice(null)
                setPracticeEditorOpen(true)
              }}
            >
              <NotebookPen className="size-3.5" /> Log practice
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingMission(null)
              setMissionEditorOpen(true)
            }}
          >
            <Plus className="size-3.5" /> New mission
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Weekly goal</p>
          <p className="font-num mt-2.5 text-[24px] font-semibold leading-none">
            {weeklyGoal?.completed ?? 0}
            <span className="text-[13px] font-normal text-faint">
              /{weeklyGoal?.target ?? subject.weeklyTarget}
            </span>
          </p>
          <Progress
            value={weeklyGoal?.percent ?? 0}
            tone={weeklyGoal && weeklyGoal.remaining === 0 ? 'teal' : 'lime'}
            size="sm"
            className="mt-2.5"
          />
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Open missions</p>
          <p className="font-num mt-2.5 text-[24px] font-semibold leading-none">
            {openMissions.length}
          </p>
          <p className="mt-1.5 text-[10px] text-faint">
            {openMissions.reduce((sum, mission) => sum + mission.estimatedMinutes, 0)} min estimated
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Studied this week</p>
          <p className="font-num mt-2.5 text-[20px] font-semibold leading-none">
            {formatDuration(weeklyActivities.reduce((sum, activity) => sum + activity.minutes, 0))}
          </p>
          <p className="mt-1.5 text-[10px] text-faint">
            {weeklyActivities.length} meaningful {weeklyActivities.length === 1 ? 'activity' : 'activities'}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          {isSat ? (
            <>
              <p className="mono-label">Latest score</p>
              <p className="font-num mt-2.5 text-[24px] font-semibold leading-none">
                {latestScore ?? '—'}
              </p>
              <p className="mt-1.5 text-[10px] text-faint">
                {scoreDelta !== null
                  ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta} from first full test`
                  : fullTests.length === 0
                    ? 'No scored test yet'
                    : 'Baseline recorded'}
              </p>
            </>
          ) : (
            <>
              <p className="mono-label">Topics confident</p>
              <p className="font-num mt-2.5 text-[24px] font-semibold leading-none">
                {confidentTopicCount}
                <span className="text-[13px] font-normal text-faint">/{topics.length}</span>
              </p>
              <p className="mt-1.5 text-[10px] text-faint">Stage is yours to set honestly</p>
            </>
          )}
        </div>
      </div>

      {nextMission ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            <div className="min-w-0">
              <p className="mono-label">Next mission</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-fg">
                {nextMission.title}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[10px] text-faint">
                <span>{MISSION_TYPE_LABELS[nextMission.missionType]}</span>
                <span>{formatDuration(nextMission.estimatedMinutes)}</span>
                {nextMission.dueDate ? (
                  <span>due {formatDateKey(nextMission.dueDate, locale)}</span>
                ) : nextMission.plannedDate ? (
                  <span>planned {formatDateKey(nextMission.plannedDate, locale)}</span>
                ) : (
                  <span>unscheduled</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={() => startFocus(nextMission)}>
              <Play className="size-3.5" /> Focus
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCompletingMission(nextMission)}>
              <Check className="size-3.5" /> Complete
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto pb-0.5">
        <SegmentedControl
          value={tab}
          onChange={changeTab}
          size="sm"
          ariaLabel="Subject workspace"
          options={tabOptions}
          className="min-w-max"
        />
      </div>

      {tab === 'missions' ? (
        <section className="rounded-2xl border border-line bg-surface/70">
          <div className="flex flex-col gap-2.5 border-b border-line p-3 sm:flex-row sm:items-center">
            <SegmentedControl
              value={missionFilter}
              onChange={(value) => setMissionFilter(value)}
              size="sm"
              ariaLabel="Mission filter"
              options={[
                {
                  value: 'open',
                  label: (
                    <>
                      Open{' '}
                      <span className="font-mono text-[9px] opacity-60">{openMissions.length}</span>
                    </>
                  ),
                },
                { value: 'completed', label: 'Completed' },
                { value: 'all', label: 'All' },
              ]}
            />
            <SearchInput
              value={missionQuery}
              onChange={(input) => setMissionQuery(input.target.value)}
              placeholder="Search missions…"
              className="min-w-40 flex-1 sm:max-w-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              className="sm:ml-auto"
              onClick={() => {
                setEditingMission(null)
                setMissionEditorOpen(true)
              }}
            >
              <Plus className="size-3.5" /> Mission
            </Button>
          </div>

          {filteredMissions.length === 0 ? (
            <EmptyState
              icon={<BookOpenCheck className="size-5" />}
              title={
                missionQuery
                  ? 'No missions match.'
                  : missionFilter === 'completed'
                    ? 'No completed missions yet.'
                    : 'No open missions.'
              }
              description={
                missionQuery
                  ? 'Try a different title or topic.'
                  : 'Define one concrete study outcome. Planned dates create calendar blocks automatically.'
              }
              action={
                !missionQuery && missionFilter !== 'completed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingMission(null)
                      setMissionEditorOpen(true)
                    }}
                  >
                    <Plus className="size-3.5" /> Add mission
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-line">
              {filteredMissions.map((mission) => {
                const open = OPEN_MISSION_STATUSES.has(mission.status)
                const done = mission.status === 'completed'
                const skipped = mission.status === 'skipped'
                const due = deadlineLabel(mission.dueDate, today, locale)
                const topic = topicsById.get(mission.topicId ?? '')
                const checklistDone = mission.checklist.filter((item) => item.done).length
                const linkedEvent = collections.calendarEvents.find(
                  (event) => event.id === mission.plannedEventId,
                )
                const highlighted = mission.id === highlightMissionId
                return (
                  <div
                    key={mission.id}
                    ref={highlighted ? highlightRef : undefined}
                    className={cn(
                      'group px-3 py-3 transition-colors sm:px-4',
                      highlighted && 'bg-lime/[0.045] ring-1 ring-inset ring-lime/20',
                      (done || skipped) && 'opacity-70',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          open ? setCompletingMission(mission) : void reopen(mission)
                        }
                        disabled={busyMissionId === mission.id || skipped}
                        aria-label={open ? `Complete ${mission.title}` : `Reopen ${mission.title}`}
                        className={cn(
                          'mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border transition-colors',
                          done
                            ? 'border-lime bg-lime text-[#0a0d08]'
                            : 'border-line-strong text-transparent hover:border-lime/60 hover:text-lime/70',
                        )}
                      >
                        {busyMissionId === mission.id ? (
                          <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : done ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : (
                          <Circle className="size-2.5" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMission(mission)
                            setMissionEditorOpen(true)
                          }}
                          className="block w-full text-left"
                        >
                          <span
                            className={cn(
                              'block text-[12.5px] font-medium leading-snug text-fg',
                              (done || skipped) && 'line-through',
                            )}
                          >
                            {mission.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9.5px]">
                            <span className="text-muted">
                              {MISSION_TYPE_LABELS[mission.missionType]}
                            </span>
                            {topic ? (
                              <span className="font-mono text-[9px] text-faint">{topic.name}</span>
                            ) : null}
                            <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                              <Clock3 className="size-2.5" />
                              {formatDuration(mission.estimatedMinutes)}
                            </span>
                            {mission.dueDate ? (
                              <DeadlineTone tone={due?.tone ?? 'normal'}>
                                Due{' '}
                                {formatDateKey(mission.dueDate, locale, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {due?.tone === 'overdue' ? ` · ${due.label}` : ''}
                              </DeadlineTone>
                            ) : mission.plannedDate ? (
                              <span className="font-mono text-[9px] text-faint">
                                Planned{' '}
                                {formatDateKey(mission.plannedDate, locale, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            ) : (
                              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint/70">
                                Unscheduled
                              </span>
                            )}
                            {mission.priority === 'high' || mission.priority === 'urgent' ? (
                              <PriorityBadge priority={mission.priority} />
                            ) : null}
                            {mission.checklist.length > 0 ? (
                              <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                                <ListChecks className="size-2.5" /> {checklistDone}/
                                {mission.checklist.length}
                              </span>
                            ) : null}
                            {mission.status === 'deferred' ? (
                              <Badge tone="warning">Deferred</Badge>
                            ) : null}
                            {skipped ? <Badge tone="outline">Skipped</Badge> : null}
                            {mission.confidence !== null ? (
                              <span className="font-mono text-[9px] text-faint">
                                confidence {mission.confidence}/5
                              </span>
                            ) : null}
                          </span>
                        </button>

                        {mission.completionSummary ? (
                          <p className="mt-1.5 line-clamp-2 border-l border-line pl-2 text-[10px] leading-relaxed text-faint">
                            {mission.completionSummary}
                          </p>
                        ) : mission.description ? (
                          <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-faint">
                            {mission.description}
                          </p>
                        ) : null}

                        {linkedEvent ? (
                          <Link
                            to={`/calendar?date=${mission.plannedDate ?? linkedEvent.dateKey}`}
                            className="mt-1.5 inline-flex items-center gap-1 font-mono text-[8.5px] text-faint hover:text-lime"
                          >
                            <ChevronRight className="size-2.5" />
                            On the calendar · {linkedEvent.estimatedMinutes}m
                          </Link>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {open ? (
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => startFocus(mission)}
                            aria-label={`Start focus for ${mission.title}`}
                            className="hidden text-faint hover:text-lime sm:flex"
                          >
                            <Play className="size-3.5" />
                          </Button>
                        ) : done ? (
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={() => void reopen(mission)}
                            disabled={busyMissionId === mission.id}
                            aria-label={`Reopen ${mission.title}`}
                            className="text-faint hover:text-warning"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Actions for ${mission.title}`}
                              className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-white/5 hover:text-fg"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuLabel>Mission</DropdownMenuLabel>
                            <DropdownMenuItem
                              icon={<Pencil className="size-3.5" />}
                              onSelect={() => {
                                setEditingMission(mission)
                                setMissionEditorOpen(true)
                              }}
                            >
                              Edit mission
                            </DropdownMenuItem>
                            {open ? (
                              <>
                                <DropdownMenuItem
                                  icon={<Play className="size-3.5" />}
                                  onSelect={() => startFocus(mission)}
                                >
                                  Start focus session
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  icon={<CheckCircle2 className="size-3.5" />}
                                  onSelect={() => setCompletingMission(mission)}
                                >
                                  Log completion
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  icon={<Target className="size-3.5" />}
                                  onSelect={() => void scheduleToday(mission)}
                                >
                                  Plan for today
                                </DropdownMenuItem>
                                {mission.plannedDate ? (
                                  <DropdownMenuItem
                                    icon={<Trash2 className="size-3.5" />}
                                    onSelect={() => void unschedule(mission)}
                                  >
                                    Remove calendar block
                                  </DropdownMenuItem>
                                ) : null}
                              </>
                            ) : (
                              <DropdownMenuItem
                                icon={<RotateCcw className="size-3.5" />}
                                onSelect={() => void reopen(mission)}
                              >
                                Reopen mission
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              danger
                              onSelect={() => setConfirmArchiveMissionId(mission.id)}
                            >
                              Archive mission
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'topics' ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <SearchInput
                value={topicQuery}
                onChange={(input) => setTopicQuery(input.target.value)}
                placeholder="Search topics or units…"
                className="min-w-40 flex-1 sm:max-w-xs"
              />
              <span className="hidden text-[10px] text-faint sm:inline">
                {confidentTopicCount}/{topics.length} confident
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingTopic(null)
                setTopicEditorOpen(true)
              }}
            >
              <Plus className="size-3.5" /> Topic
            </Button>
          </div>

          {topicGroups.size === 0 ? (
            <div className="rounded-2xl border border-line bg-surface/60">
              <EmptyState
                icon={<Target className="size-5" />}
                title={topicQuery ? 'No topics match.' : 'No topics mapped yet.'}
                description="Topics give missions a home and let you see which units actually need work."
                action={
                  !topicQuery ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingTopic(null)
                        setTopicEditorOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" /> Add first topic
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            [...topicGroups.entries()].map(([group, groupTopics]) => (
              <div key={group} className="rounded-2xl border border-line bg-surface/70">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: subject.color }}
                    />
                    <h2 className="text-[11.5px] font-semibold">{group}</h2>
                    <span className="font-mono text-[9px] text-faint">
                      {groupTopics.length} topics
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-faint">
                    {groupTopics.filter((topic) => topic.stage === 'confident').length} confident
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {groupTopics.map((topic) => {
                    const missionsForTopic = topicMissions.get(topic.id) ?? []
                    const openForTopic = missionsForTopic.filter((mission) =>
                      OPEN_MISSION_STATUSES.has(mission.status),
                    )
                    const mistakeCount = topicMistakes.get(topic.id) ?? 0
                    return (
                      <div key={topic.id} className="px-3 py-3 sm:px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="text-[12px] font-medium leading-snug text-fg">
                                {topic.name}
                              </h3>
                              <Badge tone={TOPIC_STAGE_TONE[topic.stage]}>
                                {TOPIC_STAGE_LABELS[topic.stage]}
                              </Badge>
                              {mistakeCount > 0 ? (
                                <span className="font-mono text-[8.5px] text-warning/85">
                                  {mistakeCount} {mistakeCount === 1 ? 'mistake' : 'mistakes'}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[9px] text-faint">
                              <span>
                                {openForTopic.length} open{' '}
                                {openForTopic.length === 1 ? 'mission' : 'missions'}
                              </span>
                              <span>
                                {missionsForTopic.length - openForTopic.length} completed
                              </span>
                              {topic.notes ? (
                                <span className="line-clamp-1 max-w-sm">{topic.notes}</span>
                              ) : null}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => {
                                setEditingTopic(topic)
                                setTopicEditorOpen(true)
                              }}
                              aria-label={`Edit ${topic.name}`}
                              className="text-faint hover:text-fg"
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => {
                                setEditingMission(null)
                                setMissionEditorOpen(true)
                              }}
                              aria-label={`Add a mission for ${topic.name}`}
                              className="text-faint hover:text-lime"
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2.5 flex gap-1">
                          {TOPIC_STAGE_ORDER.map((stage) => (
                            <button
                              key={stage}
                              type="button"
                              onClick={() => void changeTopicStage(topic, stage)}
                              disabled={busyTopicId === topic.id}
                              aria-pressed={topic.stage === stage}
                              className={cn(
                                'h-7 flex-1 rounded-md border text-[8.5px] font-medium transition-colors',
                                topic.stage === stage
                                  ? stage === 'confident'
                                    ? 'border-teal/30 bg-teal/12 text-teal'
                                    : stage === 'review'
                                      ? 'border-warning/30 bg-warning/12 text-warning'
                                      : stage === 'learning'
                                        ? 'border-info/30 bg-info/12 text-info'
                                        : 'border-line-strong bg-surface-2 text-muted'
                                  : 'border-line text-faint hover:border-line-strong hover:text-muted',
                              )}
                            >
                              {TOPIC_STAGE_LABELS[stage]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {tab === 'practice' && isSat ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <PracticeStat label="Latest full test" value={latestScore ?? '—'} detail="Most recent score" />
            <PracticeStat label="Best full test" value={bestScore ?? '—'} detail="Highest recorded" />
            <PracticeStat
              label="Overall accuracy"
              value={practiceAccuracy === null ? '—' : `${practiceAccuracy}%`}
              detail="All logged questions"
            />
            <PracticeStat
              label="Practice minutes"
              value={formatDuration(
                practiceRecords.reduce((sum, record) => sum + record.minutes, 0),
              )}
              detail={`${practiceRecords.length} records`}
            />
          </div>

          {accuracyChart.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-3.5 text-lime" />
                    <p className="mono-label">Accuracy trend</p>
                  </div>
                  <span className="font-mono text-[9px] text-faint">last {accuracyChart.length}</span>
                </div>
                <div className="mt-3 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={accuracyChart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                      <defs>
                        <linearGradient id="accuracyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={subject.color} stopOpacity={0.24} />
                          <stop offset="100%" stopColor={subject.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#646d62', fontSize: 8.5 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={18}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 50, 100]}
                        tick={{ fill: '#646d62', fontSize: 8.5 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#141814',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          fontSize: 11,
                          color: '#f2f5ee',
                        }}
                        formatter={(value) => [`${value}%`, 'Accuracy']}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.source ?? ''
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="accuracy"
                        stroke={subject.color}
                        strokeWidth={1.8}
                        fill="url(#accuracyFill)"
                        dot={{ r: 2, fill: subject.color, strokeWidth: 0 }}
                        activeDot={{ r: 3.5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface/80 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="size-3.5 text-lime" />
                    <p className="mono-label">Full-test scores</p>
                  </div>
                  <span className="font-mono text-[9px] text-faint">
                    {scoreChart.length} scored
                  </span>
                </div>
                {scoreChart.length === 0 ? (
                  <p className="mt-8 text-center text-[10.5px] leading-relaxed text-faint">
                    No scored full tests yet. Log one only when you actually sat a timed test.
                  </p>
                ) : (
                  <div className="mt-3 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={scoreChart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                        <defs>
                          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={subject.color} stopOpacity={0.24} />
                            <stop offset="100%" stopColor={subject.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#646d62', fontSize: 8.5 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={18}
                        />
                        <YAxis
                          domain={['dataMin - 40', 'dataMax + 40']}
                          tick={{ fill: '#646d62', fontSize: 8.5 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#141814',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 10,
                            fontSize: 11,
                            color: '#f2f5ee',
                          }}
                          formatter={(value) => [value, 'Score']}
                          labelFormatter={(_, payload) =>
                            payload?.[0]?.payload?.source ?? ''
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={subject.color}
                          strokeWidth={1.8}
                          fill="url(#scoreFill)"
                          dot={{ r: 2, fill: subject.color, strokeWidth: 0 }}
                          activeDot={{ r: 3.5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-line bg-surface/70">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
              <div>
                <h2 className="text-[13.5px] font-semibold">Practice log</h2>
                <p className="mt-0.5 text-[10px] text-faint">
                  Real attempts, real time. Score fields only when a score exists.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingPractice(null)
                  setPracticeEditorOpen(true)
                }}
              >
                <Plus className="size-3.5" /> Log practice
              </Button>
            </div>

            {practiceRecords.length === 0 ? (
              <EmptyState
                icon={<NotebookPen className="size-5" />}
                title="No practice logged yet."
                description="A baseline only exists after you record a real attempt. Add your first question set or timed section."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingPractice(null)
                      setPracticeEditorOpen(true)
                    }}
                  >
                    <Plus className="size-3.5" /> Log practice
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {practiceRecords.map((record) => {
                  const accuracy = percent(record.correct, record.attempted)
                  return (
                    <div
                      key={record.id}
                      className="group flex items-start gap-2.5 px-3 py-3 transition-colors hover:bg-white/[0.02] sm:px-4"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-9 shrink-0 flex-col items-center justify-center rounded-lg border font-mono',
                          accuracy >= 80
                            ? 'border-teal/20 bg-teal/[0.06] text-teal'
                            : accuracy >= 60
                              ? 'border-warning/20 bg-warning/[0.05] text-warning'
                              : 'border-danger/20 bg-danger/[0.05] text-danger',
                        )}
                      >
                        <span className="text-[11px] font-semibold leading-none">{accuracy}%</span>
                        <span className="mt-0.5 text-[7px] uppercase leading-none opacity-60">
                          acc
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[12px] font-medium text-fg">{record.source}</p>
                          <Badge tone="outline">{PRACTICE_TYPE_LABELS[record.recordType]}</Badge>
                          {record.totalScore !== null ? (
                            <Badge tone="lime">{record.totalScore}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[9.5px] text-faint">
                          <span>
                            {formatDateKey(record.dateKey, locale, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span>{PRACTICE_SECTION_LABELS[record.section]}</span>
                          <span>
                            {record.correct}/{record.attempted} correct
                          </span>
                          <span>{record.minutes} min</span>
                          {record.mathScore !== null || record.readingWritingScore !== null ? (
                            <span className="font-mono">
                              M {record.mathScore ?? '—'} · RW {record.readingWritingScore ?? '—'}
                            </span>
                          ) : null}
                        </p>
                        {record.notes ? (
                          <p className="mt-1 line-clamp-1 text-[10px] text-faint">{record.notes}</p>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        aria-label={`Edit ${record.source}`}
                        onClick={() => {
                          setEditingPractice(record)
                          setPracticeEditorOpen(true)
                        }}
                        className="shrink-0 text-faint hover:text-fg"
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'mistakes' && isSat ? (
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            <PracticeStat label="Open" value={openMistakes.length} detail="Not mastered yet" />
            <PracticeStat
              label="Due now"
              value={dueMistakes.length}
              detail="Scheduled on or before today"
              tone={dueMistakes.length > 0 ? 'warning' : undefined}
            />
            <PracticeStat
              label="Mastered"
              value={mistakes.filter((mistake) => mistake.status === 'mastered').length}
              detail="Kept as evidence"
            />
          </div>

          <div className="rounded-2xl border border-line bg-surface/70">
            <div className="flex flex-col gap-2.5 border-b border-line p-3 sm:flex-row sm:items-center">
              <SegmentedControl
                value={mistakeFilter}
                onChange={setMistakeFilter}
                size="sm"
                ariaLabel="Mistake filter"
                options={[
                  {
                    value: 'due',
                    label: (
                      <>
                        Due <span className="font-mono text-[9px] opacity-60">{dueMistakes.length}</span>
                      </>
                    ),
                  },
                  {
                    value: 'open',
                    label: (
                      <>
                        Open <span className="font-mono text-[9px] opacity-60">{openMistakes.length}</span>
                      </>
                    ),
                  },
                  { value: 'mastered', label: 'Mastered' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <Button
                variant="primary"
                size="sm"
                className="sm:ml-auto"
                onClick={() => {
                  setEditingMistake(null)
                  setMistakeEditorOpen(true)
                }}
              >
                <Plus className="size-3.5" /> Log mistake
              </Button>
            </div>

            {filteredMistakes.length === 0 ? (
              <EmptyState
                icon={<NotebookPen className="size-5" />}
                title={
                  mistakeFilter === 'due'
                    ? 'Nothing due for review.'
                    : mistakeFilter === 'mastered'
                      ? 'No mastered mistakes yet.'
                      : 'No mistakes in this view.'
                }
                description="The journal is for diagnosed errors. If a mistake repeats, the note probably was not specific enough."
                action={
                  mistakeFilter !== 'mastered' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingMistake(null)
                        setMistakeEditorOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" /> Log mistake
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {filteredMistakes.map((mistake) => {
                  const topic = mistake.topicId ? topicsById.get(mistake.topicId) : null
                  const overdue =
                    mistake.status !== 'mastered' &&
                    mistake.nextReviewDate !== null &&
                    mistake.nextReviewDate < today
                  return (
                    <div
                      key={mistake.id}
                      className={cn(
                        'px-3 py-3 transition-colors hover:bg-white/[0.02] sm:px-4',
                        mistake.status === 'mastered' && 'opacity-65',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border',
                            mistake.status === 'mastered'
                              ? 'border-teal/20 bg-teal/[0.06] text-teal'
                              : overdue
                                ? 'border-warning/25 bg-warning/[0.06] text-warning'
                                : 'border-line bg-surface-2 text-faint',
                          )}
                        >
                          {mistake.status === 'mastered' ? (
                            <Trophy className="size-3.5" />
                          ) : (
                            <NotebookPen className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[12px] font-medium leading-snug text-fg">
                              {mistake.skill}
                            </p>
                            <Badge
                              tone={
                                mistake.status === 'mastered'
                                  ? 'success'
                                  : mistake.status === 'reviewed'
                                    ? 'info'
                                    : overdue
                                      ? 'warning'
                                      : 'outline'
                              }
                            >
                              {MISTAKE_STATUS_LABELS[mistake.status]}
                            </Badge>
                            {overdue ? <Badge tone="danger">Review overdue</Badge> : null}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[9px] text-faint">
                            {topic ? <span>{topic.name}</span> : null}
                            {mistake.questionType ? <span>{mistake.questionType}</span> : null}
                            {mistake.questionRef ? (
                              <span className="font-mono">{mistake.questionRef}</span>
                            ) : null}
                            <span>
                              {mistake.nextReviewDate
                                ? `next review ${formatDateKey(mistake.nextReviewDate, locale, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}`
                                : 'no review date'}
                            </span>
                          </p>
                          <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-relaxed text-muted">
                            {mistake.whyWrong}
                          </p>
                          {mistake.correctReasoning ? (
                            <p className="mt-1 line-clamp-2 border-l border-lime/20 pl-2 text-[10px] leading-relaxed text-faint">
                              {mistake.correctReasoning}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {mistake.status !== 'reviewed' && mistake.status !== 'mastered' ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={busyMistakeId === mistake.id}
                                onClick={() => void updateMistakeStatus(mistake, 'reviewed')}
                              >
                                <Check className="size-3" /> Reviewed
                              </Button>
                            ) : null}
                            {mistake.status !== 'mastered' ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={busyMistakeId === mistake.id}
                                onClick={() => void updateMistakeStatus(mistake, 'mastered')}
                                className="text-teal hover:bg-teal/10 hover:text-teal"
                              >
                                <Trophy className="size-3" /> Mastered
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={busyMistakeId === mistake.id}
                                onClick={() => void updateMistakeStatus(mistake, 'open')}
                              >
                                <RotateCcw className="size-3" /> Reopen
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setEditingMistake(mistake)
                                setMistakeEditorOpen(true)
                              }}
                            >
                              <Pencil className="size-3" /> Edit / schedule
                            </Button>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Edit ${mistake.skill}`}
                          onClick={() => {
                            setEditingMistake(mistake)
                            setMistakeEditorOpen(true)
                          }}
                          className="shrink-0 text-faint hover:text-fg"
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-line bg-surface/50 px-3.5 py-2.5">
            <Search className="mt-0.5 size-3 shrink-0 text-faint" />
            <p className="text-[10px] leading-relaxed text-faint">
              Reviewing a mistake clears its scheduled date. Set a new one in “Edit / schedule” when
              it should return — the app will not invent a spaced-repetition schedule for you.
            </p>
          </div>
        </section>
      ) : null}

      <MissionEditor
        open={missionEditorOpen}
        onOpenChange={(open) => {
          setMissionEditorOpen(open)
          if (!open) setEditingMission(null)
        }}
        mission={editingMission}
        defaultSubjectId={subject.id}
      />
      <MissionCompleteDialog
        open={completingMission !== null}
        onOpenChange={(open) => {
          if (!open) setCompletingMission(null)
        }}
        mission={completingMission}
      />
      <TopicEditor
        open={topicEditorOpen}
        onOpenChange={(open) => {
          setTopicEditorOpen(open)
          if (!open) setEditingTopic(null)
        }}
        subjectId={subject.id}
        topic={editingTopic}
        nextOrder={nextOrder}
      />
      <PracticeEditor
        open={practiceEditorOpen}
        onOpenChange={(open) => {
          setPracticeEditorOpen(open)
          if (!open) setEditingPractice(null)
        }}
        record={editingPractice}
      />
      <MistakeEditor
        open={mistakeEditorOpen}
        onOpenChange={(open) => {
          setMistakeEditorOpen(open)
          if (!open) setEditingMistake(null)
        }}
        mistake={editingMistake}
        topics={topics}
        today={today}
      />
      <SubjectEditor
        open={subjectEditorOpen}
        onOpenChange={setSubjectEditorOpen}
        subject={subject}
      />
      <FocusSessionDialog
        open={focusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFocusTarget(null)
        }}
        target={focusTarget}
      />
      <ConfirmDialog
        open={confirmArchiveMissionId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmArchiveMissionId(null)
        }}
        title={`Archive “${subjectMissions.find((mission) => mission.id === confirmArchiveMissionId)?.title ?? ''}”?`}
        description="It leaves the mission list and its calendar block is canceled. Completion history is preserved."
        confirmLabel="Archive mission"
        destructive
        loading={busyMissionId === confirmArchiveMissionId}
        onConfirm={() => {
          const target = subjectMissions.find(
            (mission) => mission.id === confirmArchiveMissionId,
          )
          if (target) void archive(target)
        }}
      />
    </div>
  )
}

function PracticeStat({
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
    <div className="rounded-2xl border border-line bg-surface/85 p-3.5">
      <p className="mono-label">{label}</p>
      <p
        className={cn(
          'font-num mt-2 text-[21px] font-semibold leading-none',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[9.5px] leading-snug text-faint">{detail}</p>
    </div>
  )
}
