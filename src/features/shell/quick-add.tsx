import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  CheckSquare2,
  FolderKanban,
  Inbox,
  LineChart,
  Loader2,
} from 'lucide-react'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { createMission } from '@/lib/firebase/repositories/missions'
import { createAssignment } from '@/lib/firebase/repositories/assignments'
import { createProject } from '@/lib/firebase/repositories/projects'
import { createInboxItem } from '@/lib/firebase/repositories/inbox'
import { createPracticeRecord } from '@/lib/firebase/repositories/practice'
import { Button } from '@/components/ui/button'
import { Field, FormGrid, Input, NumberInput, Select, Textarea } from '@/components/ui/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { notifyError } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

type QuickType = 'mission' | 'assignment' | 'project' | 'inbox' | 'practice'

const TYPES: Array<{
  value: QuickType
  label: string
  icon: typeof BookOpen
  hint: string
}> = [
  { value: 'mission', label: 'Study', icon: BookOpen, hint: 'A focused study mission' },
  { value: 'assignment', label: 'Homework', icon: CheckSquare2, hint: 'Homework with a real due date' },
  { value: 'project', label: 'Project', icon: FolderKanban, hint: 'A larger deliverable' },
  { value: 'inbox', label: 'Inbox', icon: Inbox, hint: 'Capture now, decide later' },
  { value: 'practice', label: 'SAT log', icon: LineChart, hint: 'Log practice or a mock' },
]

