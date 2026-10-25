import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { Subject, SubjectType } from '@/types/domain'
import { updateSubject } from '@/lib/firebase/repositories/subjects'
import { upsertSettingsFields } from '@/lib/firebase/repositories/settings'
import { PRESET_SUBJECT_COLORS, SUBJECT_TYPE_LABELS } from '@/lib/constants'
import { useWorkspace } from '@/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { SubjectIcon, SUBJECT_ICON_OPTIONS } from '@/components/subject-icon'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, NumberInput, Select } from '@/components/ui/field'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

export interface SubjectEditorPatch {
  name: string
  type: SubjectType
  color: string
  icon: string
  examDate: string | null
  weeklyTarget: number
}

export function SubjectEditor({
  open,
  onOpenChange,
  subject,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: Subject
  onSaved?: (patch: SubjectEditorPatch) => void
}) {
  const { settings } = useWorkspace()
  const [name, setName] = useState(subject.name)
  const [type, setType] = useState<SubjectType>(subject.type)
  const [examDate, setExamDate] = useState(subject.examDate ?? '')
  const [weeklyTarget, setWeeklyTarget] = useState(subject.weeklyTarget)
  const [color, setColor] = useState(subject.color)
  const [icon, setIcon] = useState(subject.icon)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savedWeeklyTarget = settings?.weeklyGoals[subject.id] ?? subject.weeklyTarget

  useEffect(() => {
    if (!open) return
    setName(subject.name)
    setType(subject.type)
    setExamDate(subject.examDate ?? '')
    setWeeklyTarget(savedWeeklyTarget)
    setColor(subject.color)
    setIcon(subject.icon)
    setSaving(false)
    setError(null)
  }, [open, subject, savedWeeklyTarget])

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim()) {
      setError('The subject needs a name.')
      return
    }
    const target = Math.max(0, Math.round(weeklyTarget))
    setSaving(true)
    setError(null)
    try {
      const patch: SubjectEditorPatch = {
        name: name.trim(),
        type,
        examDate: examDate || null,
        weeklyTarget: target,
        color,
        icon,
      }
      await updateSubject(subject.id, patch)
      if (settings) {
        const savedTarget = settings.weeklyGoals[subject.id]
        if (savedTarget !== target) {
          await upsertSettingsFields({
            weeklyGoals: { ...settings.weeklyGoals, [subject.id]: target },
          })
        }
      }
      notifySaved('Subject updated', patch.name)
      onSaved?.(patch)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          eyebrow="Subject settings"
          title="Set the stakes and the pace."
          description="Weekly targets are measured in completed study activities. The exam date drives the countdown, not a fake score."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <FormGrid>
              <Field label="Subject name">
                <Input
                  value={name}
                  onChange={(input) => setName(input.target.value)}
                  placeholder="e.g. AP World History"
                  autoFocus
                />
              </Field>
              <Field label="Subject type">
                <Select
                  value={type}
                  onChange={(input) => setType(input.target.value as SubjectType)}
                >
                  {(Object.keys(SUBJECT_TYPE_LABELS) as SubjectType[]).map((option) => (
                    <option key={option} value={option}>
                      {SUBJECT_TYPE_LABELS[option]}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormGrid>

            <FormGrid>
              <Field label="Exam date" optional hint="The real test date, if it is set.">
                <Input
                  type="date"
                  value={examDate}
                  onChange={(input) => setExamDate(input.target.value)}
                />
              </Field>
              <Field label="Weekly target" hint="Completed study activities per week.">
                <NumberInput
                  min={0}
                  max={21}
                  value={weeklyTarget}
                  onChange={(input) => setWeeklyTarget(Number(input.target.value) || 0)}
                  suffix="sessions"
                />
              </Field>
            </FormGrid>

            <Field label="Icon">
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
                {SUBJECT_ICON_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIcon(option)}
                    aria-label={`Use ${option} icon`}
                    aria-pressed={icon === option}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg border transition-colors',
                      icon === option
                        ? 'border-lime/40 bg-lime/10 text-lime'
                        : 'border-line bg-surface-2/40 text-faint hover:border-line-strong hover:text-muted',
                    )}
                  >
                    <SubjectIcon icon={option} size={16} />
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Subject color">
              <div className="flex flex-wrap gap-2">
                {[...new Set([...PRESET_SUBJECT_COLORS, color])].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`Use color ${preset}`}
                    aria-pressed={color === preset}
                    className={cn(
                      'size-8 rounded-lg border-2 transition-transform',
                      color === preset
                        ? 'scale-105 border-fg'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: preset }}
                  />
                ))}
                <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2 text-[10px] text-faint">
                  <input
                    type="color"
                    value={color}
                    onChange={(input) => setColor(input.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="Custom subject color"
                  />
                  +
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/30 px-3 py-2">
                <span
                  className="flex size-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}18`, color }}
                >
                  <SubjectIcon icon={icon} size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium text-fg/90">
                    {name.trim() || 'Subject name'}
                  </p>
                  <p className="mt-0.5 text-[9.5px] text-faint">
                    {SUBJECT_TYPE_LABELS[type]} · {Math.max(0, weeklyTarget)} sessions / week
                  </p>
                </div>
              </div>
            </Field>

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] text-danger">
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
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save subject
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
