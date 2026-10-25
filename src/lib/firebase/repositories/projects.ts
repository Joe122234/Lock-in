import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type {
  ChecklistItem,
  DateKey,
  Milestone,
  MilestoneStatus,
  Priority,
  Project,
  ProjectStatus,
} from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { readDocument, serializeDocument, updateDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export interface NewProjectInput {
  title: string
  description?: string
  course: string
  subjectId?: string | null
  priority?: Priority
  assignedDate?: DateKey | null
  dueDate?: DateKey | null
  targetFinishDate?: DateKey | null
  estimatedMinutes?: number
  notes?: string
  resourceLinks?: string[]
  finalSubmissionLink?: string
}

export async function createProject(input: NewProjectInput): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'projects'))
  const now = new Date()
  const project: Omit<Project, 'id'> = {
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    course: input.course.trim(),
    subjectId: input.subjectId ?? null,
    priority: input.priority ?? 'medium',
    assignedDate: input.assignedDate ?? null,
    dueDate: input.dueDate ?? null,
    targetFinishDate: input.targetFinishDate ?? null,
    estimatedMinutes: Math.max(0, Math.round(input.estimatedMinutes ?? 0)),
    status: 'notStarted',
    notes: input.notes ?? '',
    resourceLinks: (input.resourceLinks ?? []).filter(Boolean),
    finalSubmissionLink: input.finalSubmissionLink ?? '',
    order: now.getTime(),
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(project) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateProject(
  projectId: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDocument<Project>('projects', projectId, patch)
}

export async function setProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<void> {
  await updateDocument<Project>('projects', projectId, {
    status,
    completedAt: status === 'completed' ? new Date() : null,
  })
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateDocument<Project>('projects', projectId, { archivedAt: new Date() })
}

export async function restoreProject(projectId: string): Promise<void> {
  await updateDocument<Project>('projects', projectId, { archivedAt: null })
}

export interface NewMilestoneInput {
  projectId: string
  title: string
  description?: string
  plannedDate?: DateKey | null
  dueDate?: DateKey | null
  estimatedMinutes?: number
  checklist?: ChecklistItem[]
}

export async function createMilestone(
  input: NewMilestoneInput,
  order: number,
): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'milestones'))
  const now = new Date()
  const milestone: Omit<Milestone, 'id'> = {
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    plannedDate: input.plannedDate ?? null,
    dueDate: input.dueDate ?? null,
    estimatedMinutes: Math.max(0, Math.round(input.estimatedMinutes ?? 30)),
    status: 'notStarted',
    checklist: input.checklist ?? [],
    order,
    completionActivityId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  }
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(milestone) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateMilestone(
  milestoneId: string,
  patch: Partial<Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await updateDocument<Milestone>('milestones', milestoneId, patch)
}

export async function setMilestoneStatus(
  milestoneId: string,
  status: MilestoneStatus,
): Promise<void> {
  await updateDocument<Milestone>('milestones', milestoneId, { status })
}

export async function completeMilestone(
  milestoneId: string,
  dateKey: DateKey,
  actualMinutes?: number | null,
): Promise<string | null> {
  const db = getDb()
  return trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const milestoneRef = documentRef(db, 'milestones', milestoneId)
      const snapshot = await transaction.get(milestoneRef)
      if (!snapshot.exists()) throw new Error('Milestone not found.')
      const milestone = readDocument<Milestone>(snapshot)
      if (milestone.status === 'completed') return milestone.completionActivityId
      const projectSnapshot = await transaction.get(
        documentRef(db, 'projects', milestone.projectId),
      )
      const project = projectSnapshot.exists()
        ? readDocument<Project>(projectSnapshot)
        : null
      const activityRef = doc(collectionRef(db, 'activityEvents'))
      transaction.set(activityRef, {
        kind: 'milestone',
        entityType: 'milestone',
        entityId: milestoneId,
        entityTitle: milestone.title,
        subjectId: project?.subjectId ?? null,
        dateKey,
        occurredAt: serverTimestamp(),
        minutes: Math.max(0, Math.round(actualMinutes ?? 0)),
        meaningful: true,
        confidence: null,
        practiceAttempted: null,
        practiceCorrect: null,
        reversedAt: null,
        reversalReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(milestoneRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        completionActivityId: activityRef.id,
        updatedAt: serverTimestamp(),
      })
      if (project?.status === 'notStarted') {
        transaction.update(documentRef(db, 'projects', milestone.projectId), {
          status: 'inProgress',
          updatedAt: serverTimestamp(),
        })
      }
      return activityRef.id
    }),
  )
}

export async function reopenMilestone(milestoneId: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'milestones', milestoneId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const milestone = readDocument<Milestone>(snapshot)
    const batch = writeBatch(db)
    batch.update(ref, {
      status: 'notStarted' as MilestoneStatus,
      completedAt: null,
      completionActivityId: null,
      updatedAt: serverTimestamp(),
    })
    if (milestone.completionActivityId) {
      batch.update(documentRef(db, 'activityEvents', milestone.completionActivityId), {
        reversedAt: serverTimestamp(),
        reversalReason: 'Milestone reopened',
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  })
}

export async function reorderMilestones(ids: string[]): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    ids.forEach((id, index) => {
      batch.update(documentRef(db, 'milestones', id), {
        order: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  })
}

export async function archiveMilestone(milestoneId: string): Promise<void> {
  await updateDocument<Milestone>('milestones', milestoneId, { archivedAt: new Date() })
}

export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>
