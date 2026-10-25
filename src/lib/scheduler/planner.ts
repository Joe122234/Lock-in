import type {
  CalendarEventType,
  DateKey,
  LinkedEntityType,
  Priority,
  WorkspaceSettings,
  WorkloadMode,
} from '@/types/domain'
import {
  addDaysKey,
  daysBetween,
  formatDateKey,
  formatDuration,
  isWeekendKey,
  weekDateKeys,
} from '@/lib/dates'
import { PRIORITY_RANK } from '@/lib/constants'

export type PlannerEntityType = 'mission' | 'assignment' | 'milestone'

export interface PlannerTask {
  entityType: PlannerEntityType
  entityId: string
  title: string
  subjectId: string | null
  priority: Priority
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  estimatedMinutes: number
  status: string
  course?: string
  scheduledMinutesThisWeek?: number
}

export interface PlannerEventInput {
  id: string
  dateKey: DateKey
  estimatedMinutes: number
  countsTowardCapacity: boolean
  status: string
  userEdited: boolean
  seriesId: string | null
  linkedEntityType: LinkedEntityType
  linkedEntityId: string | null
  priority?: Priority
  title?: string
  startTime?: string | null
}

export interface PlannerSubjectGoal {
  subjectId: string
  subjectName: string
  target: number
  completed: number
  color?: string
}

export interface PlanDay {
  dateKey: DateKey
  isWeekend: boolean
  isRest: boolean
  isUnavailable: boolean
  isLighter: boolean
  isPreferred: boolean
  baseCapacityMinutes: number
  plannedCapacityMinutes: number
  existingMinutes: number
  proposedMinutes: number
  remainingMinutes: number
  fillPercent: number
}

export interface PlanProposal {
  id: string
  dateKey: DateKey
  startTime: null
  estimatedMinutes: number
  title: string
  eventType: CalendarEventType
  subjectId: string | null
  linkedEntityType: LinkedEntityType
  linkedEntityId: string | null
  reason: string
  sourceTaskKey: string | null
  goalSession: boolean
}

export interface PlanWarning {
  code:
    | 'unfit-task'
    | 'goal-unmet'
    | 'overdue'
    | 'no-capacity'
    | 'day-over-capacity'
    | 'rebalance-unfit'
  message: string
  taskKey?: string
  subjectId?: string
  severity: 'warning' | 'danger'
}

export interface PlanResult {
  days: PlanDay[]
  proposals: PlanProposal[]
  warnings: PlanWarning[]
  goalOutcomes: Array<PlannerSubjectGoal & { planned: number; projected: number }>
}

export interface PlanOptions {
  weekStart: DateKey
  today: DateKey
  settings: WorkspaceSettings
  mode: WorkloadMode
  tasks: PlannerTask[]
  existingEvents: PlannerEventInput[]
  subjectGoals: PlannerSubjectGoal[]
  includeStudyGoals: boolean
}

const MODE_FACTOR: Record<WorkloadMode, number> = {
  light: 0.55,
  normal: 0.85,
  intensive: 1,
}

function roundToFive(value: number): number {
  return Math.max(0, Math.floor(value / 5) * 5)
}

export function plannedCapacityForDay(
  dateKey: DateKey,
  settings: WorkspaceSettings,
  mode: WorkloadMode,
): Pick<
  PlanDay,
  | 'baseCapacityMinutes'
  | 'plannedCapacityMinutes'
  | 'isRest'
  | 'isUnavailable'
  | 'isLighter'
  | 'isPreferred'
  | 'isWeekend'
