import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import type { DailyCheckIn, DateKey, EnergyLevel, WeeklyReview, WorkloadMode } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef, settingsRef } from '@/lib/firebase/paths'
import { serializeDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface CheckInPatch {
  energy?: EnergyLevel | null
  workloadMode?: DailyCheckIn['workloadMode']
  reflection?: string
}

export async function upsertCheckIn(dateKey: DateKey, patch: CheckInPatch): Promise<void> {
  const db = getDb()
  const now = new Date()
  const ref = documentRef(db, 'checkIns', dateKey)
  const payload: DailyCheckIn = {
    id: dateKey,
    dateKey,
    energy: patch.energy ?? null,
    workloadMode: patch.workloadMode ?? 'normal',
    reflection: patch.reflection ?? '',
    createdAt: now,
    updatedAt: now,
  }
  await trackedWrite(async () => {
    await setDoc(
      ref,
      {
        ...(serializeDocument(payload) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export async function setRestDay(dateKey: DateKey, rest: boolean): Promise<void> {
  const db = getDb()
  const checkInId = dateKey
  const eventId = `rest__${dateKey}`
  await trackedWrite(async () => {
    const checkInRef = documentRef(db, 'checkIns', checkInId)
    if (rest) {
      await setDoc(
        checkInRef,
        {
          id: checkInId,
          dateKey,
          energy: 'low',
          workloadMode: 'rest' as WorkloadMode,
          reflection: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      const eventRef = documentRef(db, 'calendarEvents', eventId)
      await setDoc(
        eventRef,
        {
          linkedEntityType: 'rest',
          linkedEntityId: null,
          title: 'Rest day',
          dateKey,
          startTime: null,
          endTime: null,
          estimatedMinutes: 0,
          eventType: 'rest',
          subjectId: null,
          status: 'planned',
          recurrenceRule: null,
          userEdited: true,
          countsTowardCapacity: false,
          notes: 'Deliberate rest. This day can preserve your streak.',
          seriesId: null,
          occurrenceDate: null,
          completionActivityId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } else {
      await setDoc(
        checkInRef,
        {
          id: checkInId,
          dateKey,
          workloadMode: 'normal',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      await deleteDoc(documentRef(db, 'calendarEvents', eventId))
    }
  })
}

export async function saveWeeklyReview(
  review: Omit<WeeklyReview, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const db = getDb()
  const ref = documentRef(db, 'weeklyReviews', review.weekStartDate)
  await trackedWrite(async () => {
    await setDoc(
      ref,
      {
        ...(serializeDocument(review) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
  return ref.id
}

export interface NewWeeklyReview {
  weekStartDate: DateKey
  weekEndDate: DateKey
  wins: string
  missed: string
  weakTopics: string
  adjustments: string
  workloadNextWeek: WorkloadMode
  completedHomework: number
  completedMissions: number
  studyMinutes: number
}

export async function createWeeklyReview(review: NewWeeklyReview): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    await setDoc(
      doc(collectionRef(db, 'weeklyReviews'), review.weekStartDate),
      {
        ...(serializeDocument(review) as Record<string, unknown>),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export async function removeRestDay(dateKey: DateKey): Promise<void> {
  await setRestDay(dateKey, false)
}

export function settingsDocRef() {
  return settingsRef(getDb())
}
