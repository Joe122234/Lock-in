import type {
  Assignment,
  CalendarEvent,
  DateKey,
  Mission,
  Project,
  Subject,
  Topic,
  WorkspaceCollections,
  WorkspaceSettings,
} from '@/types/domain'
import { rankQueue, type QueueTask, type ScoredQueueTask } from '@/lib/scheduler/priority'
import {
  daysBetween,
  isWeekendKey,
  startOfWeekKey,
  endOfWeekKey,
  formatDateKey,
} from '@/lib/dates'
import { createDefaultSettings, DEFAULT_WEEKLY_GOALS } from '@/lib/constants'

type Raw = Record<string, unknown>

function asDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback
}

export function normalizeSettings(raw: Raw): WorkspaceSettings {
  const now = new Date()
  const defaults = createDefaultSettings({
    timezone: typeof raw.timezone === 'string' ? raw.timezone : undefined,
    locale: typeof raw.locale === 'string' ? raw.locale : undefined,
  })
  const weeklyGoals =
    raw.weeklyGoals && typeof raw.weeklyGoals === 'object'
      ? (raw.weeklyGoals as Record<string, number>)
      : {}
  const merged: WorkspaceSettings = {
    ...defaults,
    ...(raw as Partial<WorkspaceSettings>),
    timezone: typeof raw.timezone === 'string' ? raw.timezone : defaults.timezone,
    locale: typeof raw.locale === 'string' ? raw.locale : defaults.locale,
    weeklyGoals: { ...DEFAULT_WEEKLY_GOALS, ...weeklyGoals },
    defaultDurations: {
      ...defaults.defaultDurations,
      ...((raw.defaultDurations as Partial<WorkspaceSettings['defaultDurations']>) ?? {}),
    },
    calendar: {
      ...defaults.calendar,
      ...((raw.calendar as Partial<WorkspaceSettings['calendar']>) ?? {}),
    },
    streakRules: {
      ...defaults.streakRules,
      ...((raw.streakRules as Partial<WorkspaceSettings['streakRules']>) ?? {}),
    },
    reminders: {
      ...defaults.reminders,
      ...((raw.reminders as Partial<WorkspaceSettings['reminders']>) ?? {}),
    },
    preferredStudyDays: Array.isArray(raw.preferredStudyDays)
      ? (raw.preferredStudyDays as WorkspaceSettings['preferredStudyDays'])
      : defaults.preferredStudyDays,
    unavailableDays: Array.isArray(raw.unavailableDays)
      ? (raw.unavailableDays as WorkspaceSettings['unavailableDays'])
      : defaults.unavailableDays,
    theme: 'dark',
    createdAt: asDate(raw.createdAt, now),
    updatedAt: asDate(raw.updatedAt, now),
    onboardingCompletedAt:
      raw.onboardingCompletedAt === null
        ? null
        : asDate(raw.onboardingCompletedAt, now),
  }
  return merged
}

export interface GoalProgress {
  subject: Subject
  completed: number
  target: number
  remaining: number
  percent: number
  activityMinutes: number
}

const STUDY_KINDS = new Set(['mission', 'studyBlock', 'practice'])

export function subjectGoalProgress(
  collections: WorkspaceCollections,
  settings: WorkspaceSettings,
  today: DateKey,
): GoalProgress[] {
  const weekStart = startOfWeekKey(today, settings.weekStartsOn)
  const weekEnd = endOfWeekKey(today, settings.weekStartsOn)
  const activeForWeek = collections.activityEvents.filter(
    (activity) =>
      !activity.reversedAt &&
      activity.meaningful &&
      STUDY_KINDS.has(activity.kind) &&
      activity.dateKey >= weekStart &&
      activity.dateKey <= weekEnd,
  )
  return [...collections.subjects]
    .filter((subject) => subject.active)
    .sort((a, b) => a.order - b.order)
    .map((subject) => {
      const target = settings.weeklyGoals[subject.id] ?? subject.weeklyTarget ?? 0
      const subjectActivities = activeForWeek.filter(
        (activity) => activity.subjectId === subject.id,
      )
      const completed = subjectActivities.length
      return {
        subject,
        completed,
        target,
        remaining: Math.max(0, target - completed),
        percent: target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 100,
        activityMinutes: subjectActivities.reduce((sum, item) => sum + item.minutes, 0),
      }
    })
}

