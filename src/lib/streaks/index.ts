import type {
  ActivityEvent,
  CalendarEvent,
  DailyCheckIn,
  DateKey,
  StreakRules,
  Weekday,
  WorkspaceSettings,
} from '@/types/domain'
import { addDaysKey, daysBetween, eachDateKey, getWeekday, startOfWeekKey } from '@/lib/dates'

export interface StreakDay {
  dateKey: DateKey
  active: boolean
  rest: boolean
  studyActive: boolean
  productivityActive: boolean
  meaningfulCount: number
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface StreakStats {
  currentStudy: number
  bestStudy: number
  currentProductivity: number
  bestProductivity: number
  activeDaysThisMonth: number
  studyDaysThisMonth: number
  weeklyConsistency: { qualifying: number; eligible: number; percent: number }
  todayQualifies: boolean
  yesterdayQualifies: boolean
}

export interface StreakContext {
  activityEvents: ActivityEvent[]
  settings: WorkspaceSettings
  calendarEvents: CalendarEvent[]
  checkIns: DailyCheckIn[]
  today: DateKey
}

function isRestDay(
  dateKey: DateKey,
  settings: WorkspaceSettings,
  restDateKeys: Set<DateKey>,
): boolean {
  if (!settings.streakRules.preserveScheduledRestDays) return false
  if (restDateKeys.has(dateKey)) return true
  const weekday = getWeekday(dateKey) as Weekday
  if (settings.weeklyRestDay === weekday) return true
  if (settings.weekendMode === 'rest' && (weekday === 0 || weekday === 6)) return true
  return false
}

function isStudyKind(event: ActivityEvent): boolean {
  return (
    event.kind === 'mission' || event.kind === 'studyBlock' || event.kind === 'practice'
  )
}

function qualifies(
  events: ActivityEvent[],
  rules: StreakRules,
  mode: 'study' | 'productivity',
): boolean {
  if (events.length === 0) return false
  const relevant = events.filter((event) => {
    if (event.reversedAt) return false
    if (!event.meaningful) return false
    if (mode === 'study') return isStudyKind(event)
    if (event.kind === 'assignment') return rules.includeHomework
    if (event.kind === 'milestone') return rules.includeProjectMilestones
    return true
  })
  if (relevant.length === 0) return false
  const minutes = relevant.reduce((sum, event) => sum + Math.max(0, event.minutes), 0)
  if (rules.qualification === 'minutes') return minutes >= rules.minimumMinutes
  if (rules.qualification === 'completions') {
    const minimum = Math.max(1, rules.minimumCompletions)
    return relevant.filter((event) => event.subjectId || mode === 'productivity').length >= minimum
  }
  return true
}

export function collectRestDays(
  calendarEvents: CalendarEvent[],
  checkIns: DailyCheckIn[],
  settings: WorkspaceSettings,
): Set<DateKey> {
  const dates = new Set<DateKey>()
  if (!settings.streakRules.preserveScheduledRestDays) return dates
  for (const event of calendarEvents) {
    if (
      event.eventType === 'rest' &&
      event.status !== 'canceled' &&
      event.status !== 'skipped'
    ) {
      dates.add(event.dateKey)
    }
  }
  for (const checkIn of checkIns) {
    if (checkIn.workloadMode === 'rest') dates.add(checkIn.dateKey)
  }
  if (settings.weeklyRestDay !== null) {
    // The recurring weekly rest day is handled in isRestDay, not expanded forever here.
  }
  return dates
}

export function buildStreakDays(context: StreakContext): StreakDay[] {
  const { activityEvents, settings, today, calendarEvents, checkIns } = context
  const activeEvents = activityEvents.filter((event) => !event.reversedAt)
  const restDateKeys = collectRestDays(calendarEvents, checkIns, settings)
  const earliestActivity = activeEvents.reduce<DateKey | null>(
    (earliest, event) => (!earliest || event.dateKey < earliest ? event.dateKey : earliest),
    null,
  )
  const earliest = earliestActivity ?? addDaysKey(today, -120)
  const start = earliest < addDaysKey(today, -730) ? addDaysKey(today, -730) : earliest

  const byDay = new Map<DateKey, ActivityEvent[]>()
  for (const event of activeEvents) {
    const list = byDay.get(event.dateKey) ?? []
    list.push(event)
    byDay.set(event.dateKey, list)
  }

  return eachDateKey(start, today).map((dateKey) => {
    const events = byDay.get(dateKey) ?? []
    const relevant = events.filter((event) => event.meaningful && !event.reversedAt)
    const studyActive = qualifies(relevant, settings.streakRules, 'study')
    const productivityActive = qualifies(relevant, settings.streakRules, 'productivity')
    const minutes = relevant.reduce((sum, event) => sum + Math.max(0, event.minutes), 0)
    const meaningfulCount = relevant.length
    const level: StreakDay['level'] =
      meaningfulCount === 0 ? 0 : meaningfulCount === 1 ? 1 : meaningfulCount === 2 ? 2 : meaningfulCount <= 4 ? 3 : 4
    return {
      dateKey,
      active: productivityActive,
      rest: isRestDay(dateKey, settings, restDateKeys),
      studyActive,
      productivityActive,
      meaningfulCount,
      minutes,
      level,
    }
  })
}

function streakValues(days: StreakDay[], today: DateKey, mode: 'study' | 'productivity') {
  let current = 0
  let best = 0
  let running = 0
  let workingBackwards = true
  let pendingToday = days[days.length - 1]?.dateKey === today

  for (const day of days) {
    const qualifiesDay = mode === 'study' ? day.studyActive : day.productivityActive
    if (qualifiesDay) {
      running += 1
      best = Math.max(best, running)
    } else if (day.rest) {
      // A deliberate rest day neither adds to nor breaks a streak.
    } else {
      running = 0
    }
  }

  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index]
    if (!day || !workingBackwards) break
    const qualifiesDay = mode === 'study' ? day.studyActive : day.productivityActive
    if (day.dateKey === today && !qualifiesDay && pendingToday) {
      pendingToday = false
      continue
    }
    if (qualifiesDay) {
      current += 1
    } else if (day.rest) {
      continue
    } else {
      workingBackwards = false
    }
  }

  return { current, best }
}

