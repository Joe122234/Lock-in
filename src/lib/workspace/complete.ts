import type { DateKey } from '@/types/domain'
import { completeMission, reopenMission } from '@/lib/firebase/repositories/missions'
import { completeAssignment, reopenAssignment } from '@/lib/firebase/repositories/assignments'
import { completeMilestone, reopenMilestone } from '@/lib/firebase/repositories/projects'
import {
  completeCalendarEvent,
  reopenCalendarEvent,
} from '@/lib/firebase/repositories/calendarEvents'

export type CompletableType = 'mission' | 'assignment' | 'milestone' | 'calendarEvent'

export async function completeTrackedEntity({
  entityType,
  entityId,
  dateKey,
  actualMinutes,
}: {
  entityType: CompletableType
  entityId: string
  dateKey: DateKey
  actualMinutes?: number
}): Promise<void> {
  if (entityType === 'mission') {
    await completeMission(entityId, {
      dateKey,
      actualMinutes: actualMinutes ?? null,
    })
    return
  }
  if (entityType === 'assignment') {
    await completeAssignment(entityId, {
      dateKey,
      actualMinutes: actualMinutes ?? null,
    })
    return
  }
  if (entityType === 'milestone') {
    await completeMilestone(entityId, dateKey, actualMinutes ?? null)
    return
  }
  await completeCalendarEvent(entityId, dateKey)
}

export async function reopenTrackedEntity(
  entityType: CompletableType,
  entityId: string,
): Promise<void> {
  if (entityType === 'mission') return reopenMission(entityId)
  if (entityType === 'assignment') return reopenAssignment(entityId)
  if (entityType === 'milestone') return reopenMilestone(entityId)
  return reopenCalendarEvent(entityId)
}
