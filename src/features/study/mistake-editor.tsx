import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import type { Mistake, Topic } from '@/types/domain'
import {
  createMistake,
  deleteMistake,
  updateMistake,
} from '@/lib/firebase/repositories/practice'
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

interface MistakeDraft {
  topicId: string
  skill: string
  questionType: string
  questionRef: string
  whyWrong: string
  correctReasoning: string
  nextReviewDate: string
}

function makeDraft(mistake: Mistake | null): MistakeDraft {
  return {
    topicId: mistake?.topicId ?? '',
    skill: mistake?.skill ?? '',
    questionType: mistake?.questionType ?? '',
    questionRef: mistake?.questionRef ?? '',
    whyWrong: mistake?.whyWrong ?? '',
    correctReasoning: mistake?.correctReasoning ?? '',
    nextReviewDate: mistake?.nextReviewDate ?? '',
  }
}

export function MistakeEditor({
  open,
  onOpenChange,
  mistake,
  topics,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mistake: Mistake | null
  topics: Topic[]
  today: string
}) {
  const [draft, setDraft] = useState<MistakeDraft>(() => makeDraft(mistake))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(mistake))
    setError(null)
    setSaving(false)
  }, [open, mistake])

  const groupedTopics = useMemo(() => {
    const groups = new Map<string, Topic[]>()
    topics.forEach((topic) => {
      const group = topic.group ?? 'Ungrouped'
      const list = groups.get(group) ?? []
      list.push(topic)
      groups.set(group, list)
    })
    return groups
  }, [topics])

  const patch = (next: Partial<MistakeDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.skill.trim()) {
      setError('Name the skill this mistake exposed.')
      return
    }
    if (!draft.whyWrong.trim()) {
      setError('Write down why the answer was wrong. That is the point of the journal.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        topicId: draft.topicId || null,
        skill: draft.skill.trim(),
        questionType: draft.questionType.trim(),
        questionRef: draft.questionRef.trim(),
        whyWrong: draft.whyWrong.trim(),
        correctReasoning: draft.correctReasoning.trim(),
        nextReviewDate: draft.nextReviewDate || null,
      }
      if (mistake) {
        await updateMistake(mistake.id, payload)
        notifySaved('Mistake updated')
      } else {
        await createMistake(payload)
        notifySaved('Mistake logged', 'This is how the same error stops repeating.')
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const destroy = async () => {
    if (!mistake) return
    setSaving(true)
    try {
      await deleteMistake(mistake.id)
      notifySaved('Mistake deleted')
      setConfirmDelete(false)
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
            eyebrow={mistake ? 'Edit mistake' : 'Log a mistake'}
            title={mistake ? 'Sharpen the diagnosis.' : 'The error is the study material.'}
            description="Record the reason, not just the question number. Vague notes create the same mistake again."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <FormGrid>
                <Field label="Skill" hint="The narrow thing that broke down.">
                  <Input
                    autoFocus
                    value={draft.skill}
                    onChange={(input) => patch({ skill: input.target.value })}
                    placeholder="e.g. Solving absolute value inequalities"
                  />
                </Field>
                <Field label="Topic" optional>
                  <Select
                    value={draft.topicId}
                    onChange={(input) => patch({ topicId: input.target.value })}
                  >
                    <option value="">No topic</option>
                    {[...groupedTopics.entries()].map(([group, items]) => (
                      <optgroup key={group} label={group}>
                        {items.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              </FormGrid>

              <FormGrid>
                <Field label="Question type" optional>
                  <Input
                    value={draft.questionType}
                    onChange={(input) => patch({ questionType: input.target.value })}
                    placeholder="e.g. Words in context"
                  />
                </Field>
                <Field label="Question reference" optional>
                  <Input
                    value={draft.questionRef}
                    onChange={(input) => patch({ questionRef: input.target.value })}
                    placeholder="e.g. Practice Test 2, Q17"
                  />
                </Field>
              </FormGrid>

              <Field
                label="Why was it wrong?"
                hint="Be specific about the reasoning error, not “careless.”"
              >
                <Textarea
                  value={draft.whyWrong}
                  onChange={(input) => patch({ whyWrong: input.target.value })}
                  rows={3}
                  placeholder="e.g. I flipped the inequality when multiplying by a negative."
                  className="min-h-20"
                />
              </Field>

              <Field label="What is the correct reasoning?" optional>
                <Textarea
                  value={draft.correctReasoning}
                  onChange={(input) => patch({ correctReasoning: input.target.value })}
                  rows={3}
                  placeholder="Rewrite the rule in your own words and how you will spot it next time."
                  className="min-h-20"
                />
              </Field>

              <Field
                label="Review again"
                optional
                hint="Leave blank to keep it open without a scheduled date."
              >
                <input
                  type="date"
                  value={draft.nextReviewDate}
                  min={today}
                  onChange={(input) => patch({ nextReviewDate: input.target.value })}
                  className="h-10 w-full rounded-xl border border-line bg-surface-2/70 px-3 text-sm text-fg focus:border-lime/50 focus:outline-none"
                />
              </Field>

              {mistake ? (
                <p className="rounded-lg border border-line bg-surface-2/30 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
                  Status: <span className="text-muted">{mistake.status}</span>
                  {mistake.reviewedAt
                    ? ` · last reviewed ${mistake.reviewedAt.toLocaleDateString()}`
                    : ' · never reviewed'}
                  . Use the review buttons in the journal to move it forward.
                </p>
              ) : null}

              {error ? (
                <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {mistake ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" /> Delete
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
                  {mistake ? 'Save mistake' : 'Log mistake'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this mistake?"
        description="This permanently removes the journal entry. It does not affect your practice score history."
        confirmLabel="Delete mistake"
        destructive
        loading={saving}
        onConfirm={destroy}
      />
    </>
  )
}
