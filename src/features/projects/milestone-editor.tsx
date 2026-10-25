import { useEffect, useState } from 'react'
import { Archive, Loader2, Save } from 'lucide-react'
import type { Milestone } from '@/types/domain'
import {
  archiveMilestone,
  createMilestone,
  updateMilestone,
} from '@/lib/firebase/repositories/projects'
import { Button } from '@/components/ui/button'
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, NumberInput, Textarea } from '@/components/ui/field'
import { ChecklistEditor } from '@/components/checklist-editor'
import { notifyError, notifySaved } from '@/components/status'
import { errorMessage } from '@/lib/utils'

interface MilestoneDraft {
  title: string
  description: string
  plannedDate: string
  dueDate: string
  estimatedMinutes: number
  checklist: Milestone['checklist']
}

function makeDraft(milestone: Milestone | null, plannedDate: string): MilestoneDraft {
  return {
    title: milestone?.title ?? '',
    description: milestone?.description ?? '',
    plannedDate: milestone?.plannedDate ?? plannedDate,
    dueDate: milestone?.dueDate ?? '',
    estimatedMinutes: milestone?.estimatedMinutes ?? 45,
    checklist: milestone?.checklist ?? [],
  }
}

export function MilestoneEditor({
  open,
  onOpenChange,
  projectId,
  milestone,
  nextOrder,
  defaultPlannedDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  milestone: Milestone | null
  nextOrder: number
  defaultPlannedDate: string
}) {
  const [draft, setDraft] = useState<MilestoneDraft>(() => makeDraft(milestone, defaultPlannedDate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(milestone, defaultPlannedDate))
    setError(null)
    setSaving(false)
  }, [open, milestone, defaultPlannedDate])

  const patch = (next: Partial<MilestoneDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.title.trim()) {
      setError('Give the milestone a clear title.')
      return
    }
    if (draft.plannedDate && draft.dueDate && draft.plannedDate > draft.dueDate) {
      setError('The planned date should be on or before the due date.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description,
        plannedDate: draft.plannedDate || null,
        dueDate: draft.dueDate || null,
        estimatedMinutes: Math.max(0, draft.estimatedMinutes),
        checklist: draft.checklist.filter((item) => item.label.trim()),
      }
      if (milestone) {
        await updateMilestone(milestone.id, payload)
        notifySaved('Milestone updated', draft.title)
      } else {
        await createMilestone(
          {
            projectId,
            ...payload,
          },
          nextOrder,
        )
        notifySaved('Milestone added', draft.title)
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
    if (!milestone) return
    setSaving(true)
    try {
      await archiveMilestone(milestone.id)
      notifySaved('Milestone archived')
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
        <DialogContent>
          <DialogHeader
            eyebrow={milestone ? 'Edit milestone' : 'New milestone'}
            title={milestone ? 'Tighten the next step.' : 'Break the project down.'}
            description="Milestones should produce something visible. Keep each one small enough to finish in a sitting or two."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <Field label="Milestone">
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={(input) => patch({ title: input.target.value })}
                  placeholder="e.g. Outline the three-country comparison"
                />
              </Field>
              <FormGrid cols={3}>
                <Field label="Planned date">
                  <Input
                    type="date"
                    value={draft.plannedDate}
                    onChange={(input) => patch({ plannedDate: input.target.value })}
                  />
                </Field>
                <Field label="Due date" optional>
                  <Input
                    type="date"
                    value={draft.dueDate}
                    onChange={(input) => patch({ dueDate: input.target.value })}
                  />
                </Field>
                <Field label="Estimated time">
                  <NumberInput
                    min={0}
                    max={600}
                    step={5}
                    suffix="min"
                    value={draft.estimatedMinutes}
                    onChange={(input) =>
                      patch({ estimatedMinutes: Number(input.target.value) || 0 })
                    }
                  />
                </Field>
              </FormGrid>
              <Field label="Description" optional>
                <Textarea
                  value={draft.description}
                  onChange={(input) => patch({ description: input.target.value })}
                  rows={2}
                  placeholder="What must exist when this milestone is done?"
                  className="min-h-16"
                />
              </Field>
              <Field label="Steps" optional>
                <ChecklistEditor
                  items={draft.checklist}
                  onChange={(checklist) => patch({ checklist })}
                  placeholder="Add a step…"
                />
              </Field>
              {error ? (
                <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] text-danger">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {milestone ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmArchive(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Archive className="size-3.5" /> Archive
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {milestone ? 'Save milestone' : 'Add milestone'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this milestone?"
        description="It stops counting toward project progress. Completion history, if any, is preserved."
        confirmLabel="Archive milestone"
        destructive
        loading={saving}
        onConfirm={archive}
      />
    </>
  )
}