> {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  const isWeekend = isWeekendKey(dateKey)
  const isUnavailable = settings.unavailableDays.includes(
    weekday as (typeof settings.unavailableDays)[number],
  )
  const isWeeklyRest = settings.weeklyRestDay === weekday
  const weekendRest = isWeekend && settings.weekendMode === 'rest'
  const isRest = isWeeklyRest || weekendRest
  const isLighter = settings.lighterDay === weekday
  const isPreferred = settings.preferredStudyDays.includes(
    weekday as (typeof settings.preferredStudyDays)[number],
  )
  const base = isWeekend
    ? settings.weekendCapacityMinutes
    : settings.weekdayCapacityMinutes
  if (isUnavailable || isRest) {
    return {
      baseCapacityMinutes: base,
      plannedCapacityMinutes: 0,
      isRest,
      isUnavailable,
      isLighter,
      isPreferred,
      isWeekend,
    }
  }
  let factor = MODE_FACTOR[mode]
  if (isWeekend && settings.weekendMode === 'light') factor *= 0.7
  if (isLighter) factor *= 0.55
  if (!isPreferred) factor *= 0.75
  return {
    baseCapacityMinutes: base,
    plannedCapacityMinutes: roundToFive(base * factor),
    isRest,
    isUnavailable,
    isLighter,
    isPreferred,
    isWeekend,
  }
}

function eventConsumesCapacity(event: PlannerEventInput): boolean {
  if (!event.countsTowardCapacity) return false
  if (event.status === 'canceled' || event.status === 'skipped') return false
  return true
}

function taskKey(task: PlannerTask): string {
  return `${task.entityType}:${task.entityId}`
}

function effectiveDeadline(task: PlannerTask, planStart: DateKey, windowEnd: DateKey): DateKey {
  const actualDue =
    task.dueDate === null
      ? null
      : task.dueDate < planStart
        ? windowEnd
        : task.dueDate > windowEnd
          ? windowEnd
          : task.dueDate
  const target =
    task.targetFinishDate === null
      ? null
      : task.targetFinishDate < planStart
        ? null
        : task.targetFinishDate > windowEnd
          ? windowEnd
          : task.targetFinishDate
  if (target && actualDue) return target < actualDue ? target : actualDue
  return target ?? actualDue ?? windowEnd
}

function blockMinutesFor(task: PlannerTask, settings: WorkspaceSettings): number {
  if (task.entityType === 'mission') {
    return Math.max(15, Math.min(60, task.estimatedMinutes || settings.defaultDurations.mission))
  }
  if (task.entityType === 'milestone') {
    return Math.max(20, Math.min(90, settings.defaultDurations.milestoneBlock))
  }
  return Math.max(20, Math.min(60, settings.defaultDurations.assignmentBlock))
}

function eventTypeForTask(task: PlannerTask): CalendarEventType {
  if (task.entityType === 'assignment') return 'homework'
  if (task.entityType === 'milestone') return 'project'
  return 'study'
}

function linkedTypeForTask(task: PlannerTask): LinkedEntityType {
  return task.entityType
}

function deadlineReason(task: PlannerTask, today: DateKey, locale: string): string {
  const key = task.targetFinishDate ?? task.dueDate
  if (!key) return task.status === 'inProgress' ? 'Continue what you started' : 'Make progress'
  const delta = daysBetween(today, key)
  if (delta < 0) {
    return task.targetFinishDate
      ? `Target finish passed · keep the real deadline in view`
      : `${Math.abs(delta)}d overdue · resume without rebuilding the backlog`
  }
  if (delta === 0) return 'Due today'
  if (delta === 1) return 'Due tomorrow'
  if (delta <= 7) return `Due ${formatDateKey(key, locale, { weekday: 'short' })}`
  return `Target finish ${formatDateKey(key, locale)}`
}

