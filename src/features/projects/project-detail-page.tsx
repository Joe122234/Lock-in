import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Milestone as MilestoneIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  archiveMilestone,
  completeMilestone,
  reopenMilestone,
  reorderMilestones,
  setProjectStatus,
} from '@/lib/firebase/repositories/projects'
import {
  daysBetween,
  deadlineLabel,
  formatDateKey,
  formatDuration,
} from '@/lib/dates'
import { projectProgress } from '@/lib/workspace/selectors'
import { Button } from '@/components/ui/button'
import { Badge, SubjectBadge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { Breadcrumb } from '@/components/ui/page'
import { DeadlineTone, PriorityBadge, ProjectStatusBadge, notifyError, notifySaved } from '@/components/status'
import { FocusSessionDialog, type FocusTarget } from '@/features/focus/focus-session'
import { cn } from '@/lib/utils'
import { ProjectEditor } from './project-editor'
import { MilestoneEditor } from './milestone-editor'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const { collections, settings, today, derived, getSubject, subjectColor, subjectName } = useWorkspaceData()
  const [projectOpen, setProjectOpen] = useState(false)
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmCompleteProject, setConfirmCompleteProject] = useState(false)
  const [confirmProjectReopen, setConfirmProjectReopen] = useState(false)
  const [confirmArchiveMilestoneId, setConfirmArchiveMilestoneId] = useState<string | null>(null)
  const highlightMilestoneId = searchParams.get('milestone')
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const project = collections.projects.find((item) => item.id === projectId) ?? null
  const milestones = useMemo(
    () =>
      collections.milestones
        .filter((milestone) => milestone.projectId === projectId && !milestone.archivedAt)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order
          const aDate = a.plannedDate ?? a.dueDate ?? '9999-12-31'
          const bDate = b.plannedDate ?? b.dueDate ?? '9999-12-31'
          return aDate.localeCompare(bDate)
        }),
    [collections.milestones, projectId],
  )

  useEffect(() => {
    if (highlightMilestoneId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightMilestoneId, milestones.length])

  if (!settings) return null
  if (!project) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface/70 px-6 py-20 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-faint">
          <FolderKanbanIcon />
        </span>
        <div>
          <h1 className="text-[16px] font-semibold">Project not found.</h1>
          <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-faint">
            It may have been archived or removed. The rest of your portfolio is unchanged.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    )
  }

  const locale = settings.locale
  const subject = getSubject(project.subjectId)
  const progress = projectProgress(project, collections, settings, today)
  const editingMilestone = milestones.find((milestone) => milestone.id === editingMilestoneId) ?? null
  const nextOrder = milestones.reduce((max, milestone) => Math.max(max, milestone.order), 0) + 1
  const deadline = project.targetFinishDate ?? project.dueDate
  const daysLeft = deadline ? daysBetween(today, deadline) : null
  const nextMilestone = milestones.find(
    (milestone) => milestone.status !== 'completed' && milestone.status !== 'skipped',
  )
  const completedTimeline = milestones
    .filter((milestone) => milestone.completedAt)
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))

  const complete = async (milestoneId: string, minutes?: number) => {
    setBusyId(milestoneId)
    try {
      await completeMilestone(milestoneId, today, minutes ?? null)
      toast.success('Milestone complete', {
        description: minutes ? `${formatDuration(minutes)} of focused work logged.` : undefined,
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const reopen = async (milestoneId: string) => {
    setBusyId(milestoneId)
    try {
      await reopenMilestone(milestoneId)
      notifySaved('Milestone reopened', 'The completion was reversed in activity history.')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const archiveMilestoneById = async (milestoneId: string) => {
    setBusyId(milestoneId)
    try {
      await archiveMilestone(milestoneId)
      notifySaved('Milestone archived')
      setConfirmArchiveMilestoneId(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const move = async (milestoneId: string, direction: -1 | 1) => {
    const index = milestones.findIndex((milestone) => milestone.id === milestoneId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= milestones.length) return
    const reordered = [...milestones]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return
    reordered.splice(target, 0, moved)
    try {
      await reorderMilestones(reordered.map((milestone) => milestone.id))
    } catch (error) {
      notifyError(error)
    }
  }

  const completeProject = async () => {
    setBusyId(project.id)
    try {
      await setProjectStatus(project.id, 'completed')
      notifySaved('Project completed', project.title)
      setConfirmCompleteProject(false)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const reopenProject = async () => {
    setBusyId(project.id)
    try {
      await setProjectStatus(project.id, 'inProgress')
      notifySaved('Project reopened')
      setConfirmProjectReopen(false)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const focusMilestone = (milestone: (typeof milestones)[number]) => {
    setFocusTarget({
      title: milestone.title,
      subtitle: `${project.title} · ${formatDuration(milestone.estimatedMinutes)}`,
      plannedMinutes: Math.max(10, milestone.estimatedMinutes || 30),
      color: subjectColor(project.subjectId),
      onComplete: async (minutes) => {
        await completeMilestone(milestone.id, today, minutes)
        toast.success('Milestone logged', {
          description: `${formatDuration(minutes)} of focused work went into the project.`,
        })
      },
    })
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb items={[{ label: 'Projects', href: '/projects' }, { label: project.title }]} />
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects">
            <ArrowLeft className="size-3.5" /> Projects
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {subject ? <SubjectBadge name={subject.name} color={subject.color} /> : null}
            {progress.atRisk ? <Badge tone="warning" dot>At risk</Badge> : null}
          </div>
          <h1 className="mt-3 text-balance text-[26px] font-semibold leading-[1.12] tracking-[-0.035em] sm:text-[32px]">
            {project.title}
          </h1>
          <p className="mt-1 text-[12px] text-muted">{project.course}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setProjectOpen(true)}>
            <Pencil className="size-3.5" /> Edit project
          </Button>
          {project.status === 'completed' ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmProjectReopen(true)}>
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setConfirmCompleteProject(true)}>
              <CheckCircle2 className="size-3.5" /> Complete project
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.8fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mono-label">Derived progress</p>
                <p className="font-num mt-2 text-[34px] font-semibold leading-none">
                  {progress.percent}
                  <span className="text-[16px] text-faint">%</span>
                </p>
                <p className="mt-1.5 text-[10.5px] text-faint">
                  {progress.completed} of {progress.total} counted milestones complete
                  {progress.skipped > 0 ? ` · ${progress.skipped} skipped` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="mono-label">Remaining effort</p>
                <p className="font-num mt-2 text-[20px] font-semibold">
                  {formatDuration(progress.remainingMinutes)}
                </p>
                <p className="mt-1 text-[10px] text-faint">Across open milestones</p>
              </div>
            </div>
            <Progress
              value={progress.percent}
              tone={project.status === 'completed' ? 'teal' : progress.atRisk ? 'warning' : 'lime'}
              size="lg"
              className="mt-4"
            />
            {progress.riskReason ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/[0.05] px-3 py-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <p className="text-[10.5px] leading-relaxed text-warning/90">{progress.riskReason}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-surface/70">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <div>
                <h2 className="text-[13.5px] font-semibold">Milestones</h2>
                <p className="mt-0.5 text-[10px] text-faint">
                  Progress comes only from completed milestones.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingMilestoneId(null)
                  setMilestoneOpen(true)
                }}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>

            {milestones.length === 0 ? (
              <EmptyState
                compact
                icon={<MilestoneIcon className="size-4" />}
                title="This project has no shape yet."
                description="Add the first milestone. A deliverable without steps is only a wish."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingMilestoneId(null)
                      setMilestoneOpen(true)
                    }}
                  >
                    <Plus className="size-3.5" /> Add first milestone
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {milestones.map((milestone, index) => {
                  const done = milestone.status === 'completed'
                  const skipped = milestone.status === 'skipped'
                  const planned = deadlineLabel(milestone.plannedDate, today, locale)
                  const due = deadlineLabel(milestone.dueDate, today, locale)
                  const checklistDone = milestone.checklist.filter((item) => item.done).length
                  return (
                    <div
                      key={milestone.id}
                      ref={milestone.id === highlightMilestoneId ? highlightRef : undefined}
                      className={cn(
                        'group px-3 py-3 transition-colors sm:px-4',
                        milestone.id === highlightMilestoneId && 'bg-lime/[0.045] ring-1 ring-inset ring-lime/25',
                        (done || skipped) && 'opacity-65',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => (done ? void reopen(milestone.id) : void complete(milestone.id))}
                          disabled={busyId === milestone.id || skipped}
                          aria-label={done ? `Reopen ${milestone.title}` : `Complete ${milestone.title}`}
                          className={cn(
                            'mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border transition-colors',
                            done
                              ? 'border-lime bg-lime text-[#0a0d08]'
                              : 'border-line-strong text-transparent hover:border-lime/60 hover:text-lime/70',
                          )}
                        >
                          {busyId === milestone.id ? (
                            <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                          ) : (
                            <Check className="size-3" strokeWidth={3} />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMilestoneId(milestone.id)
                              setMilestoneOpen(true)
                            }}
                            className="block w-full text-left"
                          >
                            <span className={cn('block text-[12.5px] font-medium leading-snug', done && 'line-through', skipped && 'line-through')}>
                              {milestone.title}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                              {milestone.plannedDate ? (
                                <span className="flex items-center gap-1">
                                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Plan</span>
                                  <DeadlineTone tone={planned?.tone === 'overdue' && !done ? 'overdue' : 'normal'}>
                                    {formatDateKey(milestone.plannedDate, locale, { month: 'short', day: 'numeric' })}
                                  </DeadlineTone>
                                </span>
                              ) : null}
                              {milestone.dueDate ? (
                                <span className="flex items-center gap-1">
                                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">Due</span>
                                  <DeadlineTone tone={due?.tone === 'overdue' && !done ? 'overdue' : 'normal'}>
                                    {formatDateKey(milestone.dueDate, locale, { month: 'short', day: 'numeric' })}
                                  </DeadlineTone>
                                </span>
                              ) : null}
                              <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                                <Clock3 className="size-2.5" /> {formatDuration(milestone.estimatedMinutes)}
                              </span>
                              {milestone.checklist.length > 0 ? (
                                <span className="font-mono text-[9px] text-faint">
                                  {checklistDone}/{milestone.checklist.length} steps
                                </span>
                              ) : null}
                              {skipped ? <Badge tone="outline">Skipped</Badge> : null}
                            </span>
                          </button>
                          {milestone.description ? (
                            <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-relaxed text-faint">
                              {milestone.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {!done && !skipped ? (
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={() => focusMilestone(milestone)}
                              aria-label={`Focus on ${milestone.title}`}
                              className="hidden text-faint hover:text-lime sm:flex"
                            >
                              <Play className="size-3.5" />
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Actions for ${milestone.title}`}
                                className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-white/5 hover:text-fg"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel>Milestone</DropdownMenuLabel>
                              <DropdownMenuItem
                                icon={<Pencil className="size-3.5" />}
                                onSelect={() => {
                                  setEditingMilestoneId(milestone.id)
                                  setMilestoneOpen(true)
                                }}
                              >
                                Edit milestone
                              </DropdownMenuItem>
                              {!done && !skipped ? (
                                <DropdownMenuItem icon={<Play className="size-3.5" />} onSelect={() => focusMilestone(milestone)}>
                                  Start focus session
                                </DropdownMenuItem>
                              ) : null}
                              {done ? (
                                <DropdownMenuItem icon={<RotateCcw className="size-3.5" />} onSelect={() => void reopen(milestone.id)}>
                                  Reopen milestone
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                icon={<ArrowUp className="size-3.5" />}
                                disabled={index === 0}
                                onSelect={() => void move(milestone.id, -1)}
                              >
                                Move up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                icon={<ArrowDown className="size-3.5" />}
                                disabled={index === milestones.length - 1}
                                onSelect={() => void move(milestone.id, 1)}
                              >
                                Move down
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                danger
                                onSelect={() => setConfirmArchiveMilestoneId(milestone.id)}
                              >
                                Archive milestone
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {project.description ? (
            <div className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
              <p className="mono-label">Deliverable</p>
              <p className="mt-2.5 whitespace-pre-line text-[12px] leading-relaxed text-muted">
                {project.description}
              </p>
            </div>
          ) : null}

          {project.notes ? (
            <div className="rounded-2xl border border-line bg-surface/60 p-4 sm:p-5">
              <p className="mono-label">Notes</p>
              <p className="mt-2.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted">
                {project.notes}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-surface/80 p-4">
            <p className="mono-label">Dates & constraints</p>
            <dl className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10.5px] text-faint">Target finish</dt>
                <dd className="text-[11px] font-medium">
                  {project.targetFinishDate ? formatDateKey(project.targetFinishDate, locale) : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10.5px] text-faint">Real due date</dt>
                <dd className="text-[11px] font-medium">
                  {project.dueDate ? formatDateKey(project.dueDate, locale) : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10.5px] text-faint">Days left</dt>
                <dd className={cn('font-mono text-[11px]', daysLeft !== null && daysLeft < 0 ? 'text-danger' : daysLeft !== null && daysLeft <= 3 ? 'text-warning' : 'text-fg')}>
                  {daysLeft === null ? '—' : daysLeft < 0 ? `${Math.abs(daysLeft)} overdue` : `${daysLeft} days`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[10.5px] text-faint">Subject</dt>
                <dd className="text-[11px]">{project.subjectId ? subjectName(project.subjectId) : 'General'}</dd>
              </div>
            </dl>
          </div>

          {nextMilestone ? (
            <div className="rounded-2xl border border-lime/15 bg-lime/[0.035] p-4">
              <div className="flex items-center gap-2">
                <Target className="size-3.5 text-lime" />
                <p className="mono-label text-lime/80">Next milestone</p>
              </div>
              <p className="mt-2.5 text-[12.5px] font-medium leading-snug">{nextMilestone.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-faint">
                {nextMilestone.plannedDate
                  ? `${formatDateKey(nextMilestone.plannedDate, locale)} · ${formatDuration(nextMilestone.estimatedMinutes)}`
                  : `${formatDuration(nextMilestone.estimatedMinutes)} estimated`}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="xs" onClick={() => focusMilestone(nextMilestone)}>
                  <Play className="size-3" /> Focus
                </Button>
                <Button variant="ghost" size="xs" onClick={() => void complete(nextMilestone.id)}>
                  <Check className="size-3" /> Done
                </Button>
              </div>
            </div>
          ) : null}

          {project.resourceLinks.length > 0 || project.finalSubmissionLink ? (
            <div className="rounded-2xl border border-line bg-surface/70 p-4">
              <p className="mono-label">Resources</p>
              <div className="mt-2.5 space-y-1.5">
                {project.resourceLinks.map((link) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[10.5px] text-muted hover:bg-white/[0.04] hover:text-fg"
                  >
                    <Link2 className="size-3 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{new URL(link).hostname}</span>
                    <ExternalLink className="size-2.5 shrink-0 text-faint" />
                  </a>
                ))}
                {project.finalSubmissionLink ? (
                  <a
                    href={project.finalSubmissionLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-lime/15 bg-lime/[0.04] px-2 py-1.5 text-[10.5px] text-lime hover:bg-lime/[0.08]"
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">Final submission</span>
                    <ExternalLink className="size-2.5 shrink-0" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {completedTimeline.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface/60 p-4">
              <p className="mono-label">Completed</p>
              <div className="mt-2.5 space-y-2">
                {completedTimeline.slice(0, 4).map((milestone) => (
                  <div key={milestone.id} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-lime" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10.5px] text-muted">{milestone.title}</p>
                      <p className="mt-0.5 font-mono text-[8.5px] text-faint">
                        {milestone.completedAt ? formatDateKey(milestone.completedAt.toISOString().slice(0, 10), locale) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ProjectEditor
        open={projectOpen}
        onOpenChange={setProjectOpen}
        project={project}
        today={today}
        subjects={derived?.subjects ?? []}
      />

      <MilestoneEditor
        open={milestoneOpen}
        onOpenChange={(open) => {
          setMilestoneOpen(open)
          if (!open) setEditingMilestoneId(null)
        }}
        projectId={project.id}
        milestone={editingMilestone}
        nextOrder={nextOrder}
        defaultPlannedDate={project.targetFinishDate ?? today}
      />

      <FocusSessionDialog
        open={focusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFocusTarget(null)
        }}
        target={focusTarget}
      />

      <ConfirmDialog
        open={confirmCompleteProject}
        onOpenChange={setConfirmCompleteProject}
        title={`Complete “${project.title}”?`}
        description={
          progress.completed < progress.total
            ? `${progress.total - progress.completed} milestones are still open and will not be marked done for you.`
            : 'All counted milestones are complete. This closes the project and adds it to your record.'
        }
        confirmLabel="Complete project"
        loading={busyId === project.id}
        onConfirm={completeProject}
      />
      <ConfirmDialog
        open={confirmProjectReopen}
        onOpenChange={setConfirmProjectReopen}
        title="Reopen this project?"
        description="It returns to the active portfolio. Milestone history is unchanged."
        confirmLabel="Reopen project"
        loading={busyId === project.id}
        onConfirm={reopenProject}
      />
      <ConfirmDialog
        open={confirmArchiveMilestoneId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmArchiveMilestoneId(null)
        }}
        title="Archive this milestone?"
        description="It stops counting toward progress. Any completion history remains intact."
        confirmLabel="Archive"
        destructive
        loading={busyId === confirmArchiveMilestoneId}
        onConfirm={() => {
          if (confirmArchiveMilestoneId) void archiveMilestoneById(confirmArchiveMilestoneId)
        }}
      />
    </div>
  )
}

function FolderKanbanIcon() {
  return <MilestoneIcon className="size-5" />
}
