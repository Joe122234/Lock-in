import { toast } from 'sonner'
import type {
  AssignmentStatus,
  MilestoneStatus,
  Priority,
  ProjectStatus,
  CalendarEventStatus,
} from '@/types/domain'
import {
  ASSIGNMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  STATUS_TONE,
} from '@/lib/constants'
import type { BadgeTone } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'outline',
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} className={className}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}

export function AssignmentStatusBadge({
  status,
  className,
}: {
  status: AssignmentStatus
  className?: string
}) {
  const tone = (STATUS_TONE[status] ?? 'neutral') as BadgeTone
  return (
    <Badge tone={tone} className={className}>
      {ASSIGNMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus
  className?: string
}) {
  const tone = (STATUS_TONE[status] ?? 'neutral') as BadgeTone
  return (
    <Badge tone={tone} className={className}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  )
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  completed: 'Done',
  skipped: 'Skipped',
}

export const EVENT_STATUS_LABELS: Record<CalendarEventStatus, string> = {
  planned: 'Planned',
  completed: 'Done',
  skipped: 'Skipped',
  canceled: 'Canceled',
}

export function notifyError(error: unknown, fallback = 'That change could not be saved.') {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback
  toast.error('Not saved', { description: message })
}

export function notifySaved(message: string, description?: string) {
  toast.success(message, { description })
}

export function DeadlineTone({
  tone,
  children,
  className,
}: {
  tone: 'overdue' | 'urgent' | 'soon' | 'normal'
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-mono text-[10.5px] uppercase tracking-[0.08em]',
        tone === 'overdue' && 'text-danger',
        tone === 'urgent' && 'text-warning',
        tone === 'soon' && 'text-fg/80',
        tone === 'normal' && 'text-faint',
        className,
      )}
    >
      {children}
    </span>
  )
}
