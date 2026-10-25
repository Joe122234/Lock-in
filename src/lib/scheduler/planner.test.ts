import { describe, expect, it } from 'vitest'
import type { PlannerEventInput, PlannerSubjectGoal, PlannerTask } from './planner'
import { planWeek, plannedCapacityForDay } from './planner'
import { createDefaultSettings } from '@/lib/constants'
import type { WorkspaceSettings } from '@/types/domain'

const WEEK_START = '2026-01-05' // Monday.

function settings(patch: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  const base = createDefaultSettings({ timezone: 'UTC', locale: 'en-US' })
  return {
    ...base,
    weekStartsOn: 1,
    weeklyRestDay: null,
    lighterDay: null,
    weekendMode: 'normal',
    preferredStudyDays: [0, 1, 2, 3, 4, 5, 6],
    unavailableDays: [],
    weekdayCapacityMinutes: 60,
    weekendCapacityMinutes: 120,
    ...patch,
    defaultDurations: { ...base.defaultDurations, ...patch.defaultDurations },
  }
}

function task(patch: Partial<PlannerTask> & Pick<PlannerTask, 'entityId'>): PlannerTask {
  const { entityId, ...rest } = patch
  return {
    entityType: 'mission',
    entityId,
    title: `Task ${entityId}`,
    subjectId: 'sat',
    priority: 'medium',
    dueDate: null,
    targetFinishDate: null,
    estimatedMinutes: 30,
    status: 'planned',
    ...rest,
  }
}

function existingEvent(patch: Partial<PlannerEventInput> = {}): PlannerEventInput {
  return {
    id: 'event-1',
    dateKey: '2026-01-05',
    estimatedMinutes: 30,
    countsTowardCapacity: true,
    status: 'planned',
    userEdited: false,
    seriesId: null,
    linkedEntityType: 'mission',
    linkedEntityId: 'mission-1',
    priority: 'medium',
    ...patch,
  }
}

const goal = (patch: Partial<PlannerSubjectGoal> = {}): PlannerSubjectGoal => ({
  subjectId: 'sat',
  subjectName: 'SAT',
  target: 2,
  completed: 0,
  ...patch,
})

function plan(
  options: {
    tasks?: PlannerTask[]
    events?: PlannerEventInput[]
    goals?: PlannerSubjectGoal[]
    settings?: WorkspaceSettings
    today?: string
    includeStudyGoals?: boolean
  } = {},
) {
  return planWeek({
    weekStart: WEEK_START,
    today: options.today ?? WEEK_START,
    settings: options.settings ?? settings(),
    mode: 'normal',
    tasks: options.tasks ?? [],
    existingEvents: options.events ?? [],
    subjectGoals: options.goals ?? [],
    includeStudyGoals: options.includeStudyGoals ?? false,
  })
}

describe('daily capacity', () => {
  it('applies the normal buffer and rounds down to five minutes', () => {
    const capacity = plannedCapacityForDay('2026-01-07', settings(), 'normal')
    expect(capacity.isWeekend).toBe(false)
    expect(capacity.baseCapacityMinutes).toBe(60)
    expect(capacity.plannedCapacityMinutes).toBe(50)
  })

  it('reduces capacity for lighter days and weekends without losing the base value', () => {
    const custom = settings({ lighterDay: 6, weekendMode: 'light', weekendCapacityMinutes: 150 })
    const saturday = plannedCapacityForDay('2026-01-10', custom, 'normal')
    expect(saturday.isWeekend).toBe(true)
    expect(saturday.isLighter).toBe(true)
    expect(saturday.baseCapacityMinutes).toBe(150)
    expect(saturday.plannedCapacityMinutes).toBe(45) // 150 × .85 × .7 × .55, rounded down.
    expect(plannedCapacityForDay('2026-01-11', custom, 'normal').plannedCapacityMinutes).toBe(85)
  })

  it('gives rest and unavailable days zero capacity', () => {
    const rest = plannedCapacityForDay(
      '2026-01-11',
      settings({ weeklyRestDay: 0 }),
      'normal',
    )
    expect(rest.isRest).toBe(true)
    expect(rest.plannedCapacityMinutes).toBe(0)
    const unavailable = plannedCapacityForDay(
      '2026-01-05',
      settings({ unavailableDays: [1] }),
      'normal',
    )
    expect(unavailable.isUnavailable).toBe(true)
    expect(unavailable.plannedCapacityMinutes).toBe(0)
  })

  it('uses the requested workload mode', () => {
    expect(plannedCapacityForDay('2026-01-07', settings(), 'light').plannedCapacityMinutes).toBe(30)
    expect(plannedCapacityForDay('2026-01-07', settings(), 'intensive').plannedCapacityMinutes).toBe(60)
  })
})

