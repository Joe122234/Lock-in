import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Award,
  BookOpenCheck,
  CalendarCheck2,
  CheckCircle2,
  Flame,
  Gauge,
  LineChart as LineChartIcon,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ActivityKind, InsightRange } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  addDaysKey,
  formatDateKey,
  formatDuration,
  startOfWeekKey,
} from '@/lib/dates'
import { PageHeader, SectionHeader, SegmentedControl } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { cn, percent } from '@/lib/utils'

const RANGE_DAYS: Record<Exclude<InsightRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const KIND_LABELS: Record<ActivityKind, string> = {
  mission: 'Study missions',
  assignment: 'Homework',
  milestone: 'Project milestones',
  studyBlock: 'Study blocks',
  practice: 'SAT practice',
}

const STUDY_KINDS = new Set<ActivityKind>(['mission', 'studyBlock', 'practice'])

export function ProgressPage() {
  const { collections, settings, today, derived } = useWorkspaceData()
  const [range, setRange] = useState<InsightRange>('30d')
  const locale = settings?.locale ?? 'en-US'
  const weekStartsOn = settings?.weekStartsOn ?? 1

  const rangeStart =
    range === 'all' ? null : addDaysKey(today, -(RANGE_DAYS[range] - 1))
  const rangeActivities = useMemo(
    () =>
      collections.activityEvents.filter(
        (activity) =>
          !activity.reversedAt &&
          activity.meaningful &&
          (rangeStart === null || activity.dateKey >= rangeStart),
      ),
    [collections.activityEvents, rangeStart],
  )
  const studyActivities = rangeActivities.filter((activity) =>
    STUDY_KINDS.has(activity.kind),
  )
  const studyMinutes = studyActivities.reduce((sum, activity) => sum + activity.minutes, 0)
  const activeDays = new Set(rangeActivities.map((activity) => activity.dateKey)).size
  const averageSession =
    studyActivities.length > 0 ? Math.round(studyMinutes / studyActivities.length) : 0
  const completions = rangeActivities.filter((activity) =>
    ['mission', 'assignment', 'milestone'].includes(activity.kind),
  ).length

  const subjectBreakdown = useMemo(() => {
    const subjects = derived?.subjects ?? []
    return subjects
      .map((subject) => {
        const activities = studyActivities.filter(
          (activity) => activity.subjectId === subject.id,
        )
        const minutes = activities.reduce((sum, activity) => sum + activity.minutes, 0)
        return {
          subject,
          minutes,
          activities: activities.length,
        }
      })
      .sort((a, b) => b.minutes - a.minutes)
  }, [derived?.subjects, studyActivities])
  const trackedSubjectMinutes = subjectBreakdown.reduce((sum, item) => sum + item.minutes, 0)

  const kindBreakdown = useMemo(() => {
    const map = new Map<ActivityKind, { count: number; minutes: number }>()
    rangeActivities.forEach((activity) => {
      const current = map.get(activity.kind) ?? { count: 0, minutes: 0 }
      current.count += 1
      current.minutes += activity.minutes
      map.set(activity.kind, current)
    })
    return (Object.keys(KIND_LABELS) as ActivityKind[])
      .map((kind) => ({ kind, ...(map.get(kind) ?? { count: 0, minutes: 0 }) }))
      .filter((item) => item.count > 0)
  }, [rangeActivities])

  const currentWeekStart = startOfWeekKey(today, weekStartsOn)
  const weeklyChart = useMemo(() => {
    const weeks = Array.from({ length: 8 }, (_, index) =>
      addDaysKey(currentWeekStart, -(7 - index) * 7),
    )
    return weeks.map((weekStart) => {
      const weekEnd = addDaysKey(weekStart, 6)
      const entries = collections.activityEvents.filter(
        (activity) =>
          !activity.reversedAt &&
          activity.meaningful &&
          STUDY_KINDS.has(activity.kind) &&
          activity.dateKey >= weekStart &&
          activity.dateKey <= weekEnd,
      )
      const row: Record<string, string | number> = {
        week: formatDateKey(weekStart, locale, { month: 'short', day: 'numeric' }),
      }
      for (const subject of derived?.subjects ?? []) {
        row[subject.id] = entries
          .filter((activity) => activity.subjectId === subject.id)
          .reduce((sum, activity) => sum + activity.minutes, 0)
      }
      row.total = entries.reduce((sum, activity) => sum + activity.minutes, 0)
      return row
    })
  }, [currentWeekStart, collections.activityEvents, derived?.subjects, locale])

  const fullTests = useMemo(
    () =>
      [...collections.practiceRecords]
        .filter((record) => record.totalScore !== null)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [collections.practiceRecords],
  )
  const scoreChart = fullTests.slice(-10).map((record) => ({
    date: formatDateKey(record.dateKey, locale, { month: 'short', day: 'numeric' }),
    score: record.totalScore,
  }))
  const latestScore = fullTests.at(-1)?.totalScore ?? null
  const bestScore =
    fullTests.length > 0 ? Math.max(...fullTests.map((record) => record.totalScore ?? 0)) : null
  const firstScore = fullTests[0]?.totalScore ?? null
  const scoreDelta =
    latestScore !== null && firstScore !== null && fullTests.length > 1
      ? latestScore - firstScore
      : null

  const openMistakes = collections.mistakes.filter((mistake) => mistake.status !== 'mastered')
  const masteredMistakes = collections.mistakes.filter(
    (mistake) => mistake.status === 'mastered',
  )
  const masteryRate =
    collections.mistakes.length > 0
      ? percent(masteredMistakes.length, collections.mistakes.length)
      : null

  const achievements = useMemo(
    () =>
      [...collections.achievements].sort(
        (a, b) => b.earnedAt.getTime() - a.earnedAt.getTime(),
      ),
    [collections.achievements],
  )

  const stats = derived?.streakStats
  const heatmap = derived?.heatmap ?? []
  const rangeLabel =
    range === 'all'
      ? 'All recorded activity'
      : `Last ${RANGE_DAYS[range]} days`
  const activeDayPct =
    range === 'all'
      ? null
      : percent(activeDays, RANGE_DAYS[range])

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Evidence over vibes"
        title="Progress"
        description="These numbers come from completed work and recorded practice. Nothing is backfilled, estimated, or invented."
        actions={
          <SegmentedControl
            value={range}
            onChange={setRange}
            size="sm"
            ariaLabel="Progress range"
            options={[
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: '90d', label: '90 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          icon={<Flame className="size-3.5" />}
          label="Study streak"
          value={stats?.currentStudy ?? 0}
          suffix={stats?.currentStudy === 1 ? 'day' : 'days'}
          detail={
            stats && stats.bestStudy > 0
              ? `Best ${stats.bestStudy} ${stats.bestStudy === 1 ? 'day' : 'days'}`
              : 'No streak yet'
          }
          accent
        />
        <StatCard
          icon={<Activity className="size-3.5" />}
          label="Study time"
          value={formatDuration(studyMinutes)}
          detail={`${studyActivities.length} study ${studyActivities.length === 1 ? 'activity' : 'activities'}`}
        />
        <StatCard
          icon={<Gauge className="size-3.5" />}
          label="Consistency"
          value={stats ? `${stats.weeklyConsistency.percent}%` : '—'}
          detail="Last 7 eligible days"
        />
        <StatCard
          icon={<CheckCircle2 className="size-3.5" />}
          label="Completed"
          value={completions}
          detail={`${activeDays} active ${activeDays === 1 ? 'day' : 'days'} in range`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[13.5px] font-semibold">Consistency map</h2>
              <p className="mt-0.5 text-[10px] text-faint">
                Last 18 weeks. Lighter cells are fewer meaningful activities.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-wider text-faint">Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={cn(
                    'size-2.5 rounded-[2px]',
                    level === 0
                      ? 'bg-white/[0.055]'
                      : level === 1
                        ? 'bg-lime/20'
                        : level === 2
                          ? 'bg-lime/38'
                          : level === 3
                            ? 'bg-lime/60'
                            : 'bg-lime/90',
                  )}
                />
              ))}
              <span className="font-mono text-[8px] uppercase tracking-wider text-faint">More</span>
            </div>
          </div>

          <div className="no-scrollbar mt-4 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-[3px]">
              <div className="mr-1 flex flex-col gap-[3px] pt-[14px]">
                {(heatmap[0]?.days ?? []).map((day) => (
                  <span
                    key={day.dateKey}
                    className="flex h-[11px] items-center font-mono text-[7px] uppercase text-faint"
                  >
                    {formatDateKey(day.dateKey, locale, { weekday: 'narrow' })}
                  </span>
                ))}
              </div>
              {heatmap.map((week) => (
                <div key={week.weekStart} className="flex flex-col gap-[3px]">
                  <span className="h-[11px] font-mono text-[7px] text-faint/60">
                    {week.weekStart.slice(8, 10) === '01' ||
                    week.weekStart === heatmap[0]?.weekStart
                      ? formatDateKey(week.weekStart, locale, { month: 'short' })
                      : ''}
                  </span>
                  {week.days.map((day) => (
                    <span
                      key={day.dateKey}
                      title={`${formatDateKey(day.dateKey, locale, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })} · ${day.meaningfulCount} ${day.meaningfulCount === 1 ? 'activity' : 'activities'} · ${formatDuration(day.minutes)}${day.rest ? ' · rest day' : ''}`}
                      className={cn(
                        'size-[11px] rounded-[2px]',
                        day.level === 0
                          ? day.rest
                            ? 'bg-teal/18 ring-1 ring-inset ring-teal/25'
                            : 'bg-white/[0.045]'
                          : day.level === 1
                            ? 'bg-lime/22'
                            : day.level === 2
                              ? 'bg-lime/40'
                              : day.level === 3
                                ? 'bg-lime/62'
                                : 'bg-lime/90',
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {heatmap.length === 0 ? (
            <p className="mt-3 text-[10.5px] text-faint">
              The map fills in as you complete real work.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[9px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-teal/18 ring-1 ring-inset ring-teal/25" />
              Rest day — protected
            </span>
            <span>
              {stats?.activeDaysThisMonth ?? 0} active days this month ·{' '}
              {stats?.studyDaysThisMonth ?? 0} study days
            </span>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface/80 p-4">
            <div className="flex items-center gap-2">
              <Target className="size-3.5 text-lime" />
              <p className="mono-label">Range summary</p>
            </div>
            <p className="mt-3 text-[10.5px] text-faint">{rangeLabel}</p>
            <div className="mt-3 space-y-2.5">
              <SummaryRow label="Study time" value={formatDuration(studyMinutes)} />
              <SummaryRow
                label="Active days"
                value={activeDayPct === null ? String(activeDays) : `${activeDays} (${activeDayPct}%)`}
              />
              <SummaryRow label="Average session" value={formatDuration(averageSession)} />
              <SummaryRow label="Task completions" value={String(completions)} />
              <SummaryRow
                label="Last activity"
                value={
                  rangeActivities.length === 0
                    ? 'None in range'
                    : formatDateKey(
                        [...rangeActivities]
                          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0]
                          ?.dateKey ?? today,
                        locale,
                        { month: 'short', day: 'numeric' },
                      )
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-warning" />
                <p className="mono-label">Activity mix</p>
              </div>
              <Badge tone="outline">{rangeActivities.length}</Badge>
            </div>
            {kindBreakdown.length === 0 ? (
              <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
                No recorded activity in this range.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {kindBreakdown.map((item) => (
                  <div key={item.kind}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-muted">{KIND_LABELS[item.kind]}</span>
                      <span className="font-mono text-[9px] text-faint">
                        {item.count} · {formatDuration(item.minutes)}
                      </span>
                    </div>
                    <Progress
                      value={item.count}
                      max={rangeActivities.length}
                      size="sm"
                      tone="lime"
                      className="mt-1.5"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <TrendingUp className="size-3.5 text-lime" /> Study minutes by week
              </h2>
              <p className="mt-1 text-[10px] text-faint">
                Eight weeks, stacked by subject. Only completed study time.
              </p>
            </div>
            <span className="font-mono text-[9px] text-faint">
              {formatDuration(weeklyChart.reduce((sum, week) => sum + Number(week.total ?? 0), 0))} total
            </span>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyChart}
                margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
                barCategoryGap="28%"
              >
                <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fill: '#646d62', fontSize: 8.5 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#646d62', fontSize: 8.5 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}m`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.035)' }}
                  contentStyle={{
                    background: '#141814',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    fontSize: 11,
                    color: '#f2f5ee',
                  }}
                  formatter={(value, name) => [
                    formatDuration(Number(value)),
                    name === 'total'
                      ? 'Total'
                      : (derived?.subjectById.get(String(name))?.name ?? String(name)),
                  ]}
                />
                {(derived?.subjects ?? []).map((subject, index) => (
                  <Bar
                    key={subject.id}
                    dataKey={subject.id}
                    stackId="minutes"
                    fill={subject.color}
                    radius={index === (derived?.subjects.length ?? 1) - 1 ? [3, 3, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            {(derived?.subjects ?? []).map((subject) => (
              <span
                key={subject.id}
                className="inline-flex items-center gap-1.5 text-[9px] text-faint"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
                {subject.name.split(' ').slice(-1)[0]}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <BookOpenCheck className="size-3.5 text-lime" /> Subject balance
              </h2>
              <p className="mt-1 text-[10px] text-faint">{rangeLabel} · study minutes</p>
            </div>
          </div>
          {trackedSubjectMinutes === 0 ? (
            <EmptyState
              compact
              icon={<CalendarCheck2 className="size-4" />}
              title="No study time in this range."
              description="Complete a mission or log practice to start the evidence trail."
            />
          ) : (
            <div className="mt-4 space-y-3">
              {subjectBreakdown.map((item) => (
                <div key={item.subject.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: item.subject.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">
                      {item.subject.name}
                    </span>
                    <span className="font-mono text-[9px] text-faint">
                      {formatDuration(item.minutes)}
                    </span>
                    <span className="w-8 text-right font-mono text-[9px] text-faint">
                      {percent(item.minutes, trackedSubjectMinutes)}%
                    </span>
                  </div>
                  <Progress
                    value={item.minutes}
                    max={trackedSubjectMinutes}
                    size="sm"
                    tone="lime"
                    className="mt-1.5"
                  />
                  <p className="mt-1 font-mono text-[8px] text-faint/80">
                    {item.activities} meaningful {item.activities === 1 ? 'activity' : 'activities'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]">
        <section className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <LineChartIcon className="size-3.5 text-lime" /> SAT score evidence
              </h2>
              <p className="mt-1 text-[10px] text-faint">
                Scored full tests only. Question sets stay in the accuracy log.
              </p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="font-num text-[20px] font-semibold leading-none">{latestScore ?? '—'}</p>
                <p className="mt-1 text-[8.5px] text-faint">latest</p>
              </div>
              <div>
                <p className="font-num text-[20px] font-semibold leading-none">{bestScore ?? '—'}</p>
                <p className="mt-1 text-[8.5px] text-faint">best</p>
              </div>
              <div>
                <p
                  className={cn(
                    'font-num text-[20px] font-semibold leading-none',
                    scoreDelta !== null && scoreDelta > 0 ? 'text-teal' : undefined,
                  )}
                >
                  {scoreDelta === null ? '—' : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`}
                </p>
                <p className="mt-1 text-[8.5px] text-faint">change</p>
              </div>
            </div>
          </div>
          {scoreChart.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
              <Target className="size-5 text-faint" />
              <p className="text-[12px] font-medium">No scored full tests yet.</p>
              <p className="max-w-sm text-[10.5px] leading-relaxed text-faint">
                Log one when you actually sit a timed test. A baseline is more useful than a guess.
              </p>
              <Link
                to="/study/sat?tab=practice"
                className="mt-1 text-[10.5px] font-medium text-lime hover:text-lime-soft"
              >
                Open SAT practice log
              </Link>
            </div>
          ) : (
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scoreChart} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="progressScoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c6f74a" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#c6f74a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#646d62', fontSize: 8.5 }}
                    axisLine={false}
                    tickLine={false}
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
                    formatter={(value) => [value, 'SAT score']}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#c6f74a"
                    strokeWidth={1.8}
                    fill="url(#progressScoreFill)"
                    dot={{ r: 2.5, fill: '#c6f74a', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="size-3.5 text-warning" />
              <h2 className="text-[13.5px] font-semibold">Mistake journal</h2>
            </div>
            <Link
              to="/study/sat?tab=mistakes"
              className="text-[10px] text-faint hover:text-warning"
            >
              Open journal
            </Link>
          </div>
          {collections.mistakes.length === 0 ? (
            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              No diagnosed mistakes yet. The journal turns wrong answers into a study plan.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-line bg-surface-2/35 p-2.5">
                  <p className="font-num text-[20px] font-semibold leading-none">
                    {openMistakes.length}
                  </p>
                  <p className="mt-1 text-[8.5px] text-faint">open</p>
                </div>
                <div className="rounded-xl border border-line bg-surface-2/35 p-2.5">
                  <p className="font-num text-[20px] font-semibold leading-none">
                    {masteredMistakes.length}
                  </p>
                  <p className="mt-1 text-[8.5px] text-faint">mastered</p>
                </div>
                <div className="rounded-xl border border-line bg-surface-2/35 p-2.5">
                  <p className="font-num text-[20px] font-semibold leading-none">
                    {masteryRate ?? 0}%
                  </p>
                  <p className="mt-1 text-[8.5px] text-faint">mastery</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-faint">Mastery rate</span>
                  <span className="font-mono text-[9px] text-muted">
                    {masteredMistakes.length}/{collections.mistakes.length}
                  </span>
                </div>
                <Progress
                  value={masteryRate ?? 0}
                  tone="teal"
                  size="sm"
                  className="mt-1.5"
                />
              </div>
              {openMistakes.filter((mistake) => mistake.nextReviewDate !== null && mistake.nextReviewDate <= today).length > 0 ? (
                <p className="mt-3 rounded-lg border border-warning/16 bg-warning/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-warning/90">
                  {
                    openMistakes.filter(
                      (mistake) =>
                        mistake.nextReviewDate !== null && mistake.nextReviewDate <= today,
                    ).length
                  }{' '}
                  mistakes are due for review now.
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <section>
        <SectionHeader
          title="Achievements"
          hint="Derived from real completions and kept once earned"
          action={
            <span className="font-mono text-[9px] text-faint">
              {achievements.length} earned
            </span>
          }
        />
        {achievements.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface/60">
            <EmptyState
              compact
              icon={<Award className="size-4" />}
              title="Nothing earned yet."
              description="Finish focused work and keep showing up. Achievements are not participation trophies."
            />
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {achievements.slice(0, 12).map((achievement, index) => (
              <div
                key={achievement.id}
                className="group flex items-start gap-3 rounded-2xl border border-line bg-surface/80 p-3.5"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl border',
                    index === 0
                      ? 'border-lime/25 bg-lime/10 text-lime'
                      : 'border-line bg-surface-2 text-faint',
                  )}
                >
                  {index < 3 ? <Trophy className="size-4" /> : <Award className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[11.5px] font-medium text-fg">{achievement.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-faint">
                    {achievement.description}
                  </p>
                  <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-faint/70">
                    {formatDateKey(achievement.dateKey, locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  detail,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  suffix?: string
  detail: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface/85 p-3.5 sm:p-4',
        accent ? 'border-lime/18' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5 text-faint">
        <span className={accent ? 'text-lime/80' : undefined}>{icon}</span>
        <p className="mono-label">{label}</p>
      </div>
      <p
        className={cn(
          'font-num mt-2.5 text-[24px] font-semibold leading-none tracking-[-0.02em]',
          accent && 'text-lime',
        )}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-[10px] font-normal text-faint">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-1.5 text-[10px] leading-snug text-faint">{detail}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[10.5px] text-faint">{label}</span>
      <span className="font-mono text-[10px] text-muted">{value}</span>
    </div>
  )
}