export function activeSubjects(collections: WorkspaceCollections): Subject[] {
  return collections.subjects
    .filter((subject) => subject.active && !subject.archivedAt)
    .sort((a, b) => a.order - b.order)
}

export function subjectTopics(
  collections: WorkspaceCollections,
  subjectId: string,
): Topic[] {
  return collections.topics
    .filter((topic) => topic.subjectId === subjectId && !topic.archivedAt)
    .sort((a, b) => a.order - b.order)
}

export function getSubject(collections: WorkspaceCollections, subjectId: string | null): Subject | null {
  if (!subjectId) return null
  return collections.subjects.find((subject) => subject.id === subjectId) ?? null
}

export function getTopic(collections: WorkspaceCollections, topicId: string | null): Topic | null {
  if (!topicId) return null
  return collections.topics.find((topic) => topic.id === topicId) ?? null
}

export interface ProjectProgress {
  total: number
  completed: number
  skipped: number
  percent: number
  remainingMinutes: number
  atRisk: boolean
  riskReason: string | null
}

export function projectProgress(
  project: Project,
  collections: WorkspaceCollections,
  settings: WorkspaceSettings,
  today: DateKey,
): ProjectProgress {
  const milestones = collections.milestones.filter(
    (milestone) => milestone.projectId === project.id && !milestone.archivedAt,
  )
  const counted = milestones.filter((milestone) => milestone.status !== 'skipped')
  const completed = counted.filter((milestone) => milestone.status === 'completed').length
  const remaining = counted.filter((milestone) => milestone.status !== 'completed')
  const remainingMinutes = remaining.reduce((sum, item) => sum + item.estimatedMinutes, 0)
  const total = counted.length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  const lateMilestone = remaining.find(
    (milestone) =>
      (milestone.dueDate && milestone.dueDate < today) ||
      (milestone.plannedDate && milestone.plannedDate < today),
  )
  let atRisk = false
  let riskReason: string | null = null
  if (lateMilestone) {
    atRisk = true
    riskReason = `"${lateMilestone.title}" is past its planned or due date.`
  } else {
    const deadline = project.targetFinishDate ?? project.dueDate
    if (deadline && remaining.length > 0) {
      const availableDays = Math.max(0, daysBetween(today, deadline))
      let capacity = 0
      for (let offset = 0; offset < Math.min(availableDays, 30); offset += 1) {
        const dayCapacity = isWeekendKey(today)
          ? settings.weekendCapacityMinutes
          : settings.weekdayCapacityMinutes
        capacity += dayCapacity
        if (offset === 0) continue
      }
      if (remainingMinutes > capacity * 0.7 && availableDays <= 10) {
        atRisk = true
        riskReason = `${remainingMinutes} min of milestones remain with ${availableDays} ${availableDays === 1 ? 'day' : 'days'} left.`
      }
    }
  }
  return {
    total,
    completed,
    skipped: milestones.filter((milestone) => milestone.status === 'skipped').length,
    percent,
    remainingMinutes,
    atRisk,
    riskReason,
  }
}

export interface DeadlineItem {
  entityType: 'assignment' | 'mission' | 'milestone' | 'project'
  entityId: string
  title: string
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  priority: Assignment['priority']
  subjectId: string | null
  course?: string
  href: string
  projectId?: string
}

