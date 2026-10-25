import { doc, serverTimestamp, setDoc, writeBatch, type DocumentData } from 'firebase/firestore'
import type { Subject, SubjectType, Topic, TopicStage, Weekday } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface NewSubjectInput {
  name: string
  type: SubjectType
  color: string
  icon: string
  weeklyTarget: number
  examDate?: string | null
}

export async function createSubject(input: NewSubjectInput, order: number): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'subjects'))
  const now = new Date()
  const subject: Omit<Subject, 'id'> = {
    name: input.name.trim(),
    type: input.type,
    color: input.color,
    icon: input.icon,
    active: true,
    examDate: input.examDate ?? null,
    weeklyTarget: Math.max(0, Math.round(input.weeklyTarget)),
    order,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await trackedWrite(async () => {
    const payload = serializeDocument(subject) as DocumentData
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateSubject(
  subjectId: string,
  patch: Partial<
    Pick<
      Subject,
      'name' | 'type' | 'color' | 'icon' | 'active' | 'examDate' | 'weeklyTarget' | 'order'
    >
  >,
): Promise<void> {
  await updateDocument<Subject>('subjects', subjectId, patch)
}

export async function archiveSubject(subjectId: string): Promise<void> {
  await updateDocument<Subject>('subjects', subjectId, {
    active: false,
    archivedAt: new Date(),
  })
}

export async function restoreSubject(subjectId: string): Promise<void> {
  await updateDocument<Subject>('subjects', subjectId, {
    active: true,
    archivedAt: null,
  })
}

export async function reorderSubjects(ids: string[]): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    ids.forEach((id, index) => {
      batch.update(documentRef(db, 'subjects', id), {
        order: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  })
}

export interface NewTopicInput {
  subjectId: string
  name: string
  group?: string | null
  stage?: TopicStage
  notes?: string
}

export async function createTopic(input: NewTopicInput, order: number): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'topics'))
  const topic: Omit<Topic, 'id'> = {
    subjectId: input.subjectId,
    name: input.name.trim(),
    group: input.group?.trim() || null,
    order,
    stage: input.stage ?? 'notStarted',
    notes: input.notes ?? '',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await trackedWrite(async () => {
    const payload = serializeDocument(topic) as DocumentData
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateTopic(
  topicId: string,
  patch: Partial<Pick<Topic, 'name' | 'group' | 'stage' | 'notes' | 'order' | 'archivedAt'>>,
): Promise<void> {
  await updateDocument<Topic>('topics', topicId, patch)
}

export async function archiveTopic(topicId: string): Promise<void> {
  await updateDocument<Topic>('topics', topicId, { archivedAt: new Date() })
}

export async function restoreTopic(topicId: string): Promise<void> {
  await updateDocument<Topic>('topics', topicId, { archivedAt: null })
}

export async function reorderTopics(ids: string[]): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    ids.forEach((id, index) => {
      batch.update(documentRef(db, 'topics', id), {
        order: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  })
}

export interface SubjectTemplateSeed {
  name: string
  color: string
  icon: string
  type: SubjectType
  weeklyTarget: number
  preferredDays: Weekday[]
}

export function blankTopicGroups(): string[] {
  return ['Unit 1', 'Unit 2', 'Unit 3']
}
