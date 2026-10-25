import type { CalendarEvent, CalendarEventType, Weekday } from '@/types/domain'

const TYPE_COLORS: Record<CalendarEventType, string> = {
  study: '#c6f74a',
  homework: '#62a8ff',
  project: '#f4b860',
  personal: '#919b8e',
  rest: '#64d9c4',
  school: '#b79cff',
  break: '#64d9c4',
}

export function eventColor(
  event: Pick<CalendarEvent, 'eventType' | 'subjectId'>,
  subjects: Array<{ id: string; color: string }>,
): string {
  if (event.subjectId) {
    const subject = subjects.find((item) => item.id === event.subjectId)
    if (subject) return subject.color
  }
  return TYPE_COLORS[event.eventType] ?? '#919b8e'
}

export function calendarTypeColor(type: CalendarEventType): string {
  return TYPE_COLORS[type] ?? '#919b8e'
}

export const RECURRENCE_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
