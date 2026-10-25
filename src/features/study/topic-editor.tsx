import { useEffect, useState } from 'react'
import { Archive, Loader2, Save } from 'lucide-react'
import type { Topic, TopicStage } from '@/types/domain'
import {
  archiveTopic,
  createTopic,
  updateTopic,
} from '@/lib/firebase/repositories/subjects'
import { Button } from '@/components/ui/button'
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { errorMessage } from '@/lib/utils'
import { TOPIC_STAGE_LABELS } from './study-constants'

interface TopicDraft {
  name: string
  group: string
  stage: TopicStage
  notes: string
}

function makeDraft(topic: Topic | null): TopicDraft {
  return {
    name: topic?.name ?? '',
    group: topic?.group ?? '',
    stage: topic?.stage ?? 'notStarted',
    notes: topic?.notes ?? '',
  }
}

export function TopicEditor({
  open,
  onOpenChange,
  subjectId,
  topic,
  nextOrder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectId: string
  topic: Topic | null
  nextOrder: number
}) {
  const [draft, setDraft] = useState<TopicDraft>(() => makeDraft(topic))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(topic))
    setError(null)
    setSaving(false)
  }, [open, topic])

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the topic a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: draft.name.trim(),
        group: draft.group.trim() || null,
        stage: draft.stage,
        notes: draft.notes.trim(),
      }
      if (topic) {
        await updateTopic(topic.id, payload)
        notifySaved('Topic updated', draft.name)
      } else {
        await createTopic({ subjectId, ...payload }, nextOrder)
        notifySaved('Topic added', draft.name)
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
    if (!topic) return
    setSaving(true)
    try {
      await archiveTopic(topic.id)
      notifySaved('Topic archived', 'Its mission history is untouched.')
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
            eyebrow={topic ? 'Edit topic' : 'New topic'}
            title={topic ? 'Keep the map honest.' : 'Name the thing you need to learn.'}
            description="Topics carry a stage and a short note. They are the map — missions are the actual work."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <Field label="Topic">
                <Input
                  autoFocus
                  value={draft.name}
                  onChange={(input) =>
                    setDraft((current) => ({ ...current, name: input.target.value }))
                  }
                  placeholder="e.g. Systems of equations"
                />
              </Field>
              <FormGrid>
                <Field label="Group" optional hint="Unit, skill area, or chapter.">
                  <Input
                    value={draft.group}
                    onChange={(input) =>
                      setDraft((current) => ({ ...current, group: input.target.value }))
                    }
                    placeholder="e.g. Unit 4"
                  />
                </Field>
                <Field label="Stage">
                  <Select
                    value={draft.stage}
                    onChange={(input) =>
                      setDraft((current) => ({
                        ...current,
                        stage: input.target.value as TopicStage,
                      }))
                    }
                  >
                    {(Object.keys(TOPIC_STAGE_LABELS) as TopicStage[]).map((stage) => (
                      <option key={stage} value={stage}>
                        {TOPIC_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field label="Notes" optional>
                <Textarea
                  value={draft.notes}
                  onChange={(input) =>
                    setDraft((current) => ({ ...current, notes: input.target.value }))
                  }
                  rows={3}
                  placeholder="What keeps going wrong here? What does mastery look like?"
                  className="min-h-20"
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
                {topic ? (
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {topic ? 'Save topic' : 'Add topic'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive “${topic?.name ?? ''}”?`}
        description="It leaves the topic map but stays attached to any mission history. You can restore archived topics from Settings → Data."
        confirmLabel="Archive topic"
        destructive
        loading={saving}
        onConfirm={archive}
      />
    </>
  )
}
