import type {
  ActivityEvent,
  Achievement,
  DateKey,
  Weekday,
  WorkspaceSettings,
} from '@/types/domain'
import { addDaysKey, daysBetween, startOfWeekKey } from '@/lib/dates'

interface DerivedAchievementInput {
  activityEvents: ActivityEvent[]
  settings: WorkspaceSettings
  today: DateKey
}

interface AchievementSeed {
  id: string
  title: string
  description: string
  earnedAt: Date
  dateKey: DateKey
}

const AP_IDS = ['ap-comparative', 'ap-world', 'ap-macro'] as const
const STUDY_KINDS = new Set(['mission', 'studyBlock', 'practice'])

function studyEvents(events: ActivityEvent[]): ActivityEvent[] {
  return events.filter(
    (event) =>
      !event.reversedAt &&
      event.meaningful &&
      STUDY_KINDS.has(event.kind) &&
      Boolean(event.subjectId),
  )
}

function groupByWeek(
  events: ActivityEvent[],
  weekStartsOn: Weekday,
): Map<DateKey, ActivityEvent[]> {
  const groups = new Map<DateKey, ActivityEvent[]>()
  for (const event of events) {
    const week = startOfWeekKey(event.dateKey, weekStartsOn)
    const list = groups.get(week) ?? []
    list.push(event)
    groups.set(week, list)
  }
  return groups
}

export function deriveAchievements({
  activityEvents,
  settings,
  today,
}: DerivedAchievementInput): AchievementSeed[] {
  const active = activityEvents.filter((event) => !event.reversedAt && event.meaningful)
  if (active.length === 0) return []
  const study = studyEvents(active)
  const achievements: AchievementSeed[] = []
  const weekStartsOn = settings.weekStartsOn

  const firstMission = active
    .filter((event) => event.kind === 'mission')
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
  if (firstMission) {
    achievements.push({
      id: 'first-mission',
      title: 'First mission',
      description: 'Completed the first focused study mission.',
      earnedAt: firstMission.occurredAt,
      dateKey: firstMission.dateKey,
    })
  }

  const weekly = groupByWeek(study, weekStartsOn)
  const requiredGoalEntries = Object.entries(settings.weeklyGoals).filter(
    ([, target]) => target > 0,
  )
  let fullWeek: AchievementSeed | null = null
  let apWeeks = 0
  let fourthApWeek: AchievementSeed | null = null

  const sortedWeeks = [...weekly.keys()].sort()
  for (const week of sortedWeeks) {
    const events = weekly.get(week) ?? []
    const bySubject = new Map<string, number>()
    for (const event of events) {
      if (!event.subjectId) continue
      bySubject.set(event.subjectId, (bySubject.get(event.subjectId) ?? 0) + 1)
    }
    const allGoals =
      requiredGoalEntries.length > 0 &&
      requiredGoalEntries.every(([subjectId, target]) => (bySubject.get(subjectId) ?? 0) >= target)
    const lastEvent = events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1)
    if (allGoals && !fullWeek && lastEvent) {
      fullWeek = {
        id: 'first-full-week',
        title: 'Every area moved',
        description: 'Met every weekly study goal in the same week.',
        earnedAt: lastEvent.occurredAt,
        dateKey: lastEvent.dateKey,
      }
    }
    const allAps = AP_IDS.every((id) => (bySubject.get(id) ?? 0) >= 1)
    if (allAps) {
      apWeeks += 1
      if (apWeeks === 4 && !fourthApWeek && lastEvent) {
        fourthApWeek = {
          id: 'four-ap-weeks',
          title: 'AP rhythm',
          description: 'Moved all three AP subjects in the same week, four times.',
          earnedAt: lastEvent.occurredAt,
          dateKey: lastEvent.dateKey,
        }
      }
    }
  }
  if (fullWeek) achievements.push(fullWeek)
  if (fourthApWeek) achievements.push(fourthApWeek)

  const currentWeekStart = startOfWeekKey(today, weekStartsOn)
  const earliest = sortedWeeks[0]
  if (earliest) {
    let run = 0
    let satAchieved: AchievementSeed | null = null
    let week = earliest
    let guard = 0
    while (week <= currentWeekStart && guard < 520) {
      const events = weekly.get(week) ?? []
      const satInWeek = events.some((event) => event.subjectId === 'sat')
      if (satInWeek) {
        run += 1
        if (run >= 4 && !satAchieved) {
          const lastSat = events
            .filter((event) => event.subjectId === 'sat')
            .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
            .at(-1)
          if (lastSat) {
            satAchieved = {
              id: 'sat-consistency',
              title: 'SAT consistency',
              description: 'Studied SAT in four consecutive weeks.',
              earnedAt: lastSat.occurredAt,
              dateKey: lastSat.dateKey,
            }
          }
        }
      } else {
        run = 0
      }
      week = addDaysKey(week, 7)
      guard += 1
    }
    if (satAchieved) achievements.push(satAchieved)
  }

  const uniqueDays = [...new Set(active.map((event) => event.dateKey))].sort()
  for (let index = 1; index < uniqueDays.length; index += 1) {
    const previous = uniqueDays[index - 1]
    const current = uniqueDays[index]
    if (previous && current && daysBetween(previous, current) >= 7) {
      const returningEvent = active
        .filter((event) => event.dateKey === current)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
      if (returningEvent) {
        achievements.push({
          id: 'back-on-track',
          title: 'Back on track',
          description: 'Returned to meaningful work after a week away. Rest counts; restarting counts.',
          earnedAt: returningEvent.occurredAt,
          dateKey: returningEvent.dateKey,
        })
      }
      break
    }
  }

  return achievements
}

export function mergeWithStoredAchievements(
  derived: AchievementSeed[],
  stored: Achievement[],
): Achievement[] {
  const storedById = new Map(stored.map((achievement) => [achievement.id, achievement]))
  return derived.map((item) => {
    const existing = storedById.get(item.id)
    return (
      existing ?? {
        ...item,
        createdAt: item.earnedAt,
        updatedAt: item.earnedAt,
      }
    )
  })
}