describe('week planning', () => {
  it('places work on real days and respects deadlines', () => {
    const result = plan({
      tasks: [
        task({
          entityId: 'high',
          priority: 'high',
          dueDate: '2026-01-06',
          estimatedMinutes: 45,
        }),
        task({
          entityId: 'low',
          priority: 'low',
          dueDate: '2026-01-09',
          estimatedMinutes: 45,
        }),
      ],
    })
    expect(result.proposals).toHaveLength(2)
    expect(result.proposals[0]?.linkedEntityId).toBe('high')
    expect(result.proposals[0]?.dateKey).toBe('2026-01-05')
    expect(result.proposals[0]?.estimatedMinutes).toBe(45)
    expect(result.proposals[1]?.linkedEntityId).toBe('low')
    expect(result.proposals[1]?.dateKey).toBe('2026-01-06')
    expect(result.warnings.filter((warning) => warning.code === 'unfit-task')).toHaveLength(0)
  })

  it('never plans more than the remaining capacity on a day', () => {
    const result = plan({
      tasks: [
        task({ entityId: 'urgent', priority: 'urgent', dueDate: '2026-01-05', estimatedMinutes: 45 }),
      ],
      events: [existingEvent({ dateKey: '2026-01-05', estimatedMinutes: 30 })],
    })
    expect(result.days[0]?.existingMinutes).toBe(30)
    expect(result.days[0]?.remainingMinutes).toBe(0)
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]?.estimatedMinutes).toBe(20)
    expect(result.warnings.some((warning) => warning.code === 'unfit-task')).toBe(true)
  })

  it('does not count canceled or skipped blocks against capacity', () => {
    const result = plan({
      tasks: [task({ entityId: 'work', estimatedMinutes: 40 })],
      events: [
        existingEvent({ dateKey: '2026-01-05', estimatedMinutes: 50, status: 'canceled' }),
        existingEvent({ id: 'event-2', dateKey: '2026-01-05', estimatedMinutes: 50, status: 'skipped' }),
      ],
    })
    expect(result.days[0]?.existingMinutes).toBe(0)
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]?.estimatedMinutes).toBe(40)
  })

  it('does not plan in the past when the week started earlier', () => {
    const result = plan({
      today: '2026-01-07',
      tasks: [task({ entityId: 'late', dueDate: '2026-01-06', estimatedMinutes: 30 })],
    })
    expect(result.days.slice(0, 2).every((day) => day.plannedCapacityMinutes === 0)).toBe(true)
    expect(result.proposals.length).toBeGreaterThan(0)
    expect(result.proposals.every((proposal) => proposal.dateKey >= '2026-01-07')).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'overdue')).toBe(true)
  })

  it('warns instead of silently dropping work when no capacity exists', () => {
    const result = plan({
      settings: settings({ unavailableDays: [0, 1, 2, 3, 4, 5, 6] }),
      tasks: [task({ entityId: 'homeless', estimatedMinutes: 60 })],
    })
    expect(result.proposals).toHaveLength(0)
    expect(result.warnings.some((warning) => warning.code === 'unfit-task')).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'no-capacity')).toBe(true)
  })

  it('adds goal sessions only when they fit and counts them honestly', () => {
    const result = plan({
      includeStudyGoals: true,
      goals: [goal({ target: 2 })],
      settings: settings({ defaultDurations: { ...settings().defaultDurations, mission: 30 } }),
    })
    expect(result.proposals).toHaveLength(2)
    expect(result.proposals.every((proposal) => proposal.goalSession)).toBe(true)
    expect(result.proposals.every((proposal) => proposal.subjectId === 'sat')).toBe(true)
    const dates = new Set(result.proposals.map((proposal) => proposal.dateKey))
    expect(dates.size).toBe(2)
    expect(result.goalOutcomes[0]).toMatchObject({
      target: 2,
      completed: 0,
      planned: 2,
      projected: 2,
    })
  })

  it('reports goal sessions that do not fit', () => {
    const result = plan({
      includeStudyGoals: true,
      goals: [goal({ target: 4 })],
      settings: settings({ weekdayCapacityMinutes: 0, weekendCapacityMinutes: 0 }),
    })
    expect(result.proposals).toHaveLength(0)
    expect(result.warnings.some((warning) => warning.code === 'goal-unmet')).toBe(true)
  })

  it('ignores completed tasks and scheduled minutes already placed this week', () => {
    const result = plan({
      tasks: [
        task({ entityId: 'done', status: 'completed', estimatedMinutes: 30 }),
        task({ entityId: 'partial', estimatedMinutes: 30, scheduledMinutesThisWeek: 30 }),
        task({ entityId: 'remaining', estimatedMinutes: 30, scheduledMinutesThisWeek: 10 }),
      ],
    })
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]?.linkedEntityId).toBe('remaining')
    expect(result.proposals[0]?.estimatedMinutes).toBe(20)
  })
})
