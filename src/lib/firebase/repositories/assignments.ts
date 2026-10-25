import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type {
  Assignment,
  AssignmentStatus,
  ChecklistItem,
  DateKey,
  Priority,
} from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { readDocument, serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface NewAssignmentInput {
  title: string
  course: string
  dueDate?: DateKey | null
  targetFinishDate?: DateKey | null
  description?: string
  teacher?: string
  assignedDate?: DateKey | null
  estimatedMinutes?: number
  priority?: Priority
  status?: AssignmentStatus
  checklist?: ChecklistItem[]
  notes?: string
  resourceLinks?: string[]
}

export async function createAssignment(input: NewAssignmentInput): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'assignments'))
  const now = new Date()
  const assignment: Omit<Assignment, 'id'> = {
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    course: input.course.trim(),
    teacher: input.teacher?.trim() ?? '',
    assignedDate: input.assignedDate ?? null,
    dueDate: input.dueDate ?? null,
    targetFinishDate: input.targetFinishDate ?? null,
    estimatedMinutes: Math.max(0, Math.round(input.estimatedMinutes ?? 30)),
    priority: input.priority ?? 'medium',
    status: input.status ?? (input.dueDate ? 'planned' : 'inbox'),
    checklist: input.checklist ?? [],
    resourceLinks: (input.resourceLinks ?? []).filter(Boolean),
    notes: input.notes ?? '',
    actualMinutes: null,
    completionActivityId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    submittedAt: null,
  }
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(assignment) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateAssignment(
  assignmentId: string,
  patch: Partial<Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDocument<Assignment>('assignments', assignmentId, patch)
}

export interface CompleteAssignmentInput {
  dateKey: DateKey
  actualMinutes?: number | null
  submittedAt?: Date | null
  markSubmitted?: boolean
}

export async function completeAssignment(
  assignmentId: string,
  input: CompleteAssignmentInput,
): Promise<string | null> {
  const db = getDb()
  return trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const assignmentRef = documentRef(db, 'assignments', assignmentId)
      const snapshot = await transaction.get(assignmentRef)
      if (!snapshot.exists()) throw new Error('Assignment not found.')
      const assignment = readDocument<Assignment>(snapshot)
      if (assignment.status === 'completed' || assignment.status === 'submitted') {
        return assignment.completionActivityId
      }
      const activityRef = doc(collectionRef(db, 'activityEvents'))
      const submitted = input.markSubmitted ?? false
      transaction.set(activityRef, {
        kind: 'assignment',
        entityType: 'assignment',
        entityId: assignmentId,
        entityTitle: assignment.title,
        subjectId: null,
        dateKey: input.dateKey,
        occurredAt: serverTimestamp(),
        minutes: Math.max(0, Math.round(input.actualMinutes ?? 0)),
        meaningful: true,
        confidence: null,
        practiceAttempted: null,
        practiceCorrect: null,
        reversedAt: null,
        reversalReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(assignmentRef, {
        status: submitted ? 'submitted' : 'completed',
        completedAt: serverTimestamp(),
        submittedAt: submitted ? input.submittedAt ?? new Date() : assignment.submittedAt,
        actualMinutes: input.actualMinutes ?? assignment.actualMinutes,
        completionActivityId: activityRef.id,
        updatedAt: serverTimestamp(),
      })
      return activityRef.id
    }),
  )
}

export async function bulkCompleteAssignments(
  assignmentIds: string[],
  dateKey: DateKey,
): Promise<void> {
  if (assignmentIds.length === 0) return
  const db = getDb()
  await trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const refs = assignmentIds.map((id) => documentRef(db, 'assignments', id))
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
      const writes: Array<{ ref: ReturnType<typeof documentRef>; id: string; assignment: Assignment }> =
        []
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists()) return
        const assignment = readDocument<Assignment>(snapshot)
        if (assignment.status === 'completed' || assignment.status === 'submitted') return
        const ref = refs[index]
        if (!ref) return
        writes.push({ ref, id: snapshot.id, assignment })
      })
      writes.forEach(({ ref, id, assignment }) => {
        const activityRef = doc(collectionRef(db, 'activityEvents'))
        transaction.set(activityRef, {
          kind: 'assignment',
          entityType: 'assignment',
          entityId: id,
          entityTitle: assignment.title,
          subjectId: null,
          dateKey,
          occurredAt: serverTimestamp(),
          minutes: 0,
          meaningful: true,
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
          completedAt: serverTimestamp(),
          completionActivityId: activityRef.id,
          updatedAt: serverTimestamp(),
        })
      })
    }),
  )
}

export async function markAssignmentSubmitted(assignmentId: string): Promise<void> {
  const db = getDb()
  const ref = documentRef(db, 'assignments', assignmentId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return
  const assignment = readDocument<Assignment>(snapshot)
  await updateDocument<Assignment>('assignments', assignmentId, {
    status: 'submitted',
    submittedAt: new Date(),
    completedAt: assignment.completedAt ?? new Date(),
  })
}

export async function reopenAssignment(assignmentId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'assignments', assignmentId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const assignment = readDocument<Assignment>(snapshot)
    const batch = writeBatch(db)
    batch.update(ref, {
      status: assignment.dueDate ? 'planned' : 'inbox',
      completedAt: null,
      submittedAt: null,
      completionActivityId: null,
      archivedAt: null,
      updatedAt: serverTimestamp(),
    })
    if (assignment.completionActivityId) {
      batch.update(documentRef(db, 'activityEvents', assignment.completionActivityId), {
        reversedAt: serverTimestamp(),
        reversalReason: 'Assignment reopened',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function bulkUpdateAssignments(
  assignmentIds: string[],
  patch: Partial<
    Pick<
      Assignment,
      'priority' | 'targetFinishDate' | 'dueDate' | 'status' | 'archivedAt' | 'course'
    >
  >,
): Promise<void> {
  if (assignmentIds.length === 0) return
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    const serialized = serializeDocument(patch) as Record<string, unknown>
    assignmentIds.forEach((id) => {
      batch.update(documentRef(db, 'assignments', id), {
        ...serialized,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  })
}

export async function archiveAssignment(assignmentId: string): Promise<void> {
  await updateDocument<Assignment>('assignments', assignmentId, { archivedAt: new Date() })
}

export async function restoreAssignment(assignmentId: string): Promise<void> {
  await updateDocument<Assignment>('assignments', assignmentId, { archivedAt: null })
}
