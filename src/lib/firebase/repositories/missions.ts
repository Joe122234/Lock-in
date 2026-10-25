import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import type {
  CalendarEvent,
  ChecklistItem,
  DateKey,
  LocalTime,
  Mission,
  MissionStatus,
  MissionType,
  Priority,
} from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { readDocument, serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface NewMissionInput {
  title: string
  subjectId: string
  topicId: string | null
  description?: string
  missionType?: MissionType
  estimatedMinutes?: number
  difficulty?: 1 | 2 | 3 | 4 | 5
  priority?: Priority
  plannedDate?: DateKey | null
  dueDate?: DateKey | null
  checklist?: ChecklistItem[]
  resourceLinks?: string[]
  notes?: string
  origin?: Mission['origin']
  startTime?: LocalTime | null
  endTime?: LocalTime | null
}

export async function createMission(input: NewMissionInput): Promise<string> {
  const db = getDb()
  const missionRef = doc(collectionRef(db, 'missions'))
  const plannedDate = input.plannedDate ?? null
  const eventRef = plannedDate ? doc(collectionRef(db, 'calendarEvents')) : null
  const now = new Date()
  const mission: Omit<Mission, 'id'> = {
    title: input.title.trim(),
    subjectId: input.subjectId,
    topicId: input.topicId ?? null,
    description: input.description?.trim() ?? '',
    missionType: input.missionType ?? 'learn',
    estimatedMinutes: Math.max(5, Math.round(input.estimatedMinutes ?? 30)),
    difficulty: input.difficulty ?? 2,
    priority: input.priority ?? 'medium',
    plannedDate,
    dueDate: input.dueDate ?? null,
    status: plannedDate ? 'planned' : 'inbox',
    recurrenceRule: null,
    checklist: input.checklist ?? [],
    resourceLinks: (input.resourceLinks ?? []).filter(Boolean),
    notes: input.notes ?? '',
    completionSummary: '',
    confidence: null,
    practiceAttempted: null,
    practiceCorrect: null,
    actualMinutes: null,
    reviewAgainDate: null,
    origin: input.origin ?? 'manual',
    seriesId: null,
    occurrenceDate: null,
    plannedEventId: eventRef?.id ?? null,
    completionActivityId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.set(missionRef, {
      ...(serializeDocument(mission) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    if (eventRef && plannedDate) {
      const event: Omit<CalendarEvent, 'id'> = {
        linkedEntityType: 'mission',
        linkedEntityId: missionRef.id,
        title: mission.title,
        dateKey: plannedDate,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        estimatedMinutes: mission.estimatedMinutes,
        eventType: 'study',
        subjectId: mission.subjectId,
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
      batch.set(eventRef, {
        ...(serializeDocument(event) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
  return missionRef.id
}

export async function updateMission(
  missionId: string,
  patch: Partial<Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const missionRef = documentRef(db, 'missions', missionId)
    const missionSnapshot = await getDoc(missionRef)
    if (!missionSnapshot.exists()) throw new Error('Mission not found.')
    const current = readDocument<Mission>(missionSnapshot)
    const nextPlannedDate =
      patch.plannedDate !== undefined ? patch.plannedDate : current.plannedDate
    const nextStatus = patch.status ?? current.status
    const nextTitle = patch.title ?? current.title
    const nextMinutes = patch.estimatedMinutes ?? current.estimatedMinutes
    const nextSubjectId = patch.subjectId ?? current.subjectId
    const batch = writeBatch(db)
    const timestamp = serverTimestamp()
    const serialized = serializeDocument(patch) as Record<string, unknown>
    batch.update(missionRef, { ...serialized, updatedAt: timestamp })

    let eventId = current.plannedEventId
    if (eventId) {
      const eventRef = documentRef(db, 'calendarEvents', eventId)
      const eventSnapshot = await getDoc(eventRef)
      if (eventSnapshot.exists()) {
        const event = readDocument<CalendarEvent>(eventSnapshot)
        const eventPatch: Record<string, unknown> = {
          title: nextTitle,
          estimatedMinutes: nextMinutes,
          subjectId: nextSubjectId,
        }
        if (nextPlannedDate) {
          eventPatch.dateKey = nextPlannedDate
          eventPatch.status = nextStatus === 'completed' ? 'completed' : 'planned'
        } else {
          eventPatch.status = 'canceled'
        }
        batch.update(eventRef, {
          ...eventPatch,
          updatedAt: timestamp,
          linkedEntityId: missionId,
          eventType: 'study',
          startTime: event.startTime,
        })
      }
    } else if (nextPlannedDate) {
      const eventRef = doc(collectionRef(db, 'calendarEvents'))
      eventId = eventRef.id
      const event: Omit<CalendarEvent, 'id'> = {
        linkedEntityType: 'mission',
        linkedEntityId: missionId,
        title: nextTitle,
        dateKey: nextPlannedDate,
        startTime: null,
        endTime: null,
        estimatedMinutes: nextMinutes,
        eventType: 'study',
        subjectId: nextSubjectId,
        status: nextStatus === 'completed' ? 'completed' : 'planned',
        recurrenceRule: null,
        userEdited: false,
        countsTowardCapacity: true,
        notes: '',
        seriesId: null,
        occurrenceDate: null,
        completionActivityId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      batch.set(eventRef, {
        ...(serializeDocument(event) as Record<string, unknown>),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      batch.update(missionRef, { plannedEventId: eventId, updatedAt: timestamp })
    }
    await batch.commit()
  })
}

export interface CompleteMissionInput {
  dateKey: DateKey
  actualMinutes?: number | null
  completionSummary?: string
  confidence?: 1 | 2 | 3 | 4 | 5 | null
  practiceAttempted?: number | null
  practiceCorrect?: number | null
  reviewAgainDate?: DateKey | null
  checklist?: ChecklistItem[]
}

export async function completeMission(
  missionId: string,
  input: CompleteMissionInput,
): Promise<string | null> {
  const db = getDb()
  return trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const missionRef = documentRef(db, 'missions', missionId)
      const snapshot = await transaction.get(missionRef)
      if (!snapshot.exists()) throw new Error('Mission not found.')
      const mission = readDocument<Mission>(snapshot)
      if (mission.status === 'completed') return mission.completionActivityId
      const eventRef = mission.plannedEventId
        ? documentRef(db, 'calendarEvents', mission.plannedEventId)
        : null
      const eventSnap = eventRef ? await transaction.get(eventRef) : null
      const activityRef = doc(collectionRef(db, 'activityEvents'))
      const minutes = Math.max(0, Math.round(input.actualMinutes ?? mission.actualMinutes ?? 0))
      transaction.set(activityRef, {
        kind: 'mission',
        entityType: 'mission',
        entityId: missionId,
        entityTitle: mission.title,
        subjectId: mission.subjectId,
        dateKey: input.dateKey,
        occurredAt: serverTimestamp(),
        minutes,
        meaningful: true,
        confidence: input.confidence ?? null,
        practiceAttempted: input.practiceAttempted ?? null,
        practiceCorrect: input.practiceCorrect ?? null,
        reversedAt: null,
        reversalReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(missionRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        completionActivityId: activityRef.id,
        actualMinutes: minutes,
        completionSummary: input.completionSummary ?? mission.completionSummary,
        confidence: input.confidence ?? mission.confidence,
        practiceAttempted:
          input.practiceAttempted !== undefined
            ? input.practiceAttempted
            : mission.practiceAttempted,
        practiceCorrect:
          input.practiceCorrect !== undefined ? input.practiceCorrect : mission.practiceCorrect,
        reviewAgainDate:
          input.reviewAgainDate !== undefined ? input.reviewAgainDate : mission.reviewAgainDate,
        checklist: input.checklist ?? mission.checklist,
        updatedAt: serverTimestamp(),
      })
      if (eventRef && eventSnap?.exists()) {
        transaction.update(eventRef, {
          status: 'completed',
          completionActivityId: activityRef.id,
          updatedAt: serverTimestamp(),
        })
      }
      return activityRef.id
    }),
  )
}

export async function setMissionStatus(
  missionId: string,
  status: MissionStatus,
): Promise<void> {
  await updateDocument<Mission>('missions', missionId, { status })
}

export async function startMission(missionId: string): Promise<void> {
  await updateDocument<Mission>('missions', missionId, { status: 'inProgress' })
}

export async function reopenMission(missionId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const missionRef = documentRef(db, 'missions', missionId)
    const snapshot = await getDoc(missionRef)
    if (!snapshot.exists()) return
    const mission = readDocument<Mission>(snapshot)
    const batch = writeBatch(db)
    batch.update(missionRef, {
      status: mission.plannedDate ? 'planned' : 'inbox',
      completedAt: null,
      completionActivityId: null,
      updatedAt: serverTimestamp(),
    })
    if (mission.completionActivityId) {
      batch.update(documentRef(db, 'activityEvents', mission.completionActivityId), {
        reversedAt: serverTimestamp(),
        reversalReason: 'Mission reopened',
        updatedAt: serverTimestamp(),
      })
    }
    if (mission.plannedEventId) {
      batch.update(documentRef(db, 'calendarEvents', mission.plannedEventId), {
        status: 'planned',
        completionActivityId: null,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function archiveMission(missionId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const missionRef = documentRef(db, 'missions', missionId)
    const snapshot = await getDoc(missionRef)
    if (!snapshot.exists()) return
    const mission = readDocument<Mission>(snapshot)
    const batch = writeBatch(db)
    batch.update(missionRef, {
      archivedAt: new Date(),
      updatedAt: serverTimestamp(),
    })
    if (mission.plannedEventId) {
      batch.update(documentRef(db, 'calendarEvents', mission.plannedEventId), {
        status: 'canceled',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export type MissionPatch = Partial<Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>>
