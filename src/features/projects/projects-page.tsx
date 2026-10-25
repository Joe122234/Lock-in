import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderKanban,
  Milestone as MilestoneIcon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Target,
} from 'lucide-react'
import type { Project } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  archiveProject,
  setProjectStatus,
} from '@/lib/firebase/repositories/projects'
import {
  daysBetween,
  deadlineLabel,
  formatDateKey,
  formatDuration,
} from '@/lib/dates'
import { PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge, SubjectBadge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/feedback'
import { SearchInput } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/page'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { DeadlineTone, PriorityBadge, ProjectStatusBadge, notifyError, notifySaved } from '@/components/status'
import { cn, percent } from '@/lib/utils'
import { ProjectEditor } from './project-editor'

type Filter = 'active' | 'completed' | 'all'
type Sort = 'deadline' | 'risk' | 'title'

export function ProjectsPage() {
  const { collections, settings, today, derived, getSubject } = useWorkspaceData()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('deadline')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState<Project | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Project | null>(null)

  const locale = settings?.locale ?? 'en-US'
  const projects = derived?.projects ?? []

  useEffect(() => {
    const id = searchParams.get('open')
    if (!id) return
    navigate(`/projects/${id}`, { replace: true })
  }, [searchParams, navigate])

  const stats = useMemo(() => {
    const active = projects.filter((item) => item.project.status !== 'completed')
    const atRisk = active.filter((item) => item.progress.atRisk)
    const activeMilestones = collections.milestones.filter(
      (milestone) =>
        !milestone.archivedAt &&
        milestone.status !== 'skipped' &&
        active.some((item) => item.project.id === milestone.projectId),
    )
    const completedMilestones = activeMilestones.filter((milestone) => milestone.status === 'completed')
    const nextDeadline = active
      .map((item) => item.project.targetFinishDate ?? item.project.dueDate)
      .filter((date): date is string => Boolean(date))
      .sort()[0]
    return {
      active,
      atRisk,
      completed: projects.filter((item) => item.project.status === 'completed'),
      milestoneDone: completedMilestones.length,
      milestoneTotal: activeMilestones.length,
      nextDeadline: nextDeadline ?? null,
    }
  }, [projects, collections.milestones])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    let list = projects.filter((item) => {
      if (filter === 'active') return item.project.status !== 'completed'
      if (filter === 'completed') return item.project.status === 'completed'
      return true
    })
    if (normalized) {
      list = list.filter(
        (item) =>
          item.project.title.toLowerCase().includes(normalized) ||
          item.project.course.toLowerCase().includes(normalized) ||
          item.project.description.toLowerCase().includes(normalized),
      )
    }
    return [...list].sort((a, b) => {
      if (sort === 'title') return a.project.title.localeCompare(b.project.title)
      if (sort === 'risk') {
        if (a.progress.atRisk !== b.progress.atRisk) return a.progress.atRisk ? -1 : 1
      }
      const aDate = a.project.targetFinishDate ?? a.project.dueDate ?? '9999-12-31'
      const bDate = b.project.targetFinishDate ?? b.project.dueDate ?? '9999-12-31'
      return aDate.localeCompare(bDate)
    })
  }, [projects, filter, query, sort])

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const completeProject = async (project: Project) => {
    setBusyId(project.id)
    try {
      await setProjectStatus(project.id, 'completed')
      notifySaved('Project completed', 'The finished work is now part of your record.')
      setConfirmComplete(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const reopenProject = async (project: Project) => {
    setBusyId(project.id)
    try {
      await setProjectStatus(project.id, 'inProgress')
      notifySaved('Project reopened')
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  const archive = async (project: Project) => {
    setBusyId(project.id)
    try {
      await archiveProject(project.id)
      notifySaved('Project archived')
      setConfirmArchive(null)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Deliverables, not vibes"
        title="Projects"
        description="Progress is derived from completed milestones. Risk is shown early, while there is still time to change the outcome."
        actions={
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus className="size-3.5" />
            New project
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Active</p>
          <p className="font-num mt-2.5 text-[26px] font-semibold leading-none">{stats.active.length}</p>
          <p className="mt-1.5 text-[10px] text-faint">{formatDuration(stats.active.reduce((sum, item) => sum + item.progress.remainingMinutes, 0))} of milestones left</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">At risk</p>
          <p className={cn('font-num mt-2.5 text-[26px] font-semibold leading-none', stats.atRisk.length > 0 && 'text-warning')}>{stats.atRisk.length}</p>
          <p className="mt-1.5 text-[10px] text-faint">{stats.atRisk.length > 0 ? 'Late milestone or tight runway' : 'No active risk flags'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Milestones done</p>
          <p className="font-num mt-2.5 text-[26px] font-semibold leading-none">{stats.milestoneDone}<span className="text-[13px] font-normal text-faint">/{stats.milestoneTotal}</span></p>
          <Progress value={percent(stats.milestoneDone, stats.milestoneTotal || 1)} size="sm" className="mt-2.5" />
        </div>
        <div className="rounded-2xl border border-line bg-surface/85 p-3.5 sm:p-4">
          <p className="mono-label">Next project date</p>
          <p className="font-num mt-2.5 text-[20px] font-semibold leading-none">
            {stats.nextDeadline ? formatDateKey(stats.nextDeadline, locale, { month: 'short', day: 'numeric' }) : '—'}
          </p>
          <p className="mt-1.5 text-[10px] text-faint">
            {stats.nextDeadline ? daysBetween(today, stats.nextDeadline) >= 0 ? `${daysBetween(today, stats.nextDeadline)} days left` : 'Past target' : 'No dated projects'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          size="sm"
          ariaLabel="Project filter"
          options={[
            { value: 'active', label: <>Active <span className="font-mono text-[9px] opacity-60">{stats.active.length}</span></> },
            { value: 'completed', label: <>Done <span className="font-mono text-[9px] opacity-60">{stats.completed.length}</span></> },
            { value: 'all', label: 'All' },
          ]}
        />
        <SearchInput
          value={query}
          onChange={(input) => setQuery(input.target.value)}
          placeholder="Search projects…"
          className="min-w-40 flex-1 sm:max-w-xs"
        />
        <select
          value={sort}
          onChange={(input) => setSort(input.target.value as Sort)}
          aria-label="Sort projects"
          className="ml-auto h-9 rounded-lg border border-line bg-surface-2/70 px-2 text-[11px] text-muted focus:border-lime/40 focus:outline-none"
        >
          <option value="deadline">Sort: next deadline</option>
          <option value="risk">Sort: risk first</option>
          <option value="title">Sort: title</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface/60">
          <EmptyState
            icon={<FolderKanban className="size-5" />}
            title={query ? 'No projects match.' : filter === 'completed' ? 'No completed projects yet.' : 'No active projects.'}
            description={
              query
                ? 'Try a different title or course.'
                : 'Add a larger deliverable and break it into milestones. The progress bar will never move on its own.'
            }
            action={
              !query && filter !== 'completed' ? (
                <Button variant="secondary" size="sm" onClick={openNew}>
                  <Plus className="size-3.5" /> Create a project
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ project, progress }) => {
            const subject = getSubject(project.subjectId)
            const nextMilestone = collections.milestones
              .filter(
                (milestone) =>
                  milestone.projectId === project.id &&
                  !milestone.archivedAt &&
                  milestone.status !== 'completed' &&
                  milestone.status !== 'skipped',
              )
              .sort((a, b) => {
                const aDate = a.plannedDate ?? a.dueDate ?? '9999-12-31'
                const bDate = b.plannedDate ?? b.dueDate ?? '9999-12-31'
                return aDate.localeCompare(bDate)
              })[0]
            const deadline = project.targetFinishDate ?? project.dueDate
            const label = deadlineLabel(deadline, today, locale)
            return (
              <div
                key={project.id}
                className={cn(
                  'group relative flex flex-col rounded-2xl border bg-surface/85 transition-colors hover:border-line-strong',
                  progress.atRisk ? 'border-warning/25' : 'border-line',
                )}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="flex-1 p-4 text-left sm:p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {subject ? <SubjectBadge name={subject.name} color={subject.color} /> : null}
                      <ProjectStatusBadge status={project.status} />
                      {progress.atRisk ? <Badge tone="warning" dot>At risk</Badge> : null}
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted" />
                  </div>
                  <h2 className="mt-3 text-balance text-[15px] font-semibold leading-snug tracking-[-0.015em] text-fg">
                    {project.title}
                  </h2>
                  <p className="mt-1 text-[10.5px] text-faint">{project.course}</p>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                        {progress.completed}/{progress.total} milestones
                      </span>
                      <span className={cn('font-mono text-[9px]', progress.atRisk ? 'text-warning' : 'text-muted')}>
                        {progress.percent}%
                      </span>
                    </div>
                    <Progress
                      value={progress.percent}
                      tone={project.status === 'completed' ? 'teal' : progress.atRisk ? 'warning' : 'lime'}
                      size="sm"
                      className="mt-2"
                    />
                  </div>

                  {progress.riskReason ? (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warning/15 bg-warning/[0.045] px-2.5 py-1.5 text-[10px] leading-relaxed text-warning/90">
                      <CircleAlert className="mt-0.5 size-3 shrink-0" />
                      {progress.riskReason}
                    </p>
                  ) : nextMilestone ? (
                    <p className="mt-3 flex items-center gap-1.5 truncate text-[10.5px] text-muted">
                      <MilestoneIcon className="size-3 shrink-0 text-faint" />
                      <span className="truncate">Next: {nextMilestone.title}</span>
                    </p>
                  ) : progress.total === 0 ? (
                    <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <Target className="size-3" /> Add milestones to make a plan.
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
                    {deadline ? (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-2.5 text-faint" />
                        <DeadlineTone tone={label?.tone ?? 'normal'} className="text-[9px]">
                          {formatDateKey(deadline, locale, { month: 'short', day: 'numeric' })}
                          {label && (label.tone === 'overdue' || label.tone === 'urgent') ? ` · ${label.label}` : ''}
                        </DeadlineTone>
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">No date</span>
                    )}
                    {progress.remainingMinutes > 0 ? (
                      <span className="flex items-center gap-1 font-mono text-[9px] text-faint">
                        <Clock3 className="size-2.5" /> {formatDuration(progress.remainingMinutes)}
                      </span>
                    ) : null}
                    <PriorityBadge priority={project.priority} className="h-[18px] px-1.5 text-[9px]" />
                  </div>
                </button>

                <div className="absolute right-3 top-11">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${project.title}`}
                        className="flex size-7 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-white/5 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Project</DropdownMenuLabel>
                      <DropdownMenuItem
                        icon={<ChevronRight className="size-3.5" />}
                        onSelect={() => navigate(`/projects/${project.id}`)}
                      >
                        Open project
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<ArrowRight className="size-3.5" />}
                        onSelect={() => {
                          setEditing(project)
                          setEditorOpen(true)
                        }}
                      >
                        Edit details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {project.status === 'completed' ? (
                        <DropdownMenuItem icon={<RotateCcw className="size-3.5" />} onSelect={() => void reopenProject(project)}>
                          Reopen project
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem icon={<Check className="size-3.5" />} onSelect={() => setConfirmComplete(project)}>
                          Mark project complete
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        icon={<Archive className="size-3.5" />}
                        danger
                        onSelect={() => setConfirmArchive(project)}
                      >
                        Archive project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ProjectEditor
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditing(null)
        }}
        project={editing}
        today={today}
        subjects={derived?.subjects ?? []}
        onCreated={(id) => navigate(`/projects/${id}`)}
      />

      <ConfirmDialog
        open={confirmComplete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmComplete(null)
        }}
        title={`Complete “${confirmComplete?.title ?? ''}”?`}
        description={
          confirmComplete
            ? (() => {
                const progress = projects.find((item) => item.project.id === confirmComplete.id)?.progress
                if (progress && progress.completed < progress.total) {
                  return `${progress.total - progress.completed} milestones are still open. Completing the project will not mark them done or invent that work.`
                }
                return 'Every counted milestone is complete. This closes the deliverable in your portfolio.'
              })()
            : ''
        }
        confirmLabel="Complete project"
        loading={busyId === confirmComplete?.id}
        onConfirm={() => {
          if (confirmComplete) void completeProject(confirmComplete)
        }}
      />

      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmArchive(null)
        }}
        title={`Archive “${confirmArchive?.title ?? ''}”?`}
        description="It leaves the active portfolio. Milestone completion history is preserved."
        confirmLabel="Archive project"
        destructive
        loading={busyId === confirmArchive?.id}
        onConfirm={() => {
          if (confirmArchive) void archive(confirmArchive)
        }}
      />
    </div>
  )
}