export function buildDeadlines(
  collections: WorkspaceCollections,
  today: DateKey,
  daysAhead = 7,
): DeadlineItem[] {
  const horizon = today
  const items: DeadlineItem[] = []
  const futureLimit = (() => {
    const date = new Date(`${horizon}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + daysAhead)
    return date.toISOString().slice(0, 10)
  })()

  for (const assignment of collections.assignments) {
    if (
      assignment.archivedAt ||
      assignment.status === 'completed' ||
      assignment.status === 'submitted' ||
      assignment.status === 'deferred'
    ) {
      continue
    }
    const due = assignment.dueDate
    const target = assignment.targetFinishDate
    const reference = target ?? due
    if (!reference || reference > futureLimit) continue
    items.push({
      entityType: 'assignment',
      entityId: assignment.id,
      title: assignment.title,
      dueDate: due,
      targetFinishDate: target,
      priority: assignment.priority,
      subjectId: null,
      course: assignment.course,
      href: `/assignments?open=${encodeURIComponent(assignment.id)}`,
    })
  }

  const activeProjectIds = new Set(
    collections.projects
      .filter((project) => !project.archivedAt && project.status !== 'completed')
      .map((project) => project.id),
  )

  for (const project of collections.projects) {
    if (project.archivedAt || project.status === 'completed') continue
    const reference = project.targetFinishDate ?? project.dueDate
    if (!reference || reference > futureLimit) continue
    items.push({
      entityType: 'project',
      entityId: project.id,
      title: project.title,
      dueDate: project.dueDate,
      targetFinishDate: project.targetFinishDate,
      priority: project.priority,
      subjectId: project.subjectId,
      course: project.course,
      href: `/projects?open=${encodeURIComponent(project.id)}`,
    })
  }

  for (const milestone of collections.milestones) {
    if (
      milestone.archivedAt ||
      milestone.status === 'completed' ||
      milestone.status === 'skipped' ||
      !activeProjectIds.has(milestone.projectId)
    ) {
      continue
    }
    const reference = milestone.dueDate ?? milestone.plannedDate
    if (!reference || reference > futureLimit) continue
    const project = collections.projects.find((item) => item.id === milestone.projectId)
    items.push({
      entityType: 'milestone',
      entityId: milestone.id,
      title: milestone.title,
      dueDate: milestone.dueDate,
      targetFinishDate: milestone.plannedDate,
      priority: project?.priority ?? 'medium',
      subjectId: project?.subjectId ?? null,
      course: project?.course,
      href: `/projects?open=${encodeURIComponent(milestone.projectId)}&milestone=${encodeURIComponent(milestone.id)}`,
      projectId: milestone.projectId,
    })
  }

  for (const mission of collections.missions) {
    if (
      mission.archivedAt ||
      mission.status === 'completed' ||
      mission.status === 'skipped' ||
      mission.status === 'deferred'
    ) {
      continue
    }
    const reference = mission.dueDate ?? mission.plannedDate
    if (!reference || reference > futureLimit) continue
    items.push({
      entityType: 'mission',
      entityId: mission.id,
      title: mission.title,
      dueDate: mission.dueDate,
      targetFinishDate: mission.plannedDate,
      priority: mission.priority,
      subjectId: mission.subjectId,
      href: `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`,
    })
  }

  return items.sort((a, b) => {
    const aDate = a.targetFinishDate ?? a.dueDate ?? futureLimit
    const bDate = b.targetFinishDate ?? b.dueDate ?? futureLimit
    if (aDate !== bDate) return aDate.localeCompare(bDate)
    return a.title.localeCompare(b.title)
  })
}

export function buildQueue(
  collections: WorkspaceCollections,
  settings: WorkspaceSettings,
  today: DateKey,
): ScoredQueueTask[] {
  const goals = subjectGoalProgress(collections, settings, today)
  const deficitSubjects = new Set(goals.filter((goal) => goal.remaining > 0).map((goal) => goal.subject.id))
  const todayEvents = collections.calendarEvents.filter(
    (event) => event.dateKey === today && event.status === 'planned',
  )
  const scheduledTaskIds = new Set(
    todayEvents
      .filter((event) => event.linkedEntityId)
      .map((event) => `${event.linkedEntityType}:${event.linkedEntityId}`),
  )

  const tasks: QueueTask[] = []
  for (const assignment of collections.assignments) {
    if (
      assignment.archivedAt ||
      ['completed', 'submitted', 'deferred'].includes(assignment.status)
    ) {
      continue
    }
    tasks.push({
      entityType: 'assignment',
      entityId: assignment.id,
      title: assignment.title,
      subjectId: null,
      course: assignment.course,
      priority: assignment.priority,
      dueDate: assignment.dueDate,
      targetFinishDate: assignment.targetFinishDate,
      estimatedMinutes: assignment.estimatedMinutes,
      status: assignment.status,
      plannedDate: null,
      scheduledToday: scheduledTaskIds.has(`assignment:${assignment.id}`),
      goalDeficit: false,
      href: `/assignments?open=${encodeURIComponent(assignment.id)}`,
    })
  }
  for (const project of collections.projects) {
    if (project.archivedAt || project.status === 'completed') continue
    for (const milestone of collections.milestones) {
      if (
        milestone.projectId !== project.id ||
        milestone.archivedAt ||
        milestone.status === 'completed' ||
        milestone.status === 'skipped'
      ) {
        continue
      }
      tasks.push({
        entityType: 'milestone',
        entityId: milestone.id,
        title: milestone.title,
        subjectId: project.subjectId,
        course: project.course,
        priority: project.priority,
        dueDate: milestone.dueDate,
        targetFinishDate: milestone.plannedDate,
        estimatedMinutes: milestone.estimatedMinutes,
        status: milestone.status,
        plannedDate: milestone.plannedDate,
        scheduledToday: scheduledTaskIds.has(`milestone:${milestone.id}`),
        goalDeficit: false,
        projectId: project.id,
        href: `/projects?open=${encodeURIComponent(project.id)}&milestone=${encodeURIComponent(milestone.id)}`,
      })
    }
  }
  for (const mission of collections.missions) {
    if (
      mission.archivedAt ||
      ['completed', 'skipped', 'deferred'].includes(mission.status)
    ) {
      continue
    }
    tasks.push({
      entityType: 'mission',
      entityId: mission.id,
      title: mission.title,
      subjectId: mission.subjectId,
      priority: mission.priority,
      dueDate: mission.dueDate,
      targetFinishDate: mission.plannedDate,
      estimatedMinutes: mission.estimatedMinutes,
      status: mission.status,
      plannedDate: mission.plannedDate,
      scheduledToday:
        scheduledTaskIds.has(`mission:${mission.id}`) || mission.plannedDate === today,
      goalDeficit: deficitSubjects.has(mission.subjectId),
      href: `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`,
    })
  }
  return rankQueue(tasks, today)
}

export function linkedEntityHref(event: CalendarEvent): string | null {
  if (!event.linkedEntityId) return null
  if (event.linkedEntityType === 'mission') {
    return `/missions/${encodeURIComponent(event.linkedEntityId)}`
  }
  if (event.linkedEntityType === 'assignment') {
    return `/assignments?open=${encodeURIComponent(event.linkedEntityId)}`
  }
  if (event.linkedEntityType === 'milestone') {
    return `/projects?milestone=${encodeURIComponent(event.linkedEntityId)}`
  }
  return null
}

export function eventIsEffectivelyComplete(
  event: CalendarEvent,
  collections: WorkspaceCollections,
): boolean {
  if (event.status === 'completed') return true
  if (event.linkedEntityType === 'mission' && event.linkedEntityId) {
    return (
      collections.missions.find((mission) => mission.id === event.linkedEntityId)?.status ===
      'completed'
    )
  }
  if (event.linkedEntityType === 'assignment' && event.linkedEntityId) {
    const status = collections.assignments.find(
      (assignment) => assignment.id === event.linkedEntityId,
    )?.status
    return status === 'completed' || status === 'submitted'
  }
  if (event.linkedEntityType === 'milestone' && event.linkedEntityId) {
    return (
      collections.milestones.find((milestone) => milestone.id === event.linkedEntityId)
        ?.status === 'completed'
    )
  }
  return false
}

export function eventDisplayTitle(
  event: CalendarEvent,
  collections: WorkspaceCollections,
): string {
  if (event.linkedEntityType === 'mission' && event.linkedEntityId) {
    return (
      collections.missions.find((mission) => mission.id === event.linkedEntityId)?.title ??
      event.title
    )
  }
  if (event.linkedEntityType === 'assignment' && event.linkedEntityId) {
    return (
      collections.assignments.find((item) => item.id === event.linkedEntityId)?.title ??
      event.title
    )
  }
  if (event.linkedEntityType === 'milestone' && event.linkedEntityId) {
    return (
      collections.milestones.find((item) => item.id === event.linkedEntityId)?.title ??
      event.title
    )
  }
  return event.title
}

export function findLinkedTask(
  event: CalendarEvent,
  collections: WorkspaceCollections,
): { type: 'mission' | 'assignment' | 'milestone'; title: string; dueDate: DateKey | null; targetFinishDate: DateKey | null } | null {
  if (!event.linkedEntityId) return null
  if (event.linkedEntityType === 'mission') {
    const mission = collections.missions.find((item) => item.id === event.linkedEntityId)
    return mission
      ? {
          type: 'mission',
          title: mission.title,
          dueDate: mission.dueDate,
          targetFinishDate: mission.plannedDate,
        }
      : null
  }
  if (event.linkedEntityType === 'assignment') {
    const assignment = collections.assignments.find(
      (item) => item.id === event.linkedEntityId,
    )
    return assignment
      ? {
          type: 'assignment',
          title: assignment.title,
          dueDate: assignment.dueDate,
          targetFinishDate: assignment.targetFinishDate,
        }
      : null
  }
  if (event.linkedEntityType === 'milestone') {
    const milestone = collections.milestones.find(
      (item) => item.id === event.linkedEntityId,
    )
    return milestone
      ? {
          type: 'milestone',
          title: milestone.title,
          dueDate: milestone.dueDate,
          targetFinishDate: milestone.plannedDate,
        }
      : null
  }
  return null
}

export function weeklyMinutes(
  collections: WorkspaceCollections,
  today: DateKey,
  settings: WorkspaceSettings,
): number {
  const weekStart = startOfWeekKey(today, settings.weekStartsOn)
  const weekEnd = endOfWeekKey(today, settings.weekStartsOn)
  return collections.activityEvents
    .filter(
      (activity) =>
        !activity.reversedAt &&
        activity.meaningful &&
        activity.dateKey >= weekStart &&
        activity.dateKey <= weekEnd,
    )
    .reduce((sum, event) => sum + event.minutes, 0)
}

export function upcomingStudyMissions(
  collections: WorkspaceCollections,
  subjectId: string,
): Mission[] {
  return collections.missions
    .filter(
      (mission) =>
        mission.subjectId === subjectId &&
        !mission.archivedAt &&
        !['completed', 'skipped', 'deferred'].includes(mission.status),
    )
    .sort((a, b) => {
      const aDate = a.dueDate ?? a.plannedDate ?? '9999-12-31'
      const bDate = b.dueDate ?? b.plannedDate ?? '9999-12-31'
      return aDate.localeCompare(bDate)
    })
}

export function deadlineText(
  item: DeadlineItem,
  _today: DateKey,
  locale: string,
): string {
  const date = item.targetFinishDate ?? item.dueDate
  if (!date) return 'No date'
  return formatDateKey(date, locale)
}
