import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { DateKey, LocalTime, Weekday } from '@/types/domain'

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidDateKey(value: string): value is DateKey {
  const match = DATE_KEY_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isValidLocalTime(value: string): value is LocalTime {
  return TIME_RE.test(value)
}

/** Local calendar date in a particular IANA timezone. */
export function dateKeyInTimeZone(date: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function todayKey(timeZone: string, now = new Date()): DateKey {
  return dateKeyInTimeZone(now, timeZone)
}

/** Noon-local Date used only for human-readable, date-only labels. */
export function dateKeyToLocalDate(key: DateKey): Date {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

/** UTC-noon Date used for deterministic day/week arithmetic. */
export function dateKeyToUtcDate(key: DateKey): Date {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function toKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10)
}

export function addDaysKey(key: DateKey, amount: number): DateKey {
  const date = dateKeyToUtcDate(key)
  date.setUTCDate(date.getUTCDate() + amount)
  return toKey(date)
}

export function addMonthsKey(key: DateKey, amount: number): DateKey {
  const date = dateKeyToUtcDate(key)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + amount)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return toKey(date)
}

export function getWeekday(key: DateKey): Weekday {
  return dateKeyToUtcDate(key).getUTCDay() as Weekday
}

export function startOfWeekKey(key: DateKey, weekStartsOn: Weekday): DateKey {
  const weekday = getWeekday(key)
  const offset = (weekday - weekStartsOn + 7) % 7
  return addDaysKey(key, -offset)
}

export function endOfWeekKey(key: DateKey, weekStartsOn: Weekday): DateKey {
  return addDaysKey(startOfWeekKey(key, weekStartsOn), 6)
}

export function weekDateKeys(weekStart: DateKey, weekStartsOn?: Weekday): DateKey[] {
  const start = weekStartsOn === undefined ? weekStart : startOfWeekKey(weekStart, weekStartsOn)
  return Array.from({ length: 7 }, (_, index) => addDaysKey(start, index))
}

export function daysBetween(start: DateKey, end: DateKey): number {
  return differenceInCalendarDays(dateKeyToUtcDate(end), dateKeyToUtcDate(start))
}

export function eachDateKey(start: DateKey, end: DateKey): DateKey[] {
  const days = daysBetween(start, end)
  if (days < 0) return []
  return Array.from({ length: days + 1 }, (_, index) => addDaysKey(start, index))
}

export function isTodayKey(key: DateKey, timeZone: string): boolean {
  return key === todayKey(timeZone)
}

export function isPastDateKey(key: DateKey, today: DateKey): boolean {
  return key < today
}

export function monthGridDates(anchor: DateKey, weekStartsOn: Weekday): DateKey[] {
  const monthStart = `${anchor.slice(0, 7)}-01`
  const gridStart = startOfWeekKey(monthStart, weekStartsOn)
  return Array.from({ length: 42 }, (_, index) => addDaysKey(gridStart, index))
}

export function monthStart(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`
}

export function monthEnd(key: DateKey): DateKey {
  const date = dateKeyToUtcDate(monthStart(key))
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return toKey(date)
}

export function formatDateKey(
  key: DateKey,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: undefined }).format(
    dateKeyToLocalDate(key),
  )
}

export function formatDateLong(key: DateKey, locale: string): string {
  return formatDateKey(key, locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMonthYear(key: DateKey, locale: string): string {
  return formatDateKey(key, locale, { month: 'long', year: 'numeric' })
}

export function formatMonthShort(key: DateKey, locale: string): string {
  return formatDateKey(key, locale, { month: 'short' })
}

export function formatWeekdayNarrow(key: DateKey, locale: string): string {
  return formatDateKey(key, locale, { weekday: 'narrow' })
}

export function formatWeekdayShort(key: DateKey, locale: string): string {
  return formatDateKey(key, locale, { weekday: 'short' })
}

export function formatWeekRange(start: DateKey, end: DateKey, locale: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const left = formatDateKey(start, locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const right = formatDateKey(end, locale, {
    ...(sameMonth ? {} : { month: 'short' }),
    day: 'numeric',
    year: 'numeric',
  })
  return `${left} – ${right}`
}

export function formatRelativeDateKey(
  key: DateKey,
  today: DateKey,
  locale: string,
): string {
  const delta = daysBetween(today, key)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  if (delta > 1 && delta <= 6) {
    return formatDateKey(key, locale, { weekday: 'long' })
  }
  return formatDateKey(key, locale)
}

export interface DeadlineLabel {
  label: string
  tone: 'overdue' | 'urgent' | 'soon' | 'normal'
}

export function deadlineLabel(
  key: DateKey | null,
  today: DateKey,
  locale: string,
): DeadlineLabel | null {
  if (!key) return null
  const delta = daysBetween(today, key)
  if (delta < 0) {
    const magnitude = Math.abs(delta)
    return {
      label: magnitude === 1 ? '1 day overdue' : `${magnitude} days overdue`,
      tone: 'overdue',
    }
  }
  if (delta === 0) return { label: 'Due today', tone: 'urgent' }
  if (delta === 1) return { label: 'Due tomorrow', tone: 'urgent' }
  if (delta <= 3) return { label: `Due in ${delta} days`, tone: 'soon' }
  return { label: `Due ${formatDateKey(key, locale)}`, tone: 'normal' }
}

export function timestampInTimeZone(
  date: Date,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date)
}

export function formatInstant(
  date: Date,
  timeZone: string,
  locale: string,
  withTime = true,
): string {
  return timestampInTimeZone(date, timeZone, locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

export function relativeInstant(
  date: Date,
  locale: string,
  now = new Date(),
): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return formatter.format(seconds, 'second')
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86_400), 'day')
}

export function minutesFromTime(time: LocalTime | null): number | null {
  if (!time || !isValidLocalTime(time)) return null
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function timeFromMinutes(totalMinutes: number): LocalTime {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function timeToMinutes(time: LocalTime | null): number | null {
  return minutesFromTime(time)
}

export function addMinutesToTime(time: LocalTime, minutes: number): LocalTime {
  return timeFromMinutes((minutesFromTime(time) ?? 0) + minutes)
}

export function formatTime(time: LocalTime | null, locale: string): string {
  if (!time) return 'Flexible'
  const minutes = minutesFromTime(time) ?? 0
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatTimeRange(
  start: LocalTime | null,
  end: LocalTime | null,
  locale: string,
): string {
  if (!start) return 'Flexible time'
  if (!end) return formatTime(start, locale)
  return `${formatTime(start, locale)}–${formatTime(end, locale)}`
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  if (safe < 60) return `${safe} min`
  const hours = Math.floor(safe / 60)
  const remainder = safe % 60
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

export function getGreeting(timeZone: string, _locale: string, now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now),
  )
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Minutes elapsed since local midnight in an IANA timezone. */
export function minutesSinceMidnight(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(values.hour) * 60 + Number(values.minute)
}

export function isWeekendKey(key: DateKey): boolean {
  const weekday = getWeekday(key)
  return weekday === 0 || weekday === 6
}

export function weekdayName(weekday: Weekday, locale: string): string {
  const sunday = new Date(2024, 0, 7, 12) // A fixed Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(addDays(sunday, weekday))
}

export function weekdayNarrow(weekday: Weekday, locale: string): string {
  const sunday = new Date(2024, 0, 7, 12)
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(sunday, weekday))
}

export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getBrowserLocale(): string {
  return navigator.language || 'en-US'
}

export function getSupportedTimezones(): string[] {
  try {
    if ('supportedValuesOf' in Intl && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    // Fall through to a useful small set.
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Yangon',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
}

export function getWeekStartForDate(date: Date, weekStartsOn: Weekday): DateKey {
  return startOfWeekKey(dateKeyInTimeZone(date, 'UTC'), weekStartsOn)
}

/** Kept for callers that need date-fns' local-week helper. */
export function localWeekStart(date: Date, weekStartsOn: Weekday): Date {
  return startOfWeek(date, { weekStartsOn })
}

export interface SmartDateResult {
  dateKey: DateKey
  resolvedLabel: string
}

const WEEKDAY_LOOKUP: Record<string, Weekday> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

/** Parses a deliberately small set of natural date phrases and always confirms in the UI. */
export function parseSmartDate(
  raw: string,
  today: DateKey,
  locale = 'en-US',
): SmartDateResult | null {
  const input = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!input) return null

  const build = (key: DateKey): SmartDateResult => ({
    dateKey: key,
    resolvedLabel: formatDateKey(key, locale),
  })

  if (input === 'today' || input === 'tonight') return build(today)
  if (input === 'tomorrow' || input === 'tmrw') return build(addDaysKey(today, 1))
  if (input === 'yesterday') return build(addDaysKey(today, -1))
  if (input === 'next week') return build(addDaysKey(today, 7))

  const inDays = /^in (\d{1,3}) days?$/.exec(input)
  if (inDays) return build(addDaysKey(today, Number(inDays[1])))

  const inWeeks = /^in (\d{1,2}) weeks?$/.exec(input)
  if (inWeeks) return build(addDaysKey(today, Number(inWeeks[1]) * 7))

  const weekdayMatch = /^(next|this) ([a-z]+)$/.exec(input)
  if (weekdayMatch) {
    const target = WEEKDAY_LOOKUP[weekdayMatch[2] ?? '']
    if (target === undefined) return null
    const current = getWeekday(today)
    let delta = (target - current + 7) % 7
    if (weekdayMatch[1] === 'next') {
      if (delta === 0) delta = 7
      if (delta < 7 && delta > 0) delta += 0
    }
    if (weekdayMatch[1] === 'this' && delta === 0) delta = 0
    return build(addDaysKey(today, delta))
  }

  const bareWeekday = WEEKDAY_LOOKUP[input]
  if (bareWeekday !== undefined) {
    const current = getWeekday(today)
    const delta = (bareWeekday - current + 7) % 7 || 7
    return build(addDaysKey(today, delta))
  }

  if (isValidDateKey(input)) return build(input)

  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(input)
  if (slash) {
    const nowYear = Number(today.slice(0, 4))
    let year = slash[3] ? Number(slash[3]) : nowYear
    if (year < 100) year += 2000
    const month = Number(slash[1])
    const day = Number(slash[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    let key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!isValidDateKey(key)) return null
    if (!slash[3] && daysBetween(today, key) < -30) {
      year += 1
      key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return build(key)
  }

  const monthDay = /^([a-z]{3,9}) (\d{1,2})(?:,? (\d{4}))?$/.exec(input)
  if (monthDay) {
    const monthName = monthDay[1] ?? ''
    const monthIndex = Array.from({ length: 12 }, (_, index) =>
      new Intl.DateTimeFormat('en-US', { month: 'long' })
        .format(new Date(2024, index, 1))
        .toLowerCase(),
    ).findIndex((name) => name === monthName || name.slice(0, 3) === monthName.slice(0, 3))
    if (monthIndex < 0) return null
    let year = monthDay[3] ? Number(monthDay[3]) : Number(today.slice(0, 4))
    const day = Number(monthDay[2])
    let key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!isValidDateKey(key)) return null
    if (!monthDay[3] && daysBetween(today, key) < -30) {
      year += 1
      key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return build(key)
  }

  return null
}
