import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type {
  CalendarEvent,
  DateKey,
  LocalTime,
  RecurrenceRule,
  RecurrenceSeries,
  Weekday,
} from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import {
  addDaysKey,
  addMinutesToTime,
  dateKeyInTimeZone,
} from '@/lib/dates'
import {
  generateOccurrences,
  occurrenceId,
  seriesHorizonEnd,
} from '@/lib/recurrence'
import { readDocument, serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface PlannerEventDraft {
  dateKey: DateKey
  estimatedMinutes: number
  title: string
  eventType: CalendarEvent['eventType']
  subjectId: string | null
  linkedEntityType: CalendarEvent['linkedEntityType']
  linkedEntityId: string | null
}

export interface NewCalendarEventInput {
  title: string
  dateKey: DateKey
  startTime?: LocalTime | null
  endTime?: LocalTime | null
  estimatedMinutes: number
  eventType: CalendarEvent['eventType']
  subjectId?: string | null
  notes?: string
  countsTowardCapacity?: boolean
  linkedEntityType?: CalendarEvent['linkedEntityType']
  linkedEntityId?: string | null
  recurrenceRule?: RecurrenceRule | null
  weekStartsOn?: Weekday
  timezone?: string
  userEdited?: boolean
}

export function eventEndTime(
  startTime: LocalTime | null | undefined,
  endTime: LocalTime | null | undefined,
  estimatedMinutes: number,
): LocalTime | null {
  if (endTime) return endTime
  if (!startTime) return null
  return addMinutesToTime(startTime, estimatedMinutes)
}

function eventPayload(
  input: NewCalendarEventInput,
  overrides: Partial<CalendarEvent> = {},
): Omit<CalendarEvent, 'id'> {
  const now = new Date()
  return {
    linkedEntityType: input.linkedEntityType ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
    title: input.title.trim(),
    dateKey: input.dateKey,
    startTime: input.startTime ?? null,
    endTime: eventEndTime(input.startTime, input.endTime, input.estimatedMinutes),
    estimatedMinutes: Math.max(1, Math.round(input.estimatedMinutes)),
    eventType: input.eventType,
    subjectId: input.subjectId ?? null,
    status: 'planned',
    recurrenceRule: input.recurrenceRule ?? null,
    userEdited: input.userEdited ?? true,
    countsTowardCapacity: input.countsTowardCapacity ?? true,
    notes: input.notes ?? '',
    seriesId: null,
    occurrenceDate: null,
    completionActivityId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export async function createCalendarEvent(input: NewCalendarEventInput): Promise<string> {
  const db = getDb()
  if (input.recurrenceRule) {
    return createRecurringCalendarEvent(input)
  }
  const ref = doc(collectionRef(db, 'calendarEvents'))
  const payload = eventPayload(input)
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(payload) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function createRecurringCalendarEvent(
  input: NewCalendarEventInput,
): Promise<string> {
  if (!input.recurrenceRule) throw new Error('A recurrence rule is required.')
  const db = getDb()
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = dateKeyInTimeZone(new Date(), timezone)
  const futureStart = input.dateKey > today ? input.dateKey : today
  const horizon = seriesHorizonEnd(futureStart)
  const seriesRef = doc(collectionRef(db, 'recurrenceSeries'))
  const occurrences = generateOccurrences(input.recurrenceRule, input.dateKey, horizon, {
    weekStartsOn: input.weekStartsOn ?? 1,
  })
  const now = new Date()
  const series: Omit<RecurrenceSeries, 'id'> = {
    ownerType: 'calendarEvent',
    startsOn: input.dateKey,
    rule: input.recurrenceRule,
    timezone,
    eventTemplate: {
      title: input.title.trim(),
      eventType: input.eventType,
      subjectId: input.subjectId ?? null,
      startTime: input.startTime ?? null,
      endTime: eventEndTime(input.startTime, input.endTime, input.estimatedMinutes),
      estimatedMinutes: input.estimatedMinutes,
      countsTowardCapacity: input.countsTowardCapacity ?? true,
      notes: input.notes ?? '',
      linkedEntityType: input.linkedEntityType ?? null,
      linkedEntityId: input.linkedEntityId ?? null,
    },
    missionTemplate: null,
    materializedThrough: horizon,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.set(seriesRef, {
      ...(serializeDocument(series) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    occurrences.forEach((dateKey) => {
      const ref = documentRef(db, 'calendarEvents', occurrenceId(seriesRef.id, dateKey))
      const occurrence = eventPayload(
        { ...input, dateKey, userEdited: false },
        {
          seriesId: seriesRef.id,
          occurrenceDate: dateKey,
          recurrenceRule: input.recurrenceRule ?? null,
        },
      )
      batch.set(ref, {
        ...(serializeDocument(occurrence) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  })
  return seriesRef.id
}

export async function updateCalendarEvent(
  eventId: string,
  patch: Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>>,
  options: { userEdited?: boolean } = {},
): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'calendarEvents', eventId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) throw new Error('Calendar event not found.')
    const event = readDocument<CalendarEvent>(snapshot)
    const serialized = serializeDocument({
      ...patch,
      ...(options.userEdited === false ? {} : { userEdited: true }),
    }) as Record<string, unknown>
    const batch = writeBatch(db)
    batch.update(ref, { ...serialized, updatedAt: serverTimestamp() })
    if (
      event.linkedEntityType === 'mission' &&
      event.linkedEntityId &&
      patch.dateKey !== undefined
    ) {
      batch.update(documentRef(db, 'missions', event.linkedEntityId), {
        plannedDate: patch.dateKey,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function updateRecurringEventFuture(
  event: CalendarEvent,
  series: RecurrenceSeries,
  patch: Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>>,
  knownEvents: CalendarEvent[],
): Promise<void> {
  const db = getDb()
  const allowedKeys = [
    'title',
    'startTime',
    'endTime',
    'estimatedMinutes',
    'subjectId',
    'eventType',
    'notes',
    'countsTowardCapacity',
  ] as const
  const eventPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) =>
      (allowedKeys as readonly string[]).includes(key),
    ),
  )
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    const futureEvents = knownEvents.filter(
      (candidate) =>
        candidate.seriesId === series.id &&
        candidate.dateKey >= event.dateKey &&
        !candidate.userEdited &&
        candidate.status === 'planned',
    )
    futureEvents.forEach((candidate) => {
      batch.update(documentRef(db, 'calendarEvents', candidate.id), {
        ...(serializeDocument(eventPatch) as Record<string, unknown>),
        updatedAt: serverTimestamp(),
      })
    })
    batch.update(documentRef(db, 'recurrenceSeries', series.id), {
      ...(serializeDocument({
        eventTemplate: {
          ...series.eventTemplate,
          ...eventPatch,
        },
      }) as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    })
    batch.update(documentRef(db, 'calendarEvents', event.id), {
      ...(serializeDocument(eventPatch) as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  })
}

export async function skipCalendarEvent(eventId: string): Promise<void> {
  await updateDocument<CalendarEvent>('calendarEvents', eventId, {
    status: 'skipped',
    userEdited: true,
  })
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'calendarEvents', eventId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const event = readDocument<CalendarEvent>(snapshot)
    const batch = writeBatch(db)
    batch.delete(ref)
    if (event.linkedEntityType === 'mission' && event.linkedEntityId) {
      const missionRef = documentRef(db, 'missions', event.linkedEntityId)
      batch.update(missionRef, {
        plannedDate: null,
        plannedEventId: null,
        status: 'inbox',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function stopRecurrenceSeries(
  seriesId: string,
  fromDate: DateKey,
  knownEvents: CalendarEvent[],
): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.update(documentRef(db, 'recurrenceSeries', seriesId), {
      active: false,
      'rule.until': addDaysKey(fromDate, -1),
      updatedAt: serverTimestamp(),
    })
    knownEvents
      .filter(
        (event) =>
          event.seriesId === seriesId &&
          event.dateKey >= fromDate &&
          event.status === 'planned' &&
          !event.userEdited,
      )
      .forEach((event) => {
        batch.update(documentRef(db, 'calendarEvents', event.id), {
          status: 'canceled',
          updatedAt: serverTimestamp(),
        })
      })
    await batch.commit()
  })
}

export async function extendRecurrenceSeries(
  series: RecurrenceSeries,
  today: DateKey,
  weekStartsOn: Weekday,
): Promise<number> {
  if (!series.active || series.ownerType !== 'calendarEvent' || !series.eventTemplate) return 0
  if (series.materializedThrough && series.materializedThrough >= addDaysKey(today, 42)) return 0
  if (series.rule.until && series.rule.until < today) return 0
  const template = series.eventTemplate
  const newHorizon = seriesHorizonEnd(today)
  const from = series.materializedThrough ?? series.startsOn
  const occurrences = generateOccurrences(series.rule, series.startsOn, newHorizon, {
    weekStartsOn,
  }).filter((dateKey) => dateKey > from)
  if (occurrences.length === 0) return 0
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    occurrences.forEach((dateKey) => {
      const ref = documentRef(db, 'calendarEvents', occurrenceId(series.id, dateKey))
      const now = new Date()
      const event: Omit<CalendarEvent, 'id'> = {
        linkedEntityType: template.linkedEntityType,
        linkedEntityId: template.linkedEntityId,
        title: template.title,
        dateKey,
        startTime: template.startTime,
        endTime: template.endTime,
        estimatedMinutes: template.estimatedMinutes,
        eventType: template.eventType,
        subjectId: template.subjectId,
        status: 'planned',
        recurrenceRule: series.rule,
        userEdited: false,
        countsTowardCapacity: template.countsTowardCapacity,
        notes: template.notes,
        seriesId: series.id,
        occurrenceDate: dateKey,
        completionActivityId: null,
        createdAt: now,
        updatedAt: now,
      }
      batch.set(ref, {
        ...(serializeDocument(event) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    batch.update(documentRef(db, 'recurrenceSeries', series.id), {
      materializedThrough: newHorizon,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  })
  return occurrences.length
}

export async function completeCalendarEvent(
  eventId: string,
  dateKey: DateKey,
): Promise<string> {
  const db = getDb()
  return trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const ref = documentRef(db, 'calendarEvents', eventId)
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists()) throw new Error('Calendar event not found.')
      const event = readDocument<CalendarEvent>(snapshot)
      if (event.status === 'completed' && event.completionActivityId) {
        return event.completionActivityId
      }
      const activityRef = doc(collectionRef(db, 'activityEvents'))
      const meaningful = ['study', 'homework', 'project'].includes(event.eventType)
      const kind =
        event.eventType === 'homework'
          ? 'assignment'
          : event.eventType === 'project'
            ? 'milestone'
            : 'studyBlock'
      transaction.set(activityRef, {
        kind,
        entityType: 'calendarEvent',
        entityId: eventId,
        entityTitle: event.title,
        subjectId: event.subjectId,
        dateKey,
        occurredAt: serverTimestamp(),
        minutes: event.estimatedMinutes,
        meaningful,
        confidence: null,
        practiceAttempted: null,
        practiceCorrect: null,
        reversedAt: null,
        reversalReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(ref, {
        status: 'completed',
        completionActivityId: activityRef.id,
        updatedAt: serverTimestamp(),
      })
      return activityRef.id
    }),
  )
}

export async function reopenCalendarEvent(eventId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'calendarEvents', eventId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const event = readDocument<CalendarEvent>(snapshot)
    const batch = writeBatch(db)
    batch.update(ref, {
      status: 'planned',
      completionActivityId: null,
      updatedAt: serverTimestamp(),
    })
    if (event.completionActivityId) {
      batch.update(documentRef(db, 'activityEvents', event.completionActivityId), {
        reversedAt: serverTimestamp(),
        reversalReason: 'Calendar block reopened',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function createPlannedCalendarEvents(
  drafts: PlannerEventDraft[],
  missionIdsWithEvents: string[] = [],
): Promise<void> {
  if (drafts.length === 0) return
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    const firstEventByMission = new Map<string, string>()
    for (const draft of drafts) {
      const ref = doc(collectionRef(db, 'calendarEvents'))
      const now = new Date()
      const event = {
        linkedEntityType: draft.linkedEntityType,
        linkedEntityId: draft.linkedEntityId,
        title: draft.title,
        dateKey: draft.dateKey,
        startTime: null,
        endTime: null,
        estimatedMinutes: draft.estimatedMinutes,
        eventType: draft.eventType,
        subjectId: draft.subjectId,
        status: 'planned',
        recurrenceRule: null,
        userEdited: false,
        countsTowardCapacity: true,
        notes: '',
        seriesId: null,
        occurrenceDate: null,
        completionActivityId: null,
        createdAt: now,
        updatedAt: now,
      }
      batch.set(ref, {
        ...(serializeDocument(event) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      if (
        draft.linkedEntityType === 'mission' &&
        draft.linkedEntityId &&
        !firstEventByMission.has(draft.linkedEntityId)
      ) {
        firstEventByMission.set(draft.linkedEntityId, ref.id)
      }
    }
    for (const [missionId, eventId] of firstEventByMission) {
      if (missionIdsWithEvents.includes(missionId)) continue
      const firstDraft = drafts.find((draft) => draft.linkedEntityId === missionId)
      batch.update(documentRef(db, 'missions', missionId), {
        plannedDate: firstDraft?.dateKey ?? null,
        plannedEventId: eventId,
        status: 'planned',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function moveCalendarEvents(
  moves: Array<{ eventId: string; fromDate: DateKey; toDate: DateKey }>,
): Promise<void> {
  if (moves.length === 0) return
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    for (const move of moves) {
      const eventRef = documentRef(db, 'calendarEvents', move.eventId)
      const snapshot = await getDoc(eventRef)
      if (!snapshot.exists()) continue
      const event = readDocument<CalendarEvent>(snapshot)
      batch.update(eventRef, {
        dateKey: move.toDate,
        userEdited: true,
        updatedAt: serverTimestamp(),
      })
      if (event.linkedEntityType === 'mission' && event.linkedEntityId) {
        batch.update(documentRef(db, 'missions', event.linkedEntityId), {
          plannedDate: move.toDate,
          updatedAt: serverTimestamp(),
        })
      }
    }
    await batch.commit()
  })
}