export function planWeek(options: PlanOptions): PlanResult {
  const { weekStart, today, settings, mode, existingEvents, subjectGoals } = options
  const windowEnd = addDaysKey(weekStart, 6)
  const planStart = windowEnd < today ? windowEnd : weekStart < today ? today : weekStart
  const dates = weekDateKeys(weekStart)
  const locale = settings.locale

  const days: PlanDay[] = dates.map((dateKey) => {
    const capacity = plannedCapacityForDay(dateKey, settings, mode)
    const existingMinutes = existingEvents
      .filter((event) => event.dateKey === dateKey && eventConsumesCapacity(event))
      .reduce((sum, event) => sum + event.estimatedMinutes, 0)
    const usable = dateKey < planStart ? 0 : capacity.plannedCapacityMinutes
    return {
      dateKey,
      ...capacity,
      plannedCapacityMinutes: usable,
      existingMinutes,
      proposedMinutes: 0,
      remainingMinutes: Math.max(0, usable - existingMinutes),
      fillPercent: usable > 0 ? Math.min(100, Math.round((existingMinutes / usable) * 100)) : 0,
    }
  })

  const proposals: PlanProposal[] = []
  const warnings: PlanWarning[] = []
  const tasks = [...options.tasks]
    .filter((task) => task.status !== 'completed' && task.status !== 'skipped')
    .sort((a, b) => {
      if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) {
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
      }
      const aDeadline = a.targetFinishDate ?? a.dueDate ?? windowEnd
      const bDeadline = b.targetFinishDate ?? b.dueDate ?? windowEnd
      return aDeadline.localeCompare(bDeadline)
    })

  for (const task of tasks) {
    const deadline = effectiveDeadline(task, planStart, windowEnd)
    if ((task.dueDate && task.dueDate > windowEnd) || deadline < planStart) continue
    const alreadyScheduled = task.scheduledMinutesThisWeek ?? 0
    let remaining = Math.max(0, task.estimatedMinutes - alreadyScheduled)
    if (remaining === 0) continue
    const key = taskKey(task)
    const blockSize = blockMinutesFor(task, settings)
    let placedAny = false

    while (remaining > 0) {
      const usableDays = days.filter(
        (day) =>
          day.dateKey >= planStart &&
          day.dateKey <= deadline &&
          day.remainingMinutes >= Math.min(blockSize, remaining, 15),
      )
      if (usableDays.length === 0) break
      // Spread a task across days rather than stacking every block on one overloaded day.
      const preferred = usableDays.filter(
        (day) =>
          !proposals.some(
            (proposal) =>
              proposal.sourceTaskKey === key && proposal.dateKey === day.dateKey,
          ),
      )
      const candidates = (preferred.length > 0 ? preferred : usableDays).sort((a, b) => {
        const preferredA = a.isPreferred ? 0 : 1
        const preferredB = b.isPreferred ? 0 : 1
        if (preferredA !== preferredB) return preferredA - preferredB
        if (a.remainingMinutes !== b.remainingMinutes) return b.remainingMinutes - a.remainingMinutes
        return a.dateKey.localeCompare(b.dateKey)
      })
      const day = candidates[0]
      if (!day) break
      const minutes = Math.min(blockSize, remaining, day.remainingMinutes)
      if (minutes < 15) break
      const reasonParts = [deadlineReason(task, today, locale)]
      if (task.priority === 'urgent' || task.priority === 'high') {
        reasonParts.push(`${task.priority} priority`)
      }
      proposals.push({
        id: `${key}:${day.dateKey}:${proposals.length}`,
        dateKey: day.dateKey,
        startTime: null,
        estimatedMinutes: minutes,
        title: task.title,
        eventType: eventTypeForTask(task),
        subjectId: task.subjectId,
        linkedEntityType: linkedTypeForTask(task),
        linkedEntityId: task.entityId,
        reason: reasonParts.join(' · '),
        sourceTaskKey: key,
        goalSession: false,
      })
      day.remainingMinutes -= minutes
      day.proposedMinutes += minutes
      day.fillPercent =
        day.plannedCapacityMinutes > 0
          ? Math.min(
              100,
              Math.round(
                ((day.existingMinutes + day.proposedMinutes) / day.plannedCapacityMinutes) * 100,
              ),
            )
          : 0
      remaining -= minutes
      placedAny = true
    }

    if (remaining > 0) {
      warnings.push({
        code: 'unfit-task',
        severity: 'warning',
        taskKey: key,
        message: `${task.title}: ${formatDuration(remaining)} could not fit before its useful deadline this week.`,
      })
      if (task.dueDate && task.dueDate < today) {
        warnings.push({
          code: 'overdue',
          severity: 'danger',
          taskKey: key,
          message: `${task.title} is overdue. Its real deadline has not been changed.`,
        })
      }
    } else if (placedAny && task.dueDate && task.dueDate < today) {
      warnings.push({
        code: 'overdue',
        severity: 'danger',
        taskKey: key,
        message: `${task.title} is overdue. This plan helps you resume; the real deadline stays visible.`,
      })
    }
  }

  const goalOutcomes = subjectGoals.map((goal) => {
    const plannedMissionSessions = proposals.filter(
      (proposal) =>
        proposal.goalSession === false &&
        proposal.subjectId === goal.subjectId &&
        proposal.eventType === 'study',
    ).length
    return {
      ...goal,
      planned: plannedMissionSessions,
      projected: goal.completed + plannedMissionSessions,
    }
  })

  if (options.includeStudyGoals) {
    for (const goal of goalOutcomes) {
      let missing = Math.max(0, goal.target - goal.completed - goal.planned)
      while (missing > 0) {
        const duration = Math.max(15, settings.defaultDurations.mission)
        const candidates = days
          .filter(
            (day) =>
              day.dateKey >= planStart &&
              day.remainingMinutes >= duration &&
              !proposals.some(
                (proposal) =>
                  proposal.goalSession && proposal.subjectId === goal.subjectId && proposal.dateKey === day.dateKey,
              ),
          )
          .sort((a, b) => {
            const preferredA = a.isPreferred ? 0 : 1
            const preferredB = b.isPreferred ? 0 : 1
            if (preferredA !== preferredB) return preferredA - preferredB
            return b.remainingMinutes - a.remainingMinutes
          })
        const day = candidates[0]
        if (!day) {
          warnings.push({
            code: 'goal-unmet',
            severity: 'warning',
            subjectId: goal.subjectId,
            message: `${goal.subjectName}: ${missing} weekly ${missing === 1 ? 'session' : 'sessions'} still do not fit this week.`,
          })
          break
        }
        proposals.push({
          id: `goal:${goal.subjectId}:${day.dateKey}:${proposals.length}`,
          dateKey: day.dateKey,
          startTime: null,
          estimatedMinutes: duration,
          title: `${goal.subjectName} focus`,
          eventType: 'study',
          subjectId: goal.subjectId,
          linkedEntityType: null,
          linkedEntityId: null,
          reason: `Weekly goal · ${Math.min(goal.target, goal.completed + goal.planned + 1)} of ${goal.target} sessions`,
          sourceTaskKey: null,
          goalSession: true,
        })
        day.remainingMinutes -= duration
        day.proposedMinutes += duration
        day.fillPercent =
          day.plannedCapacityMinutes > 0
            ? Math.min(
                100,
                Math.round(
                  ((day.existingMinutes + day.proposedMinutes) / day.plannedCapacityMinutes) * 100,
                ),
              )
            : 0
        goal.planned += 1
        goal.projected += 1
        missing -= 1
      }
    }
  }

  if (proposals.length === 0 && tasks.length > 0) {
    warnings.push({
      code: 'no-capacity',
      severity: 'danger',
      message: 'No capacity was available in this window. Free up a day or use the plan anyway after adjusting your limits.',
    })
  }

  return { days, proposals, warnings, goalOutcomes }
}

