import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { SubjectType } from '@/types/domain'
import { createSubject } from '@/lib/firebase/repositories/subjects'
import { PRESET_SUBJECT_COLORS, SUBJECT_TYPE_LABELS } from '@/lib/constants'
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

export function SubjectCreateDialog({
  open,
  onOpenChange,
  nextOrder,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextOrder: number
  onCreated: (subjectId: string, weeklyTarget: number) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SubjectType>('school')
  const [examDate, setExamDate] = useState('')
  const [weeklyTarget, setWeeklyTarget] = useState(2)
  const [color, setColor] = useState<string>(PRESET_SUBJECT_COLORS[4] ?? '#64d9c4')
  const [icon, setIcon] = useState('book')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setType('school')
    setExamDate('')
    setWeeklyTarget(2)
    setColor(PRESET_SUBJECT_COLORS[4] ?? '#64d9c4')
    setIcon('book')
    setSaving(false)
    setError(null)
  }, [open])

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim()) {
      setError('Give the subject a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const target = Math.max(0, Math.round(weeklyTarget))
      const id = await createSubject(
        {
          name: name.trim(),
          type,
          color,
          icon,
          weeklyTarget: target,
          examDate: examDate || null,
        },
        nextOrder,
      )
      notifySaved('Subject added', name.trim())
      onCreated(id, target)
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
          eyebrow="New subject"
          title="Give the work a home."
          description="Subjects hold missions, topics, weekly goals, and optionally an exam date. Keep the list small enough to stay honest."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <FormGrid>
              <Field label="Subject name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. English 11"
                  autoFocus
                />
              </Field>
              <Field label="Type">
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value as SubjectType)}
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
              <Field label="Exam or final date" optional hint="Leave blank if no real date exists.">
                <Input
                  type="date"
                  value={examDate}
                  onChange={(event) => setExamDate(event.target.value)}
                />
              </Field>
              <Field label="Weekly target" hint="Completed study activities per week.">
                <NumberInput
                  min={0}
                  max={21}
                  value={weeklyTarget}
                  onChange={(event) => setWeeklyTarget(Number(event.target.value) || 0)}
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

            <Field label="Color">
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
                    onChange={(event) => setColor(event.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="Custom subject color"
                  />
                  +
                </label>
              </div>
            </Field>

            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
              <span
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}18`, color }}
              >
                <SubjectIcon icon={icon} size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-fg/90">
                  {name.trim() || 'Subject name'}
                </p>
                <p className="mt-0.5 text-[9.5px] text-faint">
                  {SUBJECT_TYPE_LABELS[type]} · {Math.max(0, weeklyTarget)} sessions / week
                </p>
              </div>
            </div>

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
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add subject
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