export function QuickAddDialog({
  open,
  onOpenChange,
  initialType = 'mission',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialType?: QuickType
}) {
  const { collections, today, derived } = useWorkspaceData()
  const [type, setType] = useState<QuickType>(initialType)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState(collections.subjects[0]?.id ?? 'sat')
  const [course, setCourse] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [planToday, setPlanToday] = useState(true)
  const [date, setDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [targetFinishDate, setTargetFinishDate] = useState('')
  const [notes, setNotes] = useState('')
  const [topicId, setTopicId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setType(initialType)
      setTitle('')
      setNotes('')
      setError(null)
      setSaving(false)
      setDate(today)
      setDueDate('')
      setTargetFinishDate('')
      setPlanToday(true)
      setMinutes(30)
      setPriority('medium')
      setSubjectId(collections.subjects[0]?.id ?? 'sat')
      setTopicId('')
      setCourse('')
    }
  }, [open, initialType, today, collections.subjects])

  const topics = derived?.subjectById
    ? collections.topics.filter(
        (topic) => topic.subjectId === subjectId && !topic.archivedAt,
      )
    : []

  const reset = () => {
    setTitle('')
    setNotes('')
    setError(null)
    setDueDate('')
    setTargetFinishDate('')
    setCourse('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setError('A title is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (type === 'mission') {
        await createMission({
          title,
          subjectId,
          topicId: topicId || null,
          description: notes,
          estimatedMinutes: minutes,
          priority,
          plannedDate: planToday ? date : null,
          dueDate: dueDate || null,
        })
        toast.success('Study mission created', {
          description: planToday ? 'Planned on your calendar.' : 'Waiting in the study queue.',
        })
      } else if (type === 'assignment') {
        await createAssignment({
          title,
          course: course.trim() || 'School',
          dueDate: dueDate || null,
          targetFinishDate: targetFinishDate || null,
          estimatedMinutes: minutes,
          priority,
          description: notes,
          status: dueDate ? 'planned' : 'inbox',
        })
        toast.success('Homework added')
      } else if (type === 'project') {
        await createProject({
          title,
          course: course.trim() || 'School',
          subjectId: subjectId || null,
          dueDate: dueDate || null,
          targetFinishDate: targetFinishDate || null,
          estimatedMinutes: minutes,
          priority,
          description: notes,
        })
        toast.success('Project created', {
          description: 'Add milestones to turn it into a plan.',
        })
      } else if (type === 'inbox') {
        await createInboxItem(title, notes)
        toast.success('Captured in inbox')
      } else {
        if (minutes <= 0) throw new Error('Practice time must be greater than zero.')
        await createPracticeRecord({
          dateKey: planToday ? date : today,
          recordType: 'questions',
          source: title,
          section: 'mixed',
          attempted: 0,
          correct: 0,
          minutes,
          notes,
        })
        toast.success('SAT practice logged')
      }
      reset()
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
      <DialogContent size="md">
        <DialogHeader
          eyebrow="Quick capture"
          title="Get it out of your head."
          description="Capture the thing now. You can add detail and schedule it later."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-5 py-2 sm:px-6">
            {TYPES.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setType(item.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                    type === item.value
                      ? 'bg-lime/12 text-lime'
                      : 'text-faint hover:bg-white/[0.04] hover:text-muted',
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <DialogBody className="space-y-4">
            <Field label={type === 'practice' ? 'What did you practice?' : 'Title'}>
              <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  type === 'mission'
                    ? 'e.g. Active recall: quadratic formulas'
                    : type === 'assignment'
                      ? 'e.g. Read chapter 12 + answer questions'
                      : type === 'project'
                        ? 'e.g. Comparative government presentation'
                        : type === 'practice'
                          ? 'e.g. Khan Academy — 20 mixed questions'
                          : 'e.g. Email teacher about rubric'
                }
              />
            </Field>

            {type === 'mission' ? (
              <>
                <FormGrid>
                  <Field label="Subject">
                    <Select
                      value={subjectId}
                      onChange={(event) => {
                        setSubjectId(event.target.value)
                        setTopicId('')
                      }}
                    >
                      {collections.subjects
                        .filter((subject) => subject.active)
                        .sort((a, b) => a.order - b.order)
                        .map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Topic" optional>
                    <Select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
                      <option value="">No specific topic</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Estimated time">
                    <NumberInput
                      min={5}
                      max={300}
                      step={5}
                      suffix="min"
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as typeof priority)
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-medium">Schedule this mission</p>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      Off means it waits in the study queue.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={planToday}
                    onChange={(event) => setPlanToday(event.target.checked)}
                    className="size-4 accent-[#c6f74a]"
                    aria-label="Schedule this mission"
                  />
                </div>
                {planToday ? (
                  <Field label="Planned date">
                    <Input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </Field>
                ) : null}
                <Field label="Hard due date" optional>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'assignment' ? (
              <>
                <Field label="Course">
                  <Input
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                    placeholder="e.g. AP Comparative Government"
                  />
                </Field>
                <FormGrid>
                  <Field label="Due date" hint="The real, unchangeable deadline.">
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Target finish" hint="When you intend to be done.">
                    <Input
                      type="date"
                      value={targetFinishDate}
                      onChange={(event) => setTargetFinishDate(event.target.value)}
                    />
                  </Field>
                </FormGrid>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Estimated time">
                    <NumberInput
                      min={0}
                      max={600}
                      step={5}
                      suffix="min"
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as typeof priority)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {type === 'project' ? (
              <>
                <FormGrid>
                  <Field label="Course">
                    <Input
                      value={course}
                      onChange={(event) => setCourse(event.target.value)}
                      placeholder="e.g. AP World History"
                    />
                  </Field>
                  <Field label="Linked subject" optional>
                    <Select
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                    >
                      <option value="">No subject</option>
                      {collections.subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label="Due date">
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Target finish">
                    <Input
                      type="date"
                      value={targetFinishDate}
                      onChange={(event) => setTargetFinishDate(event.target.value)}
                    />
                  </Field>
                </FormGrid>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Estimated total time">
                    <NumberInput
                      min={0}
                      max={3000}
                      step={15}
                      suffix="min"
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as typeof priority)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {type === 'practice' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Practice date">
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </Field>
                <Field label="Minutes">
                  <NumberInput
                    min={1}
                    max={480}
                    step={5}
                    suffix="min"
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value) || 0)}
                  />
                </Field>
              </div>
            ) : null}

            <Field label="Notes" optional>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Context, links, or the first next step…"
                className="min-h-16"
              />
            </Field>

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {type === 'mission'
                ? 'Create mission'
                : type === 'assignment'
                  ? 'Add homework'
                  : type === 'project'
                    ? 'Create project'
                    : type === 'practice'
                      ? 'Log practice'
                      : 'Save to inbox'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
