import type { DateKey, Priority } from '@/types/domain'
import { daysBetween } from '@/lib/dates'
import { PRIORITY_RANK } from '@/lib/constants'

export type QueueEntityType = 'mission' | 'assignment' | 'milestone'

export interface QueueTask {
  entityType: QueueEntityType
  entityId: string
  title: string
  subjectId: string | null
  course?: string
  priority: Priority
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  estimatedMinutes: number
  status: string
  plannedDate: DateKey | null
  scheduledToday: boolean
  goalDeficit: boolean
  projectId?: string
  href: string
}

export interface ScoredQueueTask extends QueueTask {
  score: number
  reasons: string[]
  actionDate: DateKey | null
  overdue: boolean
}

function minDate(a: DateKey | null, b: DateKey | null): DateKey | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function formatReasonDate(dateKey: DateKey, today: DateKey): string {
  const delta = daysBetween(today, dateKey)
  if (delta < 0) return `${Math.abs(delta)}d overdue`
  if (delta === 0) return 'due today'
  if (delta === 1) return 'due tomorrow'
  return `due in ${delta}d`
}

export function scoreQueueTask(task: QueueTask, today: DateKey): ScoredQueueTask {
  const actionDate = minDate(task.targetFinishDate, task.dueDate)
  const reasons: string[] = []
  let score = PRIORITY_RANK[task.priority] * 8

  if (task.scheduledToday) {
    score += 26
    reasons.push('planned for today')
  }
  if (task.status === 'inProgress') {
    score += 12
    reasons.push('already in progress')
  }

  let overdue = false
  if (actionDate) {
    const delta = daysBetween(today, actionDate)
    if (delta < 0) {
      score += 100 + Math.min(30, Math.abs(delta) * 2)
      overdue = true
      reasons.push(formatReasonDate(actionDate, today))
    } else if (delta === 0) {
      score += 72
      reasons.push('due today')
    } else if (delta === 1) {
      score += 56
      reasons.push('due tomorrow')
    } else if (delta <= 3) {
      score += 38
      reasons.push(`due in ${delta} days`)
    } else if (delta <= 7) {
      score += 20
      reasons.push(`due in ${delta} days`)
    }
  } else {
    score += 2
  }

  if (task.targetFinishDate && task.dueDate && task.targetFinishDate < task.dueDate) {
    const targetDelta = daysBetween(today, task.targetFinishDate)
    if (targetDelta < 0) {
      score += 18
      if (!overdue) reasons.unshift('your target finish date passed')
    } else if (targetDelta <= 1) {
      score += 12
      if (reasons.length < 3) reasons.push('target finish is near')
    }
  }

  if (task.goalDeficit) {
    score += 24
    reasons.push('weekly subject goal not met')
  }

  if (!task.plannedDate && task.status !== 'inProgress') {
    score += 5
  }

  if (task.estimatedMinutes <= 20 && score > 0) {
    score += 4
    if (reasons.length === 0) reasons.push('quick meaningful win')
  }

  if (task.estimatedMinutes >= 120 && task.status !== 'inProgress') {
    score -= 4
    if (reasons.length === 0) reasons.push('larger task — start early')
  }

  if (reasons.length === 0) reasons.push('ready when you are')

  return {
    ...task,
    score,
    reasons: [...new Set(reasons)].slice(0, 3),
    actionDate,
    overdue,
  }
}

export function rankQueue(tasks: QueueTask[], today: DateKey): ScoredQueueTask[] {
  return tasks
    .map((task) => scoreQueueTask(task, today))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.actionDate && b.actionDate && a.actionDate !== b.actionDate) {
        return a.actionDate < b.actionDate ? -1 : 1
      }
      return a.title.localeCompare(b.title)
    })
}

export function pickNextTask(tasks: ScoredQueueTask[]): ScoredQueueTask | null {
  return tasks.find((task) => task.status !== 'completed') ?? null
}

export function deadlineOverdue(
  dueDate: DateKey | null,
  targetFinishDate: DateKey | null,
  today: DateKey,
): boolean {
  const date = targetFinishDate && targetFinishDate < today ? targetFinishDate : dueDate
  return Boolean(date && date < today)
}
