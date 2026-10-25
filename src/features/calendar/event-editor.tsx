import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2, Repeat2, Trash2 } from 'lucide-react'
import type {
  CalendarEvent,
  CalendarEventType,
  RecurrenceRule,
  Weekday,
} from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  stopRecurrenceSeries,
  updateCalendarEvent,
  updateRecurringEventFuture,
} from '@/lib/firebase/repositories/calendarEvents'
import { EVENT_TYPE_LABELS, WEEKDAY_SHORT } from '@/lib/constants'
import { timeToMinutes } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/controls'
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
import { RECURRENCE_WEEKDAYS } from './colors'

type RecurrenceMode = 'none' | 'daily' | 'weekly'

interface EventDraft {
  title: string
  eventType: CalendarEventType
  subjectId: string
  dateKey: string
  startTime: string
  endTime: string
  estimatedMinutes: number
  countsTowardCapacity: boolean
  notes: string
  recurrenceMode: RecurrenceMode
  interval: number
  weekdays: Weekday[]
  until: string
}

function makeDraft(event: CalendarEvent | null, dateKey: string, startTime: string): EventDraft {
  return {
    title: event?.title ?? '',
    eventType: event?.eventType ?? 'study',
    subjectId: event?.subjectId ?? '',
    dateKey: event?.dateKey ?? dateKey,
    startTime: event?.startTime ?? startTime,
    endTime: event?.endTime ?? '',
    estimatedMinutes: event?.estimatedMinutes ?? 60,
    countsTowardCapacity: event?.countsTowardCapacity ?? true,
    notes: event?.notes ?? '',
    recurrenceMode: event?.recurrenceRule
      ? event.recurrenceRule.frequency
      : 'none',
    interval: event?.recurrenceRule?.interval ?? 1,
    weekdays:
      event?.recurrenceRule?.weekdays && event.recurrenceRule.weekdays.length > 0
        ? event.recurrenceRule.weekdays
        : event
          ? [new Date(`${event.dateKey}T12:00:00`).getDay() as Weekday]
          : [],
    until: event?.recurrenceRule?.until ?? '',
  }
}

