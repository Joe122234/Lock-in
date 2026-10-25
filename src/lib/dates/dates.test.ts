import { describe, expect, it } from 'vitest'
import {
  addDaysKey,
  addMinutesToTime,
  daysBetween,
  deadlineLabel,
  endOfWeekKey,
  formatDuration,
  formatWeekRange,
  isValidDateKey,
  isValidLocalTime,
  minutesSinceMidnight,
  parseSmartDate,
  startOfWeekKey,
  timeFromMinutes,
  timeToMinutes,
  todayKey,
  weekDateKeys,
} from './index'

describe('date keys', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDateKey('2026-10-25')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true)
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-04-31')).toBe(false)
    expect(isValidDateKey('26-01-01')).toBe(false)
  })

  it('moves date keys across month and year boundaries', () => {
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9)
  })

  it('resolves local today in the requested timezone', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z')
    expect(todayKey('UTC', instant)).toBe('2026-01-01')
    expect(todayKey('America/Los_Angeles', instant)).toBe('2025-12-31')
    expect(todayKey('Asia/Tokyo', instant)).toBe('2026-01-01')
  })

  it('computes local minutes since midnight', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z')
    expect(minutesSinceMidnight('UTC', instant)).toBe(150)
    expect(minutesSinceMidnight('Asia/Kolkata', instant)).toBe(480)
  })
})

describe('weeks', () => {
  it('honours Monday and Sunday week starts', () => {
    expect(startOfWeekKey('2026-01-07', 1)).toBe('2026-01-05')
    expect(startOfWeekKey('2026-01-07', 0)).toBe('2026-01-04')
    expect(endOfWeekKey('2026-01-07', 1)).toBe('2026-01-11')
  })

  it('returns seven consecutive dates', () => {
    expect(weekDateKeys('2026-01-05')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ])
  })

  it('formats a readable week range without losing the end day', () => {
    expect(formatWeekRange('2026-10-19', '2026-10-25', 'en-US')).toBe('Oct 19 – 25, 2026')
    expect(formatWeekRange('2026-10-26', '2026-11-01', 'en-US')).toBe('Oct 26 – Nov 1, 2026')
    expect(formatWeekRange('2026-12-28', '2027-01-03', 'en-US')).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    )
  })
})

describe('local times', () => {
  it('validates and converts HH:mm values', () => {
    expect(isValidLocalTime('00:00')).toBe(true)
    expect(isValidLocalTime('23:59')).toBe(true)
    expect(isValidLocalTime('24:00')).toBe(false)
    expect(isValidLocalTime('7:30')).toBe(false)
    expect(timeToMinutes('09:45')).toBe(585)
    expect(timeToMinutes(null)).toBeNull()
    expect(timeFromMinutes(585)).toBe('09:45')
    expect(timeFromMinutes(1440)).toBe('00:00')
    expect(addMinutesToTime('23:30', 45)).toBe('00:15')
  })

  it('formats durations without pretending precision', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(59)).toBe('59 min')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(95)).toBe('1h 35m')
  })
})

describe('smart date parsing', () => {
  const today = '2026-01-07' // Wednesday.

  it('parses relative phrases', () => {
    expect(parseSmartDate('today', today)?.dateKey).toBe('2026-01-07')
    expect(parseSmartDate('tomorrow', today)?.dateKey).toBe('2026-01-08')
    expect(parseSmartDate('in 3 days', today)?.dateKey).toBe('2026-01-10')
    expect(parseSmartDate('in 2 weeks', today)?.dateKey).toBe('2026-01-21')
  })

  it('resolves weekdays relative to today', () => {
    expect(parseSmartDate('friday', today)?.dateKey).toBe('2026-01-09')
    expect(parseSmartDate('wednesday', today)?.dateKey).toBe('2026-01-14')
    expect(parseSmartDate('next monday', today)?.dateKey).toBe('2026-01-12')
  })

  it('parses explicit dates and rolls a yearless past date forward', () => {
    expect(parseSmartDate('2026-03-14', today)?.dateKey).toBe('2026-03-14')
    expect(parseSmartDate('3/14', today)?.dateKey).toBe('2026-03-14')
    expect(parseSmartDate('12/20', today)?.dateKey).toBe('2026-12-20')
    expect(parseSmartDate('12/20/2027', today)?.dateKey).toBe('2027-12-20')
    expect(parseSmartDate('not a date', today)).toBeNull()
    expect(parseSmartDate('2/30', today)).toBeNull()
  })

  it('labels deadlines from the real date', () => {
    expect(deadlineLabel('2026-01-07', '2026-01-07', 'en-US')?.label).toBe('Due today')
    expect(deadlineLabel('2026-01-08', '2026-01-07', 'en-US')?.label).toBe('Due tomorrow')
    expect(deadlineLabel('2026-01-06', '2026-01-07', 'en-US')?.label).toContain('overdue')
    expect(deadlineLabel(null, '2026-01-07', 'en-US')).toBeNull()
  })
})
