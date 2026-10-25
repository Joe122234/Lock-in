import {
  addDaysKey,
  daysBetween,
  getWeekday,
  startOfWeekKey,
  weekdayName,
} from '@/lib/dates'
import type { DateKey, RecurrenceRule, Weekday } from '@/types/domain'

export const RECURRENCE_HORIZON_DAYS = 84

export function normalizeRecurrenceRule(
  rule: RecurrenceRule,
  fallbackWeekday: Weekday,
): RecurrenceRule {
  return {
    ...rule,
    interval: Math.max(1, Math.round(rule.interval || 1)),
    weekdays:
      rule.frequency === 'weekly' && rule.weekdays.length === 0
        ? [fallbackWeekday]
        : [...new Set(rule.weekdays)].sort((a, b) => a - b),
    until: rule.until ?? null,
  }
}

export function generateOccurrences(
  rule: RecurrenceRule,
  startsOn: DateKey,
  horizonEnd: DateKey,
  options: { weekStartsOn?: Weekday; maxOccurrences?: number } = {},
): DateKey[] {
  const normalized = normalizeRecurrenceRule(rule, getWeekday(startsOn))
  const weekStartsOn = options.weekStartsOn ?? 1
  const maxOccurrences = options.maxOccurrences ?? 500
  const until = normalized.until && normalized.until < horizonEnd ? normalized.until : horizonEnd
  if (until < startsOn) return []

  const interval = Math.max(1, normalized.interval || 1)
  const weekdays =
    normalized.weekdays.length > 0 ? normalized.weekdays : [getWeekday(startsOn)]

  if (normalized.frequency === 'daily') {
    const results: DateKey[] = []
    let cursor = startsOn
    let count = 0
    while (cursor <= until && count < maxOccurrences) {
      results.push(cursor)
      count += 1
      cursor = addDaysKey(cursor, interval)
    }
    return results
  }

  const occurrenceWeekStart = startOfWeekKey(startsOn, weekStartsOn)
  const results: DateKey[] = []
  let weekStart = occurrenceWeekStart
  let guard = 0
  while (weekStart <= until && results.length < maxOccurrences && guard < 520) {
    for (const weekday of weekdays) {
      const offset = (weekday - weekStartsOn + 7) % 7
      const candidate = addDaysKey(weekStart, offset)
      if (candidate >= startsOn && candidate <= until) {
        results.push(candidate)
      }
    }
    guard += 1
    weekStart = addDaysKey(weekStart, 7 * interval)
  }

  return [...new Set(results)].sort()
}

export function nextRecurrenceDates(
  rule: RecurrenceRule,
  startsOn: DateKey,
  afterDate: DateKey,
  count: number,
  options: { weekStartsOn?: Weekday } = {},
): DateKey[] {
  const horizon = addDaysKey(afterDate, 366)
  return generateOccurrences(rule, startsOn, horizon, {
    ...options,
    maxOccurrences: Math.max(count * 3, 30),
  })
    .filter((dateKey) => dateKey > afterDate)
    .slice(0, count)
}

export function describeRecurrence(rule: RecurrenceRule, locale = 'en-US'): string {
  const interval = Math.max(1, rule.interval || 1)
  if (rule.frequency === 'daily') {
    return interval === 1 ? 'Every day' : `Every ${interval} days`
  }
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b)
  const dayText =
    days.length === 7
      ? 'every day'
      : days.length > 0
        ? days.map((day) => weekdayName(day, locale).slice(0, 3)).join(', ')
        : 'weekly'
  const intervalText = interval === 1 ? 'Every week' : `Every ${interval} weeks`
  return `${intervalText} on ${dayText}`
}

export function occurrenceId(seriesId: string, dateKey: DateKey): string {
  return `${seriesId}__${dateKey}`
}

export function seriesHorizonEnd(today: DateKey): DateKey {
  return addDaysKey(today, RECURRENCE_HORIZON_DAYS)
}

export function recurrenceDatesAfter(
  rule: RecurrenceRule,
  startsOn: DateKey,
  afterDate: DateKey,
  horizonEnd: DateKey,
  weekStartsOn?: Weekday,
): DateKey[] {
  return generateOccurrences(rule, startsOn, horizonEnd, { weekStartsOn }).filter(
    (dateKey) => dateKey > afterDate,
  )
}

export function isOccurrenceBeyondHorizon(
  seriesRule: RecurrenceRule,
  startsOn: DateKey,
  dateKey: DateKey,
  horizonEnd: DateKey,
): boolean {
  if (dateKey > horizonEnd) return true
  if (seriesRule.until && dateKey > seriesRule.until) return true
  return daysBetween(startsOn, dateKey) > RECURRENCE_HORIZON_DAYS * 4
}