export interface RebalanceMove {
  eventId: string
  title: string
  fromDate: DateKey
  toDate: DateKey
  minutes: number
  reason: string
}

export interface RebalanceResult {
  moves: RebalanceMove[]
  warnings: PlanWarning[]
  days: PlanDay[]
}

export interface RebalanceDeadline {
  linkedEntityType: LinkedEntityType
  linkedEntityId: string | null
  priority: Priority
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
}

export interface RebalanceOptions {
  weekStart: DateKey
  today: DateKey
  settings: WorkspaceSettings
  mode: WorkloadMode
  events: PlannerEventInput[]
  deadlines: RebalanceDeadline[]
}

export function rebalanceWeek(options: RebalanceOptions): RebalanceResult {
  const { weekStart, today, settings, mode, events } = options
  const windowEnd = addDaysKey(weekStart, 6)
  const planStart = weekStart < today ? today : weekStart
  const dates = weekDateKeys(weekStart)
  const days: PlanDay[] = dates.map((dateKey) => {
    const capacity = plannedCapacityForDay(dateKey, settings, mode)
    return {
      dateKey,
      ...capacity,
      plannedCapacityMinutes: dateKey < planStart ? 0 : capacity.plannedCapacityMinutes,
      existingMinutes: 0,
      proposedMinutes: 0,
      remainingMinutes: 0,
      fillPercent: 0,
    }
  })
  const dayMap = new Map(days.map((day) => [day.dateKey, day]))

  const isLocked = (event: PlannerEventInput) =>
    event.userEdited ||
    Boolean(event.seriesId) ||
    event.status === 'completed' ||
    event.status === 'skipped' ||
    event.status === 'canceled'

  for (const event of events.filter(isLocked)) {
    if (!eventConsumesCapacity(event)) continue
    const day = dayMap.get(event.dateKey)
    if (!day) continue
    day.existingMinutes += event.estimatedMinutes
  }
  for (const day of days) {
    day.remainingMinutes = Math.max(0, day.plannedCapacityMinutes - day.existingMinutes)
    day.fillPercent =
      day.plannedCapacityMinutes > 0
        ? Math.min(100, Math.round((day.existingMinutes / day.plannedCapacityMinutes) * 100))
        : 0
  }

  const deadlineFor = (event: PlannerEventInput): { deadline: DateKey; taskPriority: Priority } => {
    const linked = options.deadlines.find(
      (item) =>
        item.linkedEntityType === event.linkedEntityType &&
        item.linkedEntityId === event.linkedEntityId,
    )
    const raw = linked?.targetFinishDate ?? linked?.dueDate ?? null
    const deadline =
      !raw || raw < planStart ? windowEnd : raw > windowEnd ? windowEnd : raw
    return { deadline, taskPriority: linked?.priority ?? 'medium' }
  }

  const flexible = events
    .filter((event) => !isLocked(event) && event.countsTowardCapacity)
    .filter((event) => event.status !== 'completed')
    .sort((a, b) => {
      const aDeadline = deadlineFor(a).deadline
      const bDeadline = deadlineFor(b).deadline
      if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline)
      return PRIORITY_RANK[deadlineFor(b).taskPriority] - PRIORITY_RANK[deadlineFor(a).taskPriority]
    })

  const moves: RebalanceMove[] = []
  const warnings: PlanWarning[] = []

  for (const event of flexible) {
    if (event.dateKey < planStart) continue
    const { deadline } = deadlineFor(event)
    const currentDay = dayMap.get(event.dateKey)
    const candidates = days
      .filter((day) => day.dateKey >= planStart && day.dateKey <= deadline)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    let chosen: PlanDay | null = null
    if (currentDay && currentDay.remainingMinutes >= event.estimatedMinutes) {
      chosen = currentDay
    } else {
      chosen =
        candidates.find((day) => day.remainingMinutes >= event.estimatedMinutes) ?? null
    }
    if (!chosen) {
      warnings.push({
        code: 'rebalance-unfit',
        severity: 'warning',
        message: `${event.title ?? 'A work block'} (${formatDuration(event.estimatedMinutes)}) has nowhere to move without overloading a day.`,
      })
      continue
    }
    chosen.remainingMinutes -= event.estimatedMinutes
    chosen.proposedMinutes += event.estimatedMinutes
    chosen.fillPercent =
      chosen.plannedCapacityMinutes > 0
        ? Math.min(
            100,
            Math.round(
              ((chosen.existingMinutes + chosen.proposedMinutes) / chosen.plannedCapacityMinutes) *
                100,
            ),
          )
        : 0
    if (chosen.dateKey !== event.dateKey) {
      moves.push({
        eventId: event.id,
        title: event.title ?? 'Work block',
        fromDate: event.dateKey,
        toDate: chosen.dateKey,
        minutes: event.estimatedMinutes,
        reason: `Keeps ${event.dateKey} within capacity`,
      })
    }
  }

  return { moves, warnings, days }
}