export function EventEditor({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultStartTime = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  defaultDate: string
  defaultStartTime?: string
}) {
  const { collections, settings, derived } = useWorkspaceData()
  const [draft, setDraft] = useState<EventDraft>(() => makeDraft(event, defaultDate, defaultStartTime))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'occurrence' | 'future'>('occurrence')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(makeDraft(event, defaultDate, defaultStartTime))
      setError(null)
      setSaving(false)
      setScope('occurrence')
    }
  }, [open, event, defaultDate, defaultStartTime])

  const recurring = Boolean(event?.seriesId)
  const series = useMemo(
    () => (event?.seriesId ? collections.recurrenceSeries.find((item) => item.id === event.seriesId) ?? null : null),
    [collections.recurrenceSeries, event?.seriesId],
  )

  const patch = (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next }))

  const toggleWeekday = (day: Weekday) =>
    patch({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((value) => value !== day)
        : [...draft.weekdays, day],
    })

  const computedMinutes = () => {
    if (draft.startTime && draft.endTime) {
      const start = timeToMinutes(draft.startTime)
      const end = timeToMinutes(draft.endTime)
      if (start !== null && end !== null && end > start) return end - start
    }
    return Math.max(1, draft.estimatedMinutes)
  }

  const recurrenceRule = (): RecurrenceRule | null => {
    if (draft.recurrenceMode === 'none') return null
    return {
      frequency: draft.recurrenceMode,
      interval: Math.max(1, Math.min(8, draft.interval)),
      weekdays:
        draft.recurrenceMode === 'weekly'
          ? draft.weekdays.length > 0
            ? draft.weekdays
            : [new Date(`${draft.dateKey}T12:00:00`).getDay() as Weekday]
          : [],
      until: draft.until || null,
    }
  }

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.title.trim()) {
      setError('Give this block a title.')
      return
    }
    if (!draft.dateKey) {
      setError('Choose a date.')
      return
    }
    if (
      draft.startTime &&
      draft.endTime &&
      (timeToMinutes(draft.endTime) ?? 0) <= (timeToMinutes(draft.startTime) ?? 0)
    ) {
      setError('End time must be after the start time.')
      return
    }
    if (draft.recurrenceMode === 'weekly' && draft.weekdays.length === 0) {
      setError('Choose at least one day for a weekly repeat.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const minutes = computedMinutes()
      if (!event) {
        await createCalendarEvent({
          title: draft.title,
          dateKey: draft.dateKey,
          startTime: draft.startTime || null,
          endTime: draft.endTime || null,
          estimatedMinutes: minutes,
          eventType: draft.eventType,
          subjectId: draft.subjectId || null,
          notes: draft.notes,
          countsTowardCapacity: draft.countsTowardCapacity,
          recurrenceRule: recurrenceRule(),
          weekStartsOn: settings?.weekStartsOn ?? 1,
          timezone: settings?.timezone,
        })
        notifySaved(
          draft.recurrenceMode === 'none' ? 'Block scheduled' : 'Recurring block scheduled',
          draft.recurrenceMode === 'weekly'
            ? 'Future occurrences are generated for the next 12 weeks.'
            : undefined,
        )
      } else {
        const patchPayload: Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>> = {
          title: draft.title.trim(),
          eventType: draft.eventType,
          subjectId: draft.subjectId || null,
          startTime: draft.startTime || null,
          endTime: draft.endTime || null,
          estimatedMinutes: minutes,
          countsTowardCapacity: draft.countsTowardCapacity,
          notes: draft.notes,
          dateKey: draft.dateKey,
        }
        if (recurring && series && scope === 'future') {
          await updateRecurringEventFuture(event, series, patchPayload, collections.calendarEvents)
        } else {
          await updateCalendarEvent(event.id, patchPayload)
        }
        notifySaved(scope === 'future' && recurring ? 'Future blocks updated' : 'Block updated')
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
    if (!event) return
    setSaving(true)
    try {
      await deleteCalendarEvent(event.id)
      notifySaved('Block deleted')
      setConfirmDelete(false)
      onOpenChange(false)
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const stopSeries = async () => {
    if (!series || !event) return
    setSaving(true)
    try {
      await stopRecurrenceSeries(series.id, event.dateKey, collections.calendarEvents)
      notifySaved('Recurrence stopped', 'This and future occurrences were canceled.')
      setConfirmStop(false)
      onOpenChange(false)
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const subjects = derived?.subjects ?? []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader
            eyebrow={event ? 'Edit block' : 'New block'}
            title={event ? 'Adjust the plan.' : 'Put a real block on the calendar.'}
            description="Time is a promise. Blocks count against a day's capacity so the plan stays honest."
          />
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogBody className="space-y-4">
              <Field label="Title">
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={(input) => patch({ title: input.target.value })}
                  placeholder="e.g. AP World — Unit 4 active recall"
                />
              </Field>

              <FormGrid>
                <Field label="Type">
                  <Select
                    value={draft.eventType}
                    onChange={(input) =>
                      patch({ eventType: input.target.value as CalendarEventType })
                    }
                  >
                    {(Object.keys(EVENT_TYPE_LABELS) as CalendarEventType[]).map((type) => (
                      <option key={type} value={type}>
                        {EVENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Subject" optional>
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
                <Field label="Date">
                  <Input
                    type="date"
                    value={draft.dateKey}
                    onChange={(input) => patch({ dateKey: input.target.value })}
                  />
                </Field>
                <Field label="Start" optional>
                  <Input
                    type="time"
                    value={draft.startTime}
                    onChange={(input) => patch({ startTime: input.target.value })}
                  />
                </Field>
                <Field label="End" optional>
                  <Input
                    type="time"
                    value={draft.endTime}
                    onChange={(input) => patch({ endTime: input.target.value })}
                  />
                </Field>
              </FormGrid>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Duration"
                  hint={
                    draft.startTime && draft.endTime
                      ? 'Calculated from your start and end times.'
                      : 'Used to reserve capacity on the day.'
                  }
                >
                  <NumberInput
                    min={5}
                    max={720}
                    step={5}
                    suffix="min"
                    value={computedMinutes()}
                    disabled={Boolean(draft.startTime && draft.endTime)}
                    onChange={(input) =>
                      patch({ estimatedMinutes: Number(input.target.value) || 0 })
                    }
                  />
                </Field>
                <div className="flex flex-col justify-end">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
                    <Checkbox
                      checked={draft.countsTowardCapacity}
                      onCheckedChange={(checked) => patch({ countsTowardCapacity: checked })}
                      label="Count toward daily capacity"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[11.5px] font-medium text-fg">
                        Counts toward capacity
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-faint">
                        Turn off for school hours or fixed commitments you do not plan yourself.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {recurring ? (
                <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info" dot>
                      Recurring
                    </Badge>
                    <span className="text-[11px] text-muted">
                      This block is part of a series.
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      { value: 'occurrence' as const, label: 'This occurrence' },
                      { value: 'future' as const, label: 'This + future' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setScope(option.value)}
                        className={cn(
                          'h-7 rounded-md border px-2.5 text-[10.5px] font-medium transition-colors',
                          scope === option.value
                            ? 'border-lime/30 bg-lime/10 text-lime'
                            : 'border-line text-faint hover:text-muted',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setConfirmStop(true)}
                      className="ml-auto h-7 rounded-md px-2 text-[10.5px] font-medium text-danger/85 hover:bg-danger/10"
                    >
                      Stop repeating
                    </button>
                  </div>
                  <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
                    “This + future” updates untouched upcoming occurrences. Moving a single
                    occurrence detaches just that day. Completed history is never rewritten.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[11.5px] font-medium text-fg">
                      <Repeat2 className="size-3.5 text-faint" />
                      Repeat this block
                    </span>
                    <Select
                      value={draft.recurrenceMode}
                      onChange={(input) =>
                        patch({ recurrenceMode: input.target.value as RecurrenceMode })
                      }
                      className="h-8 w-36 text-[11.5px]"
                    >
                      <option value="none">Does not repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </Select>
                  </label>
                  {draft.recurrenceMode !== 'none' ? (
                    <div className="mt-3.5 space-y-3 border-t border-line pt-3.5">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Repeat every">
                          <NumberInput
                            min={1}
                            max={8}
                            value={draft.interval}
                            onChange={(input) =>
                              patch({ interval: Number(input.target.value) || 1 })
                            }
                            suffix={draft.recurrenceMode === 'daily' ? 'days' : 'weeks'}
                          />
                        </Field>
                        <Field label="Stop repeating" optional>
                          <Input
                            type="date"
                            value={draft.until}
                            min={draft.dateKey}
                            onChange={(input) => patch({ until: input.target.value })}
                          />
                        </Field>
                      </div>
                      {draft.recurrenceMode === 'weekly' ? (
                        <Field label="On these days">
                          <div className="flex gap-1">
                            {RECURRENCE_WEEKDAYS.map((day) => {
                              const active = draft.weekdays.includes(day)
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleWeekday(day)}
                                  aria-pressed={active}
                                  className={cn(
                                    'h-8 flex-1 rounded-md border text-[10px] font-mono uppercase transition-colors',
                                    active
                                      ? 'border-lime/30 bg-lime/10 text-lime'
                                      : 'border-line text-faint hover:text-muted',
                                  )}
                                >
                                  {WEEKDAY_SHORT[day].slice(0, 2)}
                                </button>
                              )
                            })}
                          </div>
                        </Field>
                      ) : null}
                      <p className="text-[10px] leading-relaxed text-faint">
                        Occurrences are generated 12 weeks ahead and extended automatically as you
                        use the app.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              <Field label="Notes" optional>
                <Textarea
                  value={draft.notes}
                  onChange={(input) => patch({ notes: input.target.value })}
                  rows={2}
                  placeholder="What exactly happens in this block?"
                  className="min-h-16"
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
                {event ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
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
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
                  {event ? 'Save block' : 'Schedule block'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this block?"
        description={
          recurring
            ? 'This removes only this occurrence. The recurring series stays in place for other days.'
            : 'This removes the block from the calendar. Completed study history is not deleted.'
        }
        confirmLabel="Delete block"
        destructive
        loading={saving}
        onConfirm={destroy}
      />
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="Stop this recurring series?"
        description="This and all untouched future occurrences will be canceled. Past and completed occurrences remain."
        confirmLabel="Stop repeating"
        destructive
        loading={saving}
        onConfirm={stopSeries}
      />
    </>
  )
}
