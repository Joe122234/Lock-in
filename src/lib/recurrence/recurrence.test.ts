import { describe, expect, it } from 'vitest'
import type { RecurrenceRule } from '@/types/domain'
import {
  describeRecurrence,
  generateOccurrences,
  isOccurrenceBeyondHorizon,
  nextRecurrenceDates,
  normalizeRecurrenceRule,
  occurrenceId,
  recurrenceDatesAfter,
  seriesHorizonEnd,
} from './index'

const daily = (interval = 1, until: string | null = null): RecurrenceRule => ({
  frequency: 'daily',
  interval,
  weekdays: [],
  until,
})

const weekly = (
  weekdays: number[],
  interval = 1,
  until: string | null = null,
): RecurrenceRule => ({
  frequency: 'weekly',
  interval,
  weekdays: weekdays as RecurrenceRule['weekdays'],
  until,
})

describe('recurrence normalization', () => {
  it('repairs empty intervals and fills a missing weekday from the start date', () => {
    expect(
      normalizeRecurrenceRule(
        { frequency: 'weekly', interval: 0, weekdays: [], until: null },
        3,
      ),
    ).toEqual({ frequency: 'weekly', interval: 1, weekdays: [3], until: null })
  })

  it('deduplicates and sorts weekdays', () => {
    const rule = normalizeRecurrenceRule(weekly([5, 1, 5, 3], 2), 1)
    expect(rule.weekdays).toEqual([1, 3, 5])
    expect(rule.interval).toBe(2)
  })
})

describe('daily occurrences', () => {
  it('respects the interval and the inclusive end date', () => {
    expect(generateOccurrences(daily(2), '2026-01-01', '2026-01-10')).toEqual([
      '2026-01-01',
      '2026-01-03',
      '2026-01-05',
      '2026-01-07',
      '2026-01-09',
    ])
  })

  it('stops at an until date that is earlier than the horizon', () => {
    expect(generateOccurrences(daily(1, '2026-01-03'), '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])
  })

  it('returns nothing when the window ends before it starts', () => {
    expect(generateOccurrences(daily(1), '2026-02-01', '2026-01-31')).toEqual([])
  })
})

describe('weekly occurrences', () => {
  it('uses the start weekday when the rule has no weekdays', () => {
    // 2026-01-07 is a Wednesday.
    expect(
      generateOccurrences(
        { frequency: 'weekly', interval: 1, weekdays: [], until: null },
        '2026-01-07',
        '2026-01-21',
      ),
    ).toEqual(['2026-01-07', '2026-01-14', '2026-01-21'])
  })

  it('generates multiple weekdays and never returns a date before the start', () => {
    // Monday 2026-01-05 is skipped because the series starts on Wednesday.
    expect(generateOccurrences(weekly([1, 4]), '2026-01-07', '2026-01-15')).toEqual([
      '2026-01-08',
      '2026-01-12',
      '2026-01-15',
    ])
  })

  it('advances whole weeks for a biweekly rule', () => {
    expect(generateOccurrences(weekly([1, 4], 2), '2026-01-08', '2026-02-01')).toEqual([
      '2026-01-08',
      '2026-01-19',
      '2026-01-22',
    ])
  })

  it('honours a custom week start', () => {
    // With Sunday weeks, Monday 2026-01-05 belongs to the week starting 2026-01-04.
    expect(
      generateOccurrences(weekly([0, 1]), '2026-01-05', '2026-01-12', { weekStartsOn: 0 }),
    ).toEqual(['2026-01-05', '2026-01-11', '2026-01-12'])
  })

  it('caps runaway occurrence generation', () => {
    expect(generateOccurrences(daily(1), '2026-01-01', '2027-01-01', { maxOccurrences: 5 })).toHaveLength(5)
  })
})

describe('derived dates', () => {
  it('returns future occurrences only and respects the count', () => {
    expect(nextRecurrenceDates(weekly([1, 3]), '2026-01-05', '2026-01-07', 3)).toEqual([
      '2026-01-12',
      '2026-01-14',
      '2026-01-19',
    ])
  })

  it('filters dates after a cursor within a fixed horizon', () => {
    expect(
      recurrenceDatesAfter(weekly([1]), '2026-01-05', '2026-01-12', '2026-02-02'),
    ).toEqual(['2026-01-19', '2026-01-26', '2026-02-02'])
  })

  it('detects dates outside the series horizon', () => {
    const rule = weekly([1])
    expect(isOccurrenceBeyondHorizon(rule, '2026-01-05', '2026-03-30', '2026-04-01')).toBe(false)
    expect(isOccurrenceBeyondHorizon(rule, '2026-01-05', '2026-04-02', '2026-04-01')).toBe(true)
    expect(seriesHorizonEnd('2026-01-01')).toBe('2026-03-26')
    expect(isOccurrenceBeyondHorizon(rule, '2026-01-05', '2026-02-02', '2026-04-01')).toBe(false)
    expect(
      isOccurrenceBeyondHorizon({ ...rule, until: '2026-01-31' }, '2026-01-05', '2026-02-02', '2026-04-01'),
    ).toBe(true)
  })
})

describe('recurrence descriptions and ids', () => {
  it('describes daily and weekly rules', () => {
    expect(describeRecurrence(daily(1))).toBe('Every day')
    expect(describeRecurrence(daily(3))).toBe('Every 3 days')
    expect(describeRecurrence(weekly([1, 3, 5]))).toBe('Every week on Mon, Wed, Fri')
    expect(describeRecurrence(weekly([1], 2))).toBe('Every 2 weeks on Mon')
  })

  it('creates deterministic occurrence ids', () => {
    expect(occurrenceId('series-1', '2026-01-05')).toBe('series-1__2026-01-05')
  })
})
