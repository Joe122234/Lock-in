import { useEffect, useState } from 'react'
import { Archive, Loader2, Save } from 'lucide-react'
import type { Priority, Project, ProjectStatus } from '@/types/domain'
import {
  archiveProject,
  createProject,
  setProjectStatus,
  updateProject,
} from '@/lib/firebase/repositories/projects'
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from '@/lib/constants'
import { isValidUrl, toStringArray } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, NumberInput, Select, Textarea } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

interface ProjectDraft {
  title: string
  course: string
  subjectId: string
  description: string
  assignedDate: string
  dueDate: string
  targetFinishDate: string
  estimatedMinutes: number
  priority: Priority
  status: ProjectStatus
  notes: string
  linksText: string
  finalSubmissionLink: string
}

function makeDraft(project: Project | null, today: string): ProjectDraft {
  return {
    title: project?.title ?? '',
    course: project?.course ?? '',
    subjectId: project?.subjectId ?? '',
    description: project?.description ?? '',
    assignedDate: project?.assignedDate ?? today,
    dueDate: project?.dueDate ?? '',
    targetFinishDate: project?.targetFinishDate ?? '',
    estimatedMinutes: project?.estimatedMinutes ?? 180,
    priority: project?.priority ?? 'medium',
    status: project?.status ?? 'notStarted',
    notes: project?.notes ?? '',
    linksText: (project?.resourceLinks ?? []).join('\n'),
    finalSubmissionLink: project?.finalSubmissionLink ?? '',
  }
}

export function ProjectEditor({
  open,
  onOpenChange,
  project,
  today,
  subjects,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  today: string
  subjects: Array<{ id: string; name: string; color: string }>
  onCreated?: (id: string) => void
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => makeDraft(project, today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(project, today))
    setError(null)
    setSaving(false)
  }, [open, project, today])

  const patch = (next: Partial<ProjectDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.title.trim()) {
      setError('Give the project a title.')
      return
    }
    if (!draft.course.trim()) {
      setError('Add a course so this project has a home.')
      return
    }
    if (draft.dueDate && draft.targetFinishDate && draft.targetFinishDate > draft.dueDate) {
      setError('The target finish should be on or before the real due date.')
      return
    }
    const links = toStringArray(draft.linksText)
    const invalid = links.find((link) => !isValidUrl(link))
    if (invalid) {
      setError(`Resource links must be full URLs — “${invalid}” is not.`)
      return
    }
    if (draft.finalSubmissionLink && !isValidUrl(draft.finalSubmissionLink)) {
      setError('The final submission link must start with http:// or https://.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        course: draft.course.trim(),
        subjectId: draft.subjectId || null,
        description: draft.description,
        assignedDate: draft.assignedDate || null,
        dueDate: draft.dueDate || null,
        targetFinishDate: draft.targetFinishDate || null,
        estimatedMinutes: Math.max(0, draft.estimatedMinutes),
        priority: draft.priority,
        notes: draft.notes,
        resourceLinks: links,
        finalSubmissionLink: draft.finalSubmissionLink.trim(),
      }
      if (project) {
        await updateProject(project.id, payload)
        if (draft.status !== project.status) {
          await setProjectStatus(project.id, draft.status)
        }
        notifySaved('Project updated', project.title)
      } else {
        const id = await createProject(payload)
        notifySaved('Project created', 'Add milestones to turn it into a real plan.')
        onCreated?.(id)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!project) return
    setSaving(true)
    try {
      await archiveProject(project.id)
      notifySaved('Project archived')
      setConfirmArchive(false)
      onOpenChange(false)
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader
            eyebrow={project ? 'Edit project' : 'New project'}
            title={project ? 'Keep the plan current.' : 'Start with the real deliverable.'}
            description="A project is only as clear as its milestones. Dates and scope stay visible while you build it."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <Field label="Project title">
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={(input) => patch({ title: input.target.value })}
                  placeholder="e.g. Comparative government presentation"
                />
              </Field>
              <FormGrid>
                <Field label="Course">
                  <Input
                    value={draft.course}
                    onChange={(input) => patch({ course: input.target.value })}
                    placeholder="e.g. AP Comparative Government"
                  />
                </Field>
                <Field label="Linked subject" optional>
                  <Select
                    value={draft.subjectId}
                    onChange={(input) => patch({ subjectId: input.target.value })}
                  >
                    <option value="">No subject</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <FormGrid cols={3}>
                <Field label="Assigned" optional>
                  <Input
                    type="date"
                    value={draft.assignedDate}
                    onChange={(input) => patch({ assignedDate: input.target.value })}
                  />
                </Field>
                <Field label="Target finish" hint="When you intend to be done.">
                  <Input
                    type="date"
                    value={draft.targetFinishDate}
                    onChange={(input) => patch({ targetFinishDate: input.target.value })}
                  />
                </Field>
                <Field label="Final due date" hint="The real deadline.">
                  <Input
                    type="date"
                    value={draft.dueDate}
                    onChange={(input) => patch({ dueDate: input.target.value })}
                  />
                </Field>
              </FormGrid>
              <FormGrid cols={3}>
                <Field label="Estimated effort">
                  <NumberInput
                    min={0}
                    max={6000}
                    step={15}
                    suffix="min"
                    value={draft.estimatedMinutes}
                    onChange={(input) =>
                      patch({ estimatedMinutes: Number(input.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Priority">
                  <Select
                    value={draft.priority}
                    onChange={(input) => patch({ priority: input.target.value as Priority })}
                  >
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select
                    value={draft.status}
                    onChange={(input) => patch({ status: input.target.value as ProjectStatus })}
                    disabled={project?.status === 'completed' && draft.status !== 'completed'}
                  >
                    {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field label="What has to exist at the end?" optional>
                <Textarea
                  value={draft.description}
                  onChange={(input) => patch({ description: input.target.value })}
                  rows={3}
                  placeholder="Describe the finished deliverable, not the busywork."
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Resource links" hint="One URL per line." optional>
                  <Textarea
                    value={draft.linksText}
                    onChange={(input) => patch({ linksText: input.target.value })}
                    rows={2}
                    placeholder={'https://…'}
                    className={cn('min-h-16 font-mono text-[11px]')}
                  />
                </Field>
                <Field label="Final submission link" optional>
                  <Input
                    value={draft.finalSubmissionLink}
                    onChange={(input) => patch({ finalSubmissionLink: input.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Notes" optional>
                <Textarea
                  value={draft.notes}
                  onChange={(input) => patch({ notes: input.target.value })}
                  rows={2}
                  placeholder="Rubric notes, group logistics, revision history…"
                  className="min-h-16"
                />
              </Field>
              {error ? (
                <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {project ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmArchive(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Archive className="size-3.5" />
                    Archive
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {project ? 'Save project' : 'Create project'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this project?"
        description="The project and its milestones leave the active portfolio. Completed milestone history stays intact."
        confirmLabel="Archive project"
        destructive
        loading={saving}
        onConfirm={archive}
      />
    </>
  )
}
