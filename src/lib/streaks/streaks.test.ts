import { describe, expect, it } from 'vitest'
import type { ActivityEvent, ActivityKind, WorkspaceSettings } from '@/types/domain'
import { createDefaultSettings } from '@/lib/constants'
import {
  buildStreakDays,
  calculateStreakStats,
  daysSinceLastActivity,
  streakBreakMessage,
  type StreakContext,
} from './index'

const NOW = new Date('2026-01-12T18:00:00.000Z')

function settings(patch: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  return {
    ...createDefaultSettings({ timezone: 'UTC', locale: 'en-US' }),
    weekStartsOn: 1,
    weeklyRestDay: null,
    lighterDay: null,
    weekendMode: 'normal',
    preferredStudyDays: [0, 1, 2, 3, 4, 5, 6],
    unavailableDays: [],
    ...patch,
    streakRules: {
      ...createDefaultSettings({ timezone: 'UTC', locale: 'en-US' }).streakRules,
      ...patch.streakRules,
    },
    reminders: {
      ...createDefaultSettings({ timezone: 'UTC', locale: 'en-US' }).reminders,
      ...patch.reminders,
    },
  }
}

function event(
  dateKey: string,
  patch: Partial<ActivityEvent> & { kind?: ActivityKind } = {},
): ActivityEvent {
  return {
    id: `activity-${dateKey}-${patch.id ?? 'one'}`,
    kind: patch.kind ?? 'mission',
    entityType: 'mission',
    entityId: `mission-${dateKey}`,
    entityTitle: 'Active recall',
    subjectId: 'sat',
    dateKey,
    occurredAt: new Date(`${dateKey}T18:00:00.000Z`),
    minutes: 30,
    meaningful: true,
    confidence: null,
    practiceAttempted: null,
    practiceCorrect: null,
    reversedAt: null,
    reversalReason: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

function context(
  activityEvents: ActivityEvent[],
  patch: Partial<WorkspaceSettings> = {},
  today = '2026-01-12',
): StreakContext {
  return {
    activityEvents,
    settings: settings(patch),
    calendarEvents: [],
    checkIns: [],
    today,
  }
}

describe('streak stats', () => {
  it('counts consecutive active days including today', () => {
    const today = context(
      [event('2026-01-10'), event('2026-01-11'), event('2026-01-12')],
    )
    const stats = calculateStreakStats(today)
    expect(stats.currentStudy).toBe(3)
    expect(stats.bestStudy).toBe(3)
    expect(stats.currentProductivity).toBe(3)
    expect(stats.todayQualifies).toBe(true)
    expect(stats.yesterdayQualifies).toBe(true)
  })

  it('does not break a streak just because today has not happened yet', () => {
    const stats = calculateStreakStats(
      context([event('2026-01-10'), event('2026-01-11')]),
    )
    expect(stats.currentStudy).toBe(2)
    expect(stats.bestStudy).toBe(2)
    expect(stats.todayQualifies).toBe(false)
  })

  it('breaks the current streak after a missed non-rest day', () => {
    const stats = calculateStreakStats(
      context([event('2026-01-08'), event('2026-01-09'), event('2026-01-12')]),
    )
    expect(stats.currentStudy).toBe(1)
    expect(stats.bestStudy).toBe(2)
  })

  it('lets a scheduled rest day preserve continuity without adding a day', () => {
    const events = [event('2026-01-09'), event('2026-01-10'), event('2026-01-12')]
    const streakContext = context(events, { weeklyRestDay: 0 })
    const days = buildStreakDays(streakContext)
    const sunday = days.find((day) => day.dateKey === '2026-01-11')
    expect(sunday?.rest).toBe(true)
    expect(sunday?.studyActive).toBe(false)
    const stats = calculateStreakStats(streakContext)
    expect(stats.currentStudy).toBe(3)
    expect(stats.bestStudy).toBe(3)
  })

  it('honours a recorded rest day from a check-in', () => {
    const streakContext: StreakContext = {
      ...context([event('2026-01-10'), event('2026-01-12')]),
      checkIns: [
        {
          id: 'checkin-2026-01-11',
          dateKey: '2026-01-11',
          energy: null,
          workloadMode: 'rest',
          reflection: '',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    }
    expect(calculateStreakStats(streakContext).currentStudy).toBe(2)
  })

  it('ignores reversed activity', () => {
    const reversed = event('2026-01-11', { reversedAt: new Date() })
    const stats = calculateStreakStats(
      context([event('2026-01-10'), reversed, event('2026-01-12')]),
    )
    expect(stats.currentStudy).toBe(1)
    expect(stats.bestStudy).toBe(1)
  })
})

describe('streak qualification', () => {
  it('requires enough meaningful minutes in minutes mode', () => {
    const base = {
      qualification: 'minutes' as const,
      minimumMinutes: 25,
    }
    const short = context([event('2026-01-12', { minutes: 15 })], {
      streakRules: { ...settings().streakRules, ...base },
    })
    expect(calculateStreakStats(short).todayQualifies).toBe(false)

    const long = context(
      [event('2026-01-12', { minutes: 15 }), event('2026-01-12', { id: 'two', minutes: 10 })],
      { streakRules: { ...settings().streakRules, ...base } },
    )
    expect(calculateStreakStats(long).todayQualifies).toBe(true)
  })

  it('requires the configured number of subject-linked completions', () => {
    const streakContext = context(
      [
        event('2026-01-12', { subjectId: 'sat' }),
        event('2026-01-12', { id: 'two', subjectId: null, kind: 'assignment' }),
      ],
      {
        streakRules: {
          ...settings().streakRules,
          qualification: 'completions',
          minimumCompletions: 2,
        },
      },
    )
    // Productivity counts both; study requires two subject-linked study events.
    const stats = calculateStreakStats(streakContext)
    expect(stats.todayQualifies).toBe(true)
    const days = buildStreakDays(streakContext)
    expect(days[days.length - 1]?.studyActive).toBe(false)
  })

  it('counts homework for productivity but not for study', () => {
    const streakContext = context([event('2026-01-12', { kind: 'assignment', subjectId: null })])
    const stats = calculateStreakStats(streakContext)
    expect(stats.currentProductivity).toBe(1)
    expect(stats.currentStudy).toBe(0)
  })

  it('respects the homework toggle for productivity', () => {
    const streakContext = context(
      [event('2026-01-12', { kind: 'assignment', subjectId: null })],
      {
        streakRules: { ...settings().streakRules, includeHomework: false },
      },
    )
    expect(calculateStreakStats(streakContext).currentProductivity).toBe(0)
  })
})

describe('streak helpers', () => {
  it('measures days since the last meaningful activity', () => {
    expect(
      daysSinceLastActivity(
        [event('2026-01-01'), event('2026-01-09'), event('2026-01-10', { meaningful: false })],
        '2026-01-12',
      ),
    ).toBe(3)
    expect(daysSinceLastActivity([], '2026-01-12')).toBeNull()
  })

  it('writes an honest message when no streak exists', () => {
    const stats = calculateStreakStats(context([]))
    expect(streakBreakMessage(stats)).toBe('One meaningful session starts the record.')
    expect(streakBreakMessage({ ...stats, bestStudy: 4 })).toBe(
      'Your best is 4 days. A fresh run starts with one session.',
    )
  })
})
