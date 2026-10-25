import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { Mission, MissionType, Priority } from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  createMission,
  updateMission,
} from '@/lib/firebase/repositories/missions'
import { MISSION_TYPE_LABELS, MISSION_STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants'
import { isValidUrl, toStringArray } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
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
import { MISSION_TYPE_OPTIONS } from './study-constants'

interface MissionDraft {
  title: string
  subjectId: string
  topicId: string
  description: string
  missionType: MissionType
  estimatedMinutes: number
  difficulty: 1 | 2 | 3 | 4 | 5
  priority: Priority
  plannedDate: string
  dueDate: string
  checklist: Mission['checklist']
  linksText: string
  notes: string
}

function makeDraft(
  mission: Mission | null,
  defaultSubjectId: string,
  today: string,
): MissionDraft {
  return {
    title: mission?.title ?? '',
    subjectId: mission?.subjectId ?? defaultSubjectId,
    topicId: mission?.topicId ?? '',
    description: mission?.description ?? '',
    missionType: mission?.missionType ?? 'learn',
    estimatedMinutes: mission?.estimatedMinutes ?? 30,
    difficulty: mission?.difficulty ?? 2,
    priority: mission?.priority ?? 'medium',
    plannedDate: mission?.plannedDate ?? today,
    dueDate: mission?.dueDate ?? '',
    checklist: mission?.checklist ?? [],
    linksText: (mission?.resourceLinks ?? []).join('\n'),
    notes: mission?.notes ?? '',
  }
}

export function MissionEditor({
  open,
  onOpenChange,
  mission,
  defaultSubjectId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mission: Mission | null
  defaultSubjectId: string
  onSaved?: (id: string, subjectId: string) => void
}) {
  const { collections, settings, today, derived } = useWorkspaceData()
  const [draft, setDraft] = useState<MissionDraft>(() =>
    makeDraft(mission, defaultSubjectId, today),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(makeDraft(mission, defaultSubjectId, today))
    setError(null)
    setSaving(false)
  }, [open, mission, defaultSubjectId, today])

  const patch = (next: Partial<MissionDraft>) =>
    setDraft((current) => ({ ...current, ...next }))

  const subjects = derived?.subjects ?? collections.subjects.filter((subject) => subject.active)
  const topics = useMemo(
    () =>
      collections.topics
        .filter((topic) => topic.subjectId === draft.subjectId && !topic.archivedAt)
        .sort((a, b) => {
          const groupCompare = (a.group ?? '').localeCompare(b.group ?? '')
          if (groupCompare !== 0) return groupCompare
          return a.order - b.order
        }),
    [collections.topics, draft.subjectId],
  )
  const topicGroups = useMemo(() => {
    const groups = new Map<string, typeof topics>()
    topics.forEach((topic) => {
      const group = topic.group ?? 'Ungrouped'
      const list = groups.get(group) ?? []
      list.push(topic)
      groups.set(group, list)
    })
    return groups
  }, [topics])

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!draft.title.trim()) {
      setError('Give the mission a title.')
      return
    }
    if (!draft.subjectId) {
      setError('Choose a subject.')
      return
    }
    if (draft.plannedDate && draft.dueDate && draft.dueDate < draft.plannedDate) {
      setError('The due date cannot be before the planned date.')
      return
    }
    if (draft.estimatedMinutes < 5) {
      setError('A mission needs at least 5 minutes to be real.')
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
        subjectId: draft.subjectId,
        topicId: draft.topicId || null,
        description: draft.description,
        missionType: draft.missionType,
        estimatedMinutes: Math.max(5, Math.round(draft.estimatedMinutes)),
        difficulty: draft.difficulty,
        priority: draft.priority,
        plannedDate: draft.plannedDate || null,
        dueDate: draft.dueDate || null,
        checklist: draft.checklist.filter((item) => item.label.trim()),
        resourceLinks: links,
        notes: draft.notes,
      }
      if (mission) {
        await updateMission(mission.id, payload)
        notifySaved(
          'Mission updated',
          draft.plannedDate
            ? 'Its calendar block was kept in sync.'
            : 'No calendar block is attached.',
        )
        onSaved?.(mission.id, draft.subjectId)
      } else {
        const id = await createMission(payload)
        notifySaved(
          'Mission created',
          draft.plannedDate ? 'A study block was added to the calendar.' : 'Saved to the study queue.',
        )
        onSaved?.(id, draft.subjectId)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const atCapacityHint = (() => {
    if (!draft.plannedDate || !settings) return null
    const dayMinutes = collections.calendarEvents
      .filter(
        (event) =>
          event.dateKey === draft.plannedDate &&
          event.countsTowardCapacity &&
          event.status !== 'canceled' &&
          event.status !== 'skipped',
      )
      .reduce((sum, event) => sum + event.estimatedMinutes, 0)
    if (dayMinutes <= 0) return null
    return `The calendar already holds ${dayMinutes} planned minutes on this day.`
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          eyebrow={mission ? 'Edit mission' : 'New study mission'}
          title={mission ? 'Keep the work specific.' : 'Define one real study outcome.'}
          description="A mission is a concrete piece of work — not a vague subject to “review.” Planned dates create a real calendar block."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <Field label="Mission">
              <Input
                autoFocus
                value={draft.title}
                onChange={(input) => patch({ title: input.target.value })}
                placeholder="e.g. Complete 20 linear equation questions and log misses"
              />
            </Field>

            <FormGrid>
              <Field label="Subject">
                <Select
                  value={draft.subjectId}
                  onChange={(input) =>
                    patch({ subjectId: input.target.value, topicId: '' })
                  }
                  disabled={Boolean(mission)}
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Topic" optional>
                <Select
                  value={draft.topicId}
                  onChange={(input) => patch({ topicId: input.target.value })}
                >
                  <option value="">No topic</option>
                  {[...topicGroups.entries()].map(([group, items]) => (
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

            <FormGrid cols={3}>
              <Field label="Type">
                <Select
                  value={draft.missionType}
                  onChange={(input) =>
                    patch({ missionType: input.target.value as MissionType })
                  }
                >
                  {MISSION_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {MISSION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Planned date" optional hint="Creates a calendar block.">
                <Input
                  type="date"
                  value={draft.plannedDate}
                  onChange={(input) => patch({ plannedDate: input.target.value })}
                />
              </Field>
              <Field label="Due date" optional hint="A real deadline, if one exists.">
                <Input
                  type="date"
                  value={draft.dueDate}
                  min={draft.plannedDate || undefined}
                  onChange={(input) => patch({ dueDate: input.target.value })}
                />
              </Field>
            </FormGrid>

            <FormGrid cols={3}>
              <Field label="Estimated time">
                <NumberInput
                  min={5}
                  max={480}
                  step={5}
                  suffix="min"
                  value={draft.estimatedMinutes}
                  onChange={(input) =>
                    patch({ estimatedMinutes: Number(input.target.value) || 0 })
                  }
                />
              </Field>
              <Field label="Difficulty">
                <Select
                  value={String(draft.difficulty)}
                  onChange={(input) =>
                    patch({ difficulty: Number(input.target.value) as 1 | 2 | 3 | 4 | 5 })
                  }
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level} — {['Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][level - 1]}
                    </option>
                  ))}
                </Select>
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
            </FormGrid>

            {atCapacityHint ? (
              <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
                {atCapacityHint} The calendar will flag it if this pushes the day over capacity.
              </p>
            ) : null}

            <Field label="Description" optional>
              <Textarea
                value={draft.description}
                onChange={(input) => patch({ description: input.target.value })}
                rows={2}
                placeholder="What exactly should exist or be understood when this is done?"
                className="min-h-16"
              />
            </Field>

            <Field label="Steps" optional hint="Break it down until starting is obvious.">
              <ChecklistEditor
                items={draft.checklist}
                onChange={(checklist) => patch({ checklist })}
                placeholder="e.g. Do questions 1–10 without notes"
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Resource links" optional hint="One URL per line.">
                <Textarea
                  value={draft.linksText}
                  onChange={(input) => patch({ linksText: input.target.value })}
                  rows={2}
                  placeholder={'https://…'}
                  className="min-h-16 font-mono text-[11px]"
                />
              </Field>
              <Field label="Notes" optional>
                <Textarea
                  value={draft.notes}
                  onChange={(input) => patch({ notes: input.target.value })}
                  rows={2}
                  placeholder="What to remember before starting…"
                  className="min-h-16"
                />
              </Field>
            </div>

            {mission ? (
              <p className="rounded-lg border border-line bg-surface-2/30 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
                Current status: <span className="text-muted">{MISSION_STATUS_LABELS[mission.status]}</span>.
                Completion and reopening happen from the mission list so history stays accurate.
              </p>
            ) : null}

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
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {mission ? 'Save mission' : 'Add mission'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
