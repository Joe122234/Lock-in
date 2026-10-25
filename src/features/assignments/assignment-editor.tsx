import { useEffect, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import type { Assignment, AssignmentStatus, Priority } from '@/types/domain'
import {
  archiveAssignment,
  createAssignment,
  updateAssignment,
} from '@/lib/firebase/repositories/assignments'
import { formatDateLong } from '@/lib/dates'
import { isValidUrl, toStringArray } from '@/lib/utils'
import { ASSIGNMENT_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants'
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
import { ChecklistEditor } from '@/components/checklist-editor'
import { notifyError, notifySaved } from '@/components/status'
import { errorMessage } from '@/lib/utils'

interface AssignmentDraft {
  title: string
  course: string
  teacher: string
  description: string
  assignedDate: string
  dueDate: string
  targetFinishDate: string
  estimatedMinutes: number
  priority: Priority
  status: Exclude<AssignmentStatus, 'completed' | 'submitted'>
  checklist: Assignment['checklist']
  linksText: string
  notes: string
}

const EDITABLE_STATUSES: Array<Exclude<AssignmentStatus, 'completed' | 'submitted'>> = [
  'inbox',
  'planned',
  'inProgress',
  'deferred',
]

function makeDraft(assignment: Assignment | null, today: string): AssignmentDraft {
  return {
    title: assignment?.title ?? '',
    course: assignment?.course ?? '',
    teacher: assignment?.teacher ?? '',
    description: assignment?.description ?? '',
    assignedDate: assignment?.assignedDate ?? today,
    dueDate: assignment?.dueDate ?? '',
    targetFinishDate: assignment?.targetFinishDate ?? '',
    estimatedMinutes: assignment?.estimatedMinutes ?? 30,
    priority: assignment?.priority ?? 'medium',
    status:
      assignment && assignment.status !== 'completed' && assignment.status !== 'submitted'
        ? assignment.status
        : 'inbox',
    checklist: assignment?.checklist ?? [],
    linksText: (assignment?.resourceLinks ?? []).join('\n'),
    notes: assignment?.notes ?? '',
  }
}

export function AssignmentEditor({
  open,
  onOpenChange,
  assignment,
  today,
  defaultCourse,
  defaultDueDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: Assignment | null
  today: string
  defaultCourse?: string
  defaultDueDate?: string
}) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => makeDraft(assignment, today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    const next = makeDraft(assignment, today)
    if (!assignment) {
      next.course = defaultCourse ?? ''
      next.dueDate = defaultDueDate ?? ''
    }
    setDraft(next)
    setError(null)
    setSaving(false)
  }, [open, assignment, today, defaultCourse, defaultDueDate])

  const patch = (next: Partial<AssignmentDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.title.trim()) {
      setError('Give the assignment a title.')
      return
    }
    if (!draft.course.trim()) {
      setError('Add a course so this work has a home.')
      return
    }
    if (
      draft.dueDate &&
      draft.targetFinishDate &&
      draft.targetFinishDate > draft.dueDate
    ) {
      setError('The target finish should be on or before the real due date.')
      return
    }
    const links = toStringArray(draft.linksText)
    const invalidLink = links.find((link) => !isValidUrl(link))
    if (invalidLink) {
      setError(`Resource links must start with http:// or https:// — “${invalidLink}” does not.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        course: draft.course.trim(),
        teacher: draft.teacher.trim(),
        description: draft.description,
        assignedDate: draft.assignedDate || null,
        dueDate: draft.dueDate || null,
        targetFinishDate: draft.targetFinishDate || null,
        estimatedMinutes: Math.max(0, draft.estimatedMinutes),
        priority: draft.priority,
        checklist: draft.checklist.filter((item) => item.label.trim()),
        resourceLinks: links,
        notes: draft.notes,
      }
      if (assignment) {
        await updateAssignment(assignment.id, {
          ...payload,
          ...(assignment.status === 'completed' || assignment.status === 'submitted'
            ? {}
            : { status: draft.status }),
        })
        notifySaved('Assignment updated', assignment.title)
      } else {
        await createAssignment({
          ...payload,
          status: draft.dueDate ? draft.status === 'inbox' ? 'planned' : draft.status : draft.status,
        })
        notifySaved('Assignment added', draft.dueDate ? formatDateLong(draft.dueDate, 'en-US') : 'Inbox')
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
    if (!assignment) return
    setSaving(true)
    try {
      await archiveAssignment(assignment.id)
      notifySaved('Assignment archived', 'Its completion history is untouched.')
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
            eyebrow={assignment ? 'Edit homework' : 'New homework'}
            title={assignment ? 'Keep the work honest.' : 'Capture the real assignment.'}
            description="The due date is the promise. The target finish date is when you intend to be done — keep both visible."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <Field label="Assignment">
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={(input) => patch({ title: input.target.value })}
                  placeholder="e.g. Read Chapter 12 and answer questions 1–8"
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
                <Field label="Teacher" optional>
                  <Input
                    value={draft.teacher}
                    onChange={(input) => patch({ teacher: input.target.value })}
                    placeholder="e.g. Ms. Rivera"
                  />
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
                <Field
                  label="Target finish"
                  hint="When you intend to finish, not when it is due."
                >
                  <Input
                    type="date"
                    value={draft.targetFinishDate}
                    onChange={(input) => patch({ targetFinishDate: input.target.value })}
                  />
                </Field>
                <Field label="Due date" hint="The real, fixed deadline.">
                  <Input
                    type="date"
                    value={draft.dueDate}
                    onChange={(input) => patch({ dueDate: input.target.value })}
                  />
                </Field>
              </FormGrid>
              <FormGrid cols={3}>
                <Field label="Estimated time">
                  <NumberInput
                    min={0}
                    max={1200}
                    step={5}
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
                    onChange={(input) =>
                      patch({
                        status: input.target.value as Exclude<AssignmentStatus, 'completed' | 'submitted'>,
                      })
                    }
                    disabled={assignment?.status === 'completed' || assignment?.status === 'submitted'}
                  >
                    {EDITABLE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ASSIGNMENT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              {assignment?.status === 'completed' || assignment?.status === 'submitted' ? (
                <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
                  This assignment is already {assignment.status === 'submitted' ? 'submitted' : 'complete'}.
                  Reopen it from the queue to change its status. Completed records stay in your history.
                </p>
              ) : null}
              <Field label="Description" optional>
                <Textarea
                  value={draft.description}
                  onChange={(input) => patch({ description: input.target.value })}
                  rows={2}
                  placeholder="What exactly needs to be produced?"
                  className="min-h-16"
                />
              </Field>
              <Field label="Steps" hint="Break it down enough that starting is obvious." optional>
                <ChecklistEditor
                  items={draft.checklist}
                  onChange={(checklist) => patch({ checklist })}
                  placeholder="e.g. Read pages 301–318"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Resource links" hint="One URL per line." optional>
                  <Textarea
                    value={draft.linksText}
                    onChange={(input) => patch({ linksText: input.target.value })}
                    rows={2}
                    placeholder={'https://…\nhttps://…'}
                    className="min-h-16 font-mono text-[11px]"
                  />
                </Field>
                <Field label="Notes" optional>
                  <Textarea
                    value={draft.notes}
                    onChange={(input) => patch({ notes: input.target.value })}
                    rows={2}
                    placeholder="Teacher comments, rubric notes, or context…"
                    className="min-h-16"
                  />
                </Field>
              </div>
              {error ? (
                <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {assignment ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmArchive(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
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
                  {assignment ? 'Save changes' : 'Add assignment'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this assignment?"
        description="It leaves the active queue. Any completion record stays in your activity history. You can restore it from Settings → Data."
        confirmLabel="Archive"
        destructive
        loading={saving}
        onConfirm={archive}
      />
    </>
  )
}
