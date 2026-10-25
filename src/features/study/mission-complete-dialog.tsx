import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { Mission } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { completeMission } from '@/lib/firebase/repositories/missions'
import { addDaysKey, formatDateKey } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, NumberInput, Textarea } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

export function MissionCompleteDialog({
  open,
  onOpenChange,
  mission,
  onCompleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mission: Mission | null
  onCompleted?: (minutes: number) => void
}) {
  const { today, settings } = useWorkspaceData()
  const locale = settings?.locale ?? 'en-US'
  const [minutes, setMinutes] = useState('')
  const [summary, setSummary] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [attempted, setAttempted] = useState('')
  const [correct, setCorrect] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMinutes('')
    setSummary(mission?.completionSummary ?? '')
    setConfidence(mission?.confidence ?? null)
    setAttempted(mission?.practiceAttempted ? String(mission.practiceAttempted) : '')
    setCorrect(mission?.practiceCorrect ? String(mission.practiceCorrect) : '')
    setReviewDate(mission?.reviewAgainDate ?? '')
    setSaving(false)
    setError(null)
  }, [open, mission])

  const isPractice = useMemo(
    () =>
      mission?.missionType === 'practice' ||
      mission?.missionType === 'mockExam' ||
      (mission?.practiceAttempted ?? 0) > 0,
    [mission],
  )

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!mission) return
    const minutesValue = minutes.trim() ? Number(minutes) : null
    if (minutesValue !== null && (!Number.isFinite(minutesValue) || minutesValue < 0)) {
      setError('Actual minutes must be zero or more.')
      return
    }
    const attemptedValue = attempted.trim() ? Number(attempted) : null
    const correctValue = correct.trim() ? Number(correct) : null
    if (
      attemptedValue !== null &&
      correctValue !== null &&
      correctValue > attemptedValue
    ) {
      setError('Correct answers cannot exceed the number attempted.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await completeMission(mission.id, {
        dateKey: today,
        actualMinutes: minutesValue,
        completionSummary: summary.trim(),
        confidence: confidence as 1 | 2 | 3 | 4 | 5 | null,
        practiceAttempted: attemptedValue,
        practiceCorrect: correctValue,
        reviewAgainDate: reviewDate || null,
      })
      notifySaved(
        'Mission complete',
        minutesValue !== null
          ? `${minutesValue} real minutes logged.`
          : 'Completion recorded without inventing a duration.',
      )
      onCompleted?.(minutesValue ?? 0)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  if (!mission) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          eyebrow="Close the loop"
          title="What did this actually produce?"
          description="Reflection is optional, but a one-line summary makes future review possible. Do not log time you did not spend."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-2/35 p-3.5">
              <p className="text-[12.5px] font-medium leading-snug text-fg">{mission.title}</p>
              <p className="mt-1 text-[10.5px] text-faint">
                {mission.estimatedMinutes} min estimated ·{' '}
                {mission.plannedDate
                  ? `planned ${formatDateKey(mission.plannedDate, locale)}`
                  : 'not on the calendar'}
              </p>
            </div>

            <FormGrid>
              <Field
                label="Actual minutes"
                optional
                hint="Leave blank if you did not track it."
              >
                <NumberInput
                  min={0}
                  max={720}
                  step={5}
                  suffix="min"
                  value={minutes}
                  onChange={(input) => setMinutes(input.target.value)}
                  placeholder="No invented time"
                />
              </Field>
              <Field label="Confidence" optional hint="How solid does this feel now?">
                <div className="flex h-10 items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() =>
                        setConfidence((current) => (current === level ? null : level))
                      }
                      aria-label={`Confidence ${level} of 5`}
                      aria-pressed={confidence === level}
                      className={cn(
                        'flex h-9 flex-1 items-center justify-center rounded-lg border font-mono text-[11px] transition-colors',
                        confidence !== null && level <= confidence
                          ? 'border-lime/30 bg-lime/12 text-lime'
                          : 'border-line bg-surface-2/60 text-faint hover:text-muted',
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </Field>
            </FormGrid>

            <Field label="What did you finish or learn?" optional>
              <Textarea
                value={summary}
                onChange={(input) => setSummary(input.target.value)}
                rows={2}
                placeholder="e.g. Finished 18/20 questions; still losing signs when distributing."
                className="min-h-16"
              />
            </Field>

            {isPractice ? (
              <FormGrid>
                <Field label="Questions attempted" optional>
                  <NumberInput
                    min={0}
                    max={300}
                    value={attempted}
                    onChange={(input) => setAttempted(input.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Questions correct" optional>
                  <NumberInput
                    min={0}
                    max={300}
                    value={correct}
                    onChange={(input) => setCorrect(input.target.value)}
                    placeholder="0"
                  />
                </Field>
              </FormGrid>
            ) : null}

            <Field
              label="Review this again"
              optional
              hint={
                confidence !== null && confidence <= 2
                  ? `Low confidence — a review on ${formatDateKey(addDaysKey(today, 3), locale)} may be worth scheduling.`
                  : 'Leaves a dated review item in your study queue.'
              }
            >
              <input
                type="date"
                value={reviewDate}
                min={today}
                onChange={(input) => setReviewDate(input.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface-2/70 px-3 text-sm text-fg focus:border-lime/50 focus:outline-none"
              />
            </Field>

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Mark complete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