export function calculateStreakStats(context: StreakContext): StreakStats {
  const days = buildStreakDays(context)
  const study = streakValues(days, context.today, 'study')
  const productivity = streakValues(days, context.today, 'productivity')
  const today = days[days.length - 1]
  const yesterday = days[days.length - 2]
  const monthPrefix = context.today.slice(0, 7)
  const monthDays = days.filter((day) => day.dateKey.startsWith(monthPrefix))
  const windowStart = addDaysKey(context.today, -6)
  const lastSeven = days.filter((day) => day.dateKey >= windowStart)
  const eligible = lastSeven.filter((day) => !day.rest)
  const qualifying = eligible.filter((day) => day.productivityActive)

  return {
    currentStudy: study.current,
    bestStudy: study.best,
    currentProductivity: productivity.current,
    bestProductivity: productivity.best,
    activeDaysThisMonth: monthDays.filter((day) => day.productivityActive).length,
    studyDaysThisMonth: monthDays.filter((day) => day.studyActive).length,
    weeklyConsistency: {
      qualifying: qualifying.length,
      eligible: eligible.length,
      percent: eligible.length ? Math.round((qualifying.length / eligible.length) * 100) : 0,
    },
    todayQualifies: today?.productivityActive ?? false,
    yesterdayQualifies: yesterday?.productivityActive ?? false,
  }
}

export function streakBreakMessage(stats: StreakStats): string {
  if (stats.currentStudy > 0) return 'Momentum is live.'
  if (stats.bestStudy > 0) {
    return `Your best is ${stats.bestStudy} ${stats.bestStudy === 1 ? 'day' : 'days'}. A fresh run starts with one session.`
  }
  return 'One meaningful session starts the record.'
}

export interface HeatmapWeek {
  weekStart: DateKey
  days: StreakDay[]
}

export function buildHeatmapWeeks(
  days: StreakDay[],
  weekStartsOn: Weekday,
  weekCount: number,
  today: DateKey,
): HeatmapWeek[] {
  const currentWeekStart = startOfWeekKey(today, weekStartsOn)
  const firstWeekStart = addDaysKey(currentWeekStart, -(weekCount - 1) * 7)
  const byDate = new Map(days.map((day) => [day.dateKey, day]))
  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const weekStart = addDaysKey(firstWeekStart, weekIndex * 7)
    return {
      weekStart,
      days: Array.from({ length: 7 }, (_, dayIndex) => {
        const dateKey = addDaysKey(weekStart, dayIndex)
        return (
          byDate.get(dateKey) ?? {
            dateKey,
            active: false,
            rest: false,
            studyActive: false,
            productivityActive: false,
            meaningfulCount: 0,
            minutes: 0,
            level: 0,
          }
        )
      }),
    }
  })
}

export function daysSinceLastActivity(
  activityEvents: ActivityEvent[],
  today: DateKey,
): number | null {
  const latest = activityEvents
    .filter((event) => !event.reversedAt && event.meaningful)
    .reduce<DateKey | null>((acc, event) => (!acc || event.dateKey > acc ? event.dateKey : acc), null)
  return latest ? Math.max(0, daysBetween(latest, today)) : null
}
