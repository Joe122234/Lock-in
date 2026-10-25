import { useEffect, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import type { PracticeRecord } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  createPracticeRecord,
  deletePracticeRecord,
  updatePracticeRecord,
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
import { Field, FormGrid, Input, NumberInput, Select, Textarea } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage, percent } from '@/lib/utils'
import { PRACTICE_SECTION_LABELS, PRACTICE_TYPE_LABELS } from './study-constants'

interface PracticeDraft {
  dateKey: string
  recordType: PracticeRecord['recordType']
  source: string
  section: PracticeRecord['section']
  attempted: string
  correct: string
  minutes: string
  totalScore: string
  mathScore: string
  readingWritingScore: string
  notes: string
}

function makeDraft(record: PracticeRecord | null, today: string): PracticeDraft {
  return {
    dateKey: record?.dateKey ?? today,
    recordType: record?.recordType ?? 'questions',
    source: record?.source ?? '',
    section: record?.section ?? 'mixed',
    attempted: record ? String(record.attempted) : '',
    correct: record ? String(record.correct) : '',
    minutes: record ? String(record.minutes) : '',
    totalScore: record?.totalScore ? String(record.totalScore) : '',
    mathScore: record?.mathScore ? String(record.mathScore) : '',
    readingWritingScore: record?.readingWritingScore
      ? String(record.readingWritingScore)
      : '',
    notes: record?.notes ?? '',
  }
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function PracticeEditor({
  open,
  onOpenChange,
  record,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: PracticeRecord | null
}) {
  const { today } = useWorkspaceData()
  const [draft, setDraft] = useState<PracticeDraft>(() => makeDraft(record, today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(record, today))
    setError(null)
    setSaving(false)
  }, [open, record, today])

  const patch = (next: Partial<PracticeDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const attempted = parseOptionalNumber(draft.attempted)
  const correct = parseOptionalNumber(draft.correct)
  const accuracy =
    attempted !== null && correct !== null && attempted > 0
      ? percent(correct, attempted)
      : null

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.dateKey) {
      setError('Choose the date you practised.')
      return
    }
    if (!draft.source.trim()) {
      setError('Add a source — a book, test number, or platform.')
      return
    }
    if (attempted === null || attempted <= 0) {
      setError('Record at least one attempted question.')
      return
    }
    if (correct === null || correct < 0 || correct > attempted) {
      setError('Correct answers must be between 0 and the number attempted.')
      return
    }
    const minutes = parseOptionalNumber(draft.minutes)
    if (minutes === null || minutes <= 0) {
      setError('Add the real time spent practising.')
      return
    }
    const totalScore = parseOptionalNumber(draft.totalScore)
    const mathScore = parseOptionalNumber(draft.mathScore)
    const readingWritingScore = parseOptionalNumber(draft.readingWritingScore)
    if (totalScore !== null && (totalScore < 400 || totalScore > 1600)) {
      setError('A full-test total score must be between 400 and 1600.')
      return
    }
    if (mathScore !== null && (mathScore < 200 || mathScore > 800)) {
      setError('A Math section score must be between 200 and 800.')
      return
    }
    if (
      readingWritingScore !== null &&
      (readingWritingScore < 200 || readingWritingScore > 800)
    ) {
      setError('A Reading & Writing section score must be between 200 and 800.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        dateKey: draft.dateKey,
        recordType: draft.recordType,
        source: draft.source.trim(),
        section: draft.section,
        attempted: Math.round(attempted),
        correct: Math.round(correct),
        totalScore,
        mathScore,
        readingWritingScore,
        minutes: Math.round(minutes),
        notes: draft.notes.trim(),
      }
      if (record) {
        await updatePracticeRecord(record.id, payload)
        notifySaved('Practice record updated')
      } else {
        await createPracticeRecord(payload)
        notifySaved('Practice logged', `${payload.correct}/${payload.attempted} correct.`)
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
    if (!record) return
    setSaving(true)
    try {
      await deletePracticeRecord(record.id)
      notifySaved('Practice record removed', 'The linked activity was reversed, not hidden.')
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
            eyebrow={record ? 'Edit practice' : 'Log practice'}
            title={record ? 'Correct the record.' : 'Record what the questions proved.'}
            description="Attempted, correct, and real minutes. Scores are optional unless it was a scored test."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <FormGrid cols={3}>
                <Field label="Date">
                  <Input
                    type="date"
                    value={draft.dateKey}
                    max={today}
                    onChange={(input) => patch({ dateKey: input.target.value })}
                  />
                </Field>
                <Field label="Format">
                  <Select
                    value={draft.recordType}
                    onChange={(input) => {
                      const recordType = input.target.value as PracticeRecord['recordType']
                      patch({
                        recordType,
                        ...(recordType === 'fullTest'
                          ? { section: 'mixed' as const }
                          : {}),
                      })
                    }}
                  >
                    {(Object.keys(PRACTICE_TYPE_LABELS) as PracticeRecord['recordType'][]).map(
                      (type) => (
                        <option key={type} value={type}>
                          {PRACTICE_TYPE_LABELS[type]}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Section">
                  <Select
                    value={draft.section}
                    onChange={(input) =>
                      patch({ section: input.target.value as PracticeRecord['section'] })
                    }
                    disabled={draft.recordType === 'fullTest'}
                  >
                    {(Object.keys(PRACTICE_SECTION_LABELS) as PracticeRecord['section'][]).map(
                      (section) => (
                        <option key={section} value={section}>
                          {PRACTICE_SECTION_LABELS[section]}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
              </FormGrid>

              <Field label="Source">
                <Input
                  value={draft.source}
                  onChange={(input) => patch({ source: input.target.value })}
                  placeholder="e.g. Bluebook Practice Test 2 · Module 1"
                />
              </Field>

              <FormGrid cols={3}>
                <Field label="Attempted">
                  <NumberInput
                    min={1}
                    max={300}
                    value={draft.attempted}
                    onChange={(input) => patch({ attempted: input.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Correct">
                  <NumberInput
                    min={0}
                    max={300}
                    value={draft.correct}
                    onChange={(input) => patch({ correct: input.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Minutes">
                  <NumberInput
                    min={1}
                    max={480}
                    suffix="min"
                    value={draft.minutes}
                    onChange={(input) => patch({ minutes: input.target.value })}
                    placeholder="0"
                  />
                </Field>
              </FormGrid>

              <div
                className={cn(
                  'flex items-center justify-between rounded-xl border px-3.5 py-2.5',
                  accuracy === null
                    ? 'border-line bg-surface-2/30'
                    : accuracy >= 80
                      ? 'border-lime/16 bg-lime/[0.035]'
                      : accuracy >= 60
                        ? 'border-warning/16 bg-warning/[0.035]'
                        : 'border-danger/16 bg-danger/[0.035]',
                )}
              >
                <span className="text-[11px] text-muted">Accuracy from this set</span>
                <span
                  className={cn(
                    'font-mono text-[15px] font-semibold',
                    accuracy === null
                      ? 'text-faint'
                      : accuracy >= 80
                        ? 'text-lime'
                        : accuracy >= 60
                          ? 'text-warning'
                          : 'text-danger',
                  )}
                >
                  {accuracy === null ? '—' : `${accuracy}%`}
                </span>
              </div>

              <div className="rounded-xl border border-line bg-surface-2/25 p-3.5">
                <p className="mono-label">Scores</p>
                <p className="mt-1 text-[10px] leading-relaxed text-faint">
                  Fill these only for a scored section or full test. Practice question sets do not
                  need a fake score.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Total">
                    <NumberInput
                      min={400}
                      max={1600}
                      step={10}
                      value={draft.totalScore}
                      onChange={(input) => patch({ totalScore: input.target.value })}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Math">
                    <NumberInput
                      min={200}
                      max={800}
                      step={10}
                      value={draft.mathScore}
                      onChange={(input) => patch({ mathScore: input.target.value })}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Reading & Writing">
                    <NumberInput
                      min={200}
                      max={800}
                      step={10}
                      value={draft.readingWritingScore}
                      onChange={(input) =>
                        patch({ readingWritingScore: input.target.value })
                      }
                      placeholder="—"
                    />
                  </Field>
                </div>
              </div>

              <Field label="Notes" optional>
                <Textarea
                  value={draft.notes}
                  onChange={(input) => patch({ notes: input.target.value })}
                  rows={2}
                  placeholder="Timing issues, careless errors, concepts to revisit…"
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
                {record ? (
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
                  {record ? 'Save practice' : 'Log practice'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this practice record?"
        description="The linked study activity is reversed, so your history and streaks stay accurate."
        confirmLabel="Delete record"
        destructive
        loading={saving}
        onConfirm={destroy}
      />
    </>
  )
}
