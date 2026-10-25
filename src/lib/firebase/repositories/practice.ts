import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { DateKey, Mistake, PracticeRecord } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { readDocument, serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface NewPracticeRecordInput {
  dateKey: DateKey
  recordType: PracticeRecord['recordType']
  source: string
  section: PracticeRecord['section']
  attempted: number
  correct: number
  totalScore?: number | null
  mathScore?: number | null
  readingWritingScore?: number | null
  minutes: number
  notes?: string
}

export async function createPracticeRecord(input: NewPracticeRecordInput): Promise<string> {
  const db = getDb()
  const recordRef = doc(collectionRef(db, 'practiceRecords'))
  const activityRef = doc(collectionRef(db, 'activityEvents'))
  const record: Omit<PracticeRecord, 'id'> = {
    dateKey: input.dateKey,
    recordType: input.recordType,
    source: input.source,
    section: input.section,
    attempted: Math.max(0, Math.round(input.attempted)),
    correct: Math.max(0, Math.round(input.correct)),
    totalScore: input.totalScore ?? null,
    mathScore: input.mathScore ?? null,
    readingWritingScore: input.readingWritingScore ?? null,
    minutes: Math.max(0, Math.round(input.minutes)),
    notes: input.notes ?? '',
    activityId: activityRef.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.set(recordRef, {
      ...(serializeDocument(record) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    batch.set(activityRef, {
      kind: 'practice',
      entityType: 'practice',
      entityId: recordRef.id,
      entityTitle: input.source || 'SAT practice',
      subjectId: 'sat',
      dateKey: input.dateKey,
      occurredAt: serverTimestamp(),
      minutes: record.minutes,
      meaningful: true,
      confidence: null,
      practiceAttempted: record.attempted,
      practiceCorrect: record.correct,
      reversedAt: null,
      reversalReason: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  })
  return recordRef.id
}

export async function updatePracticeRecord(
  recordId: string,
  patch: Partial<Omit<PracticeRecord, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'practiceRecords', recordId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) throw new Error('Practice record not found.')
    const record = readDocument<PracticeRecord>(snapshot)
    const batch = writeBatch(db)
    batch.update(ref, {
      ...(serializeDocument(patch) as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    })
    if (record.activityId) {
      const activityPatch: Record<string, unknown> = {}
      if (patch.dateKey) activityPatch.dateKey = patch.dateKey
      if (patch.minutes !== undefined) activityPatch.minutes = patch.minutes
      if (patch.attempted !== undefined) activityPatch.practiceAttempted = patch.attempted
      if (patch.correct !== undefined) activityPatch.practiceCorrect = patch.correct
      if (patch.source !== undefined) activityPatch.entityTitle = patch.source
      if (Object.keys(activityPatch).length > 0) {
        batch.update(documentRef(db, 'activityEvents', record.activityId), {
          ...activityPatch,
          updatedAt: serverTimestamp(),
        })
      }
    }
    await batch.commit()
  })
}

export async function deletePracticeRecord(recordId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'practiceRecords', recordId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const record = readDocument<PracticeRecord>(snapshot)
    const batch = writeBatch(db)
    batch.delete(ref)
    if (record.activityId) {
      batch.update(documentRef(db, 'activityEvents', record.activityId), {
        reversedAt: serverTimestamp(),
        reversalReason: 'Practice record removed',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export interface NewMistakeInput {
  topicId: string | null
  skill: string
  questionType: string
  questionRef: string
  whyWrong: string
  correctReasoning: string
  nextReviewDate: DateKey | null
}

export async function createMistake(input: NewMistakeInput): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'mistakes'))
  const mistake: Omit<Mistake, 'id'> = {
    ...input,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewedAt: null,
  }
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(mistake) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateMistake(
  mistakeId: string,
  patch: Partial<Omit<Mistake, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDocument<Mistake>('mistakes', mistakeId, patch)
}

export async function reviewMistake(
  mistakeId: string,
  status: Mistake['status'],
  nextReviewDate: DateKey | null,
): Promise<void> {
  await updateDocument<Mistake>('mistakes', mistakeId, {
    status,
    nextReviewDate,
    reviewedAt: new Date(),
  })
}

export async function deleteMistake(mistakeId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    await deleteDoc(documentRef(db, 'mistakes', mistakeId))
  })
}
