import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare2,
  Clock3,
  FolderKanban,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  InboxItem,
  WorkspaceCollections,
  WorkspaceSettings,
} from '@/types/domain'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import {
  createInboxItem,
  deleteInboxItems,
  markInboxConverted,
  updateInboxItem,
} from '@/lib/firebase/repositories/inbox'
import { createMission } from '@/lib/firebase/repositories/missions'
import { createAssignment } from '@/lib/firebase/repositories/assignments'
import { createProject } from '@/lib/firebase/repositories/projects'
import {
  dateKeyInTimeZone,
  daysBetween,
  formatDateKey,
  formatRelativeDateKey,
  startOfWeekKey,
} from '@/lib/dates'
import { PageHeader, SectionHeader, SegmentedControl } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, NumberInput, Textarea } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { notifyError, notifySaved } from '@/components/status'
import { cn, errorMessage } from '@/lib/utils'

type ConvertType = 'mission' | 'assignment' | 'project'

const CONVERT_LABELS: Record<ConvertType, string> = {
  mission: 'Study mission',
  assignment: 'Homework',
  project: 'Project',
}

const CONVERT_TONES: Record<ConvertType, 'lime' | 'info' | 'violet'> = {
  mission: 'lime',
  assignment: 'info',
  project: 'violet',
}

function convertedHref(item: InboxItem, collections: WorkspaceCollections): string {
  if (!item.convertedEntityId) return '/inbox'
  if (item.convertedEntityType === 'mission') {
    const mission = collections.missions.find(
      (entry) => entry.id === item.convertedEntityId,
    )
    return mission
      ? `/study/${encodeURIComponent(mission.subjectId)}?mission=${encodeURIComponent(mission.id)}`
      : '/study'
  }
  if (item.convertedEntityType === 'assignment') {
    return `/assignments?open=${encodeURIComponent(item.convertedEntityId)}`
  }
  if (item.convertedEntityType === 'project') {
    return `/projects/${encodeURIComponent(item.convertedEntityId)}`
  }
  return '/inbox'
}

export function InboxPage() {
  const { collections, settings, today, derived } = useWorkspaceData()
  const locale = settings?.locale ?? 'en-US'
  const timezone = settings?.timezone ?? 'UTC'
  const titleRef = useRef<HTMLInputElement | null>(null)

  const [captureTitle, setCaptureTitle] = useState('')
  const [captureNotes, setCaptureNotes] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const [editingItem, setEditingItem] = useState<InboxItem | null>(null)
  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null)
  const [convertType, setConvertType] = useState<ConvertType>('mission')
  const [deletingItem, setDeletingItem] = useState<InboxItem | null>(null)
  const [confirmClearConverted, setConfirmClearConverted] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const openItems = useMemo(
    () =>
      [...collections.inboxItems]
        .filter((item) => !item.convertedAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [collections.inboxItems],
  )
  const convertedItems = useMemo(
    () =>
      [...collections.inboxItems]
        .filter((item) => item.convertedAt)
        .sort((a, b) => (b.convertedAt?.getTime() ?? 0) - (a.convertedAt?.getTime() ?? 0)),
    [collections.inboxItems],
  )

  const weekStart = startOfWeekKey(today, settings?.weekStartsOn ?? 1)
  const capturedThisWeek = collections.inboxItems.filter((item) => {
    const capturedOn = dateKeyInTimeZone(item.createdAt, timezone)
    return capturedOn >= weekStart && capturedOn <= today
  }).length
  const oldestOpenDays =
    openItems.length === 0
      ? null
      : Math.max(
          ...openItems.map((item) =>
            daysBetween(dateKeyInTimeZone(item.createdAt, timezone), today),
          ),
        )

  const capture = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!captureTitle.trim()) {
      setCaptureError('Write the thought down before it disappears.')
      return
    }
    setCapturing(true)
    setCaptureError(null)
    try {
      await createInboxItem(captureTitle.trim(), captureNotes.trim())
      notifySaved('Captured', 'It is out of your head and into the inbox.')
      setCaptureTitle('')
      setCaptureNotes('')
      titleRef.current?.focus()
    } catch (err) {
      setCaptureError(errorMessage(err))
      notifyError(err)
    } finally {
      setCapturing(false)
    }
  }

  const remove = async (item: InboxItem) => {
    setBusyId(item.id)
    try {
      await deleteInboxItems([item.id])
      notifySaved('Inbox item deleted')
      setDeletingItem(null)
    } catch (err) {
      notifyError(err)
    } finally {
      setBusyId(null)
    }
  }

  const clearConverted = async () => {
    const ids = convertedItems.map((item) => item.id)
    if (ids.length === 0) return
    setClearing(true)
    try {
      await deleteInboxItems(ids)
      notifySaved(
        'Converted captures cleared',
        'The missions, homework, and projects they became are untouched.',
      )
      setConfirmClearConverted(false)
    } catch (err) {
      notifyError(err)
    } finally {
      setClearing(false)
    }
  }

  const openConvert = (item: InboxItem, type: ConvertType) => {
    setConvertType(type)
    setConvertingItem(item)
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Catch it before it disappears"
        title="Inbox"
        description="A capture is not a commitment. Write it down, then decide whether it becomes a mission, homework, project — or nothing."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => titleRef.current?.focus()}
          >
            <Plus className="size-3.5" />
            New capture
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <InboxStat
          icon={<Inbox className="size-3.5" />}
          label="Open captures"
          value={openItems.length}
          detail="Waiting for a decision"
          tone={openItems.length > 0 ? 'lime' : undefined}
        />
        <InboxStat
          icon={<CalendarDays className="size-3.5" />}
          label="This week"
          value={capturedThisWeek}
          detail="Captured since the week start"
        />
        <InboxStat
          icon={<CheckCircle2 className="size-3.5" />}
          label="Converted"
          value={convertedItems.length}
          detail="Turned into real work"
        />
        <InboxStat
          icon={<Clock3 className="size-3.5" />}
          label="Oldest open"
          value={
            oldestOpenDays === null
              ? '—'
              : oldestOpenDays === 0
                ? 'Today'
                : `${oldestOpenDays}d`
          }
          detail={
            oldestOpenDays !== null && oldestOpenDays >= 7
              ? 'A week old — decide or delete it'
              : 'Age of your oldest capture'
          }
          tone={oldestOpenDays !== null && oldestOpenDays >= 7 ? 'warning' : undefined}
        />
      </div>

      <form
        onSubmit={capture}
        className="overflow-hidden rounded-2xl border border-lime/15 bg-lime/[0.025]"
      >
        <div className="flex items-center gap-2 border-b border-lime/10 px-4 py-3">
          <Sparkles className="size-3.5 text-lime" />
          <p className="mono-label text-lime/80">Quick capture</p>
          <span className="ml-auto hidden font-mono text-[8.5px] uppercase tracking-[0.1em] text-faint sm:inline">
            No subject required
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
          <Field label="What is it?" error={captureError}>
            <Input
              ref={titleRef}
              value={captureTitle}
              onChange={(input) => setCaptureTitle(input.target.value)}
              placeholder="e.g. Ask Ms. Rivera about the essay rubric"
              aria-label="Inbox capture title"
            />
          </Field>
          <Field label="Context" optional>
            <Input
              value={captureNotes}
              onChange={(input) => setCaptureNotes(input.target.value)}
              placeholder="A date, a person, or the reason it matters…"
              aria-label="Inbox capture notes"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={capturing}
            className="w-full sm:w-auto"
          >
            {capturing ? null : <Plus className="size-4" />}
            Capture
          </Button>
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-surface/70">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Inbox className="size-3.5 text-lime" />
            <div>
              <h2 className="text-[13.5px] font-semibold">Open</h2>
              <p className="mt-0.5 text-[10px] text-faint">
                Oldest first. Convert it, refine it, or delete it.
              </p>
            </div>
          </div>
          <Badge tone={openItems.length > 0 ? 'lime' : 'outline'}>{openItems.length}</Badge>
        </div>

        {openItems.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Inbox zero."
            description="Nothing is waiting for a decision. Capture the next loose thought above instead of trying to hold it."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => titleRef.current?.focus()}
              >
                <Plus className="size-3.5" />
                Capture something
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {openItems.map((item) => {
              const capturedOn = dateKeyInTimeZone(item.createdAt, timezone)
              const age = daysBetween(capturedOn, today)
              return (
                <div
                  key={item.id}
                  className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-faint">
                    <Inbox className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="block w-full text-left"
                    >
                      <span className="block text-[12.5px] font-medium leading-snug text-fg">
                        {item.title}
                      </span>
                      {item.notes ? (
                        <span className="mt-1 line-clamp-2 block text-[10.5px] leading-relaxed text-muted">
                          {item.notes}
                        </span>
                      ) : null}
                    </button>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[8.5px] uppercase tracking-[0.07em] text-faint">
                      <span>{formatRelativeDateKey(capturedOn, today, locale)}</span>
                      {age >= 1 ? (
                        <span className={age >= 7 ? 'text-warning/80' : undefined}>
                          {age} {age === 1 ? 'day' : 'days'} in inbox
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      className="hidden sm:inline-flex"
                      onClick={() => openConvert(item, 'mission')}
                    >
                      <ArrowRight className="size-3" />
                      Convert
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${item.title}`}
                          className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-white/5 hover:text-fg"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel>Turn into</DropdownMenuLabel>
                        <DropdownMenuItem
                          icon={<BookOpenCheck className="size-3.5" />}
                          onSelect={() => openConvert(item, 'mission')}
                        >
                          Study mission
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          icon={<CheckSquare2 className="size-3.5" />}
                          onSelect={() => openConvert(item, 'assignment')}
                        >
                          Homework
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          icon={<FolderKanban className="size-3.5" />}
                          onSelect={() => openConvert(item, 'project')}
                        >
                          Project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          icon={<Pencil className="size-3.5" />}
                          onSelect={() => setEditingItem(item)}
                        >
                          Edit capture
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          danger
                          icon={<Trash2 className="size-3.5" />}
                          onSelect={() => setDeletingItem(item)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5">
          <p className="text-[9.5px] leading-relaxed text-faint">
            Nothing here affects your study streak or goals until it becomes real work.
          </p>
        </div>
      </section>

      {convertedItems.length > 0 ? (
        <section>
          <SectionHeader
            title="Converted"
            hint="Keep the trail, or clear the old captures"
            action={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirmClearConverted(true)}
                className="text-faint hover:text-danger"
              >
                <Trash2 className="size-3" />
                Clear converted
              </Button>
            }
          />
          <div className="overflow-hidden rounded-2xl border border-line bg-surface/60">
            <div className="divide-y divide-line">
              {convertedItems.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-teal/16 bg-teal/[0.045] text-teal">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-medium leading-snug text-fg/85">
                      {item.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[8.5px] uppercase tracking-[0.07em] text-faint">
                      {item.convertedEntityType ? (
                        <span>
                          Became {CONVERT_LABELS[item.convertedEntityType]}
                        </span>
                      ) : null}
                      {item.convertedAt ? (
                        <span>
                          {formatDateKey(
                            dateKeyInTimeZone(item.convertedAt, timezone),
                            locale,
                            { month: 'short', day: 'numeric' },
                          )}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    to={convertedHref(item, collections)}
                    className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-lime/80 transition-colors hover:text-lime"
                  >
                    Open
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              ))}
            </div>
            {convertedItems.length > 10 ? (
              <p className="border-t border-line px-4 py-2 text-[9.5px] text-faint">
                Showing 10 of {convertedItems.length} converted captures.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <EditInboxDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
      />
      <ConvertInboxDialog
        item={convertingItem}
        initialType={convertType}
        settings={settings}
        subjects={derived?.subjects ?? []}
        onClose={() => setConvertingItem(null)}
      />

      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null)
        }}
        title="Delete this capture?"
        description={
          <>
            “{deletingItem?.title ?? ''}” will be removed permanently. Nothing was created from it,
            so no other work is affected.
          </>
        }
        confirmLabel="Delete capture"
        destructive
        loading={busyId === deletingItem?.id}
        onConfirm={() => {
          if (deletingItem) return remove(deletingItem)
        }}
      />

      <ConfirmDialog
        open={confirmClearConverted}
        onOpenChange={setConfirmClearConverted}
        title={`Clear ${convertedItems.length} converted ${convertedItems.length === 1 ? 'capture' : 'captures'}?`}
        description="This only removes the inbox records. The missions, homework, and projects they became are untouched."
        confirmLabel="Clear captures"
        destructive
        loading={clearing}
        onConfirm={clearConverted}
      />
    </div>
  )
}

function InboxStat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  detail: string
  tone?: 'lime' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface/85 p-3.5 sm:p-4',
        tone === 'lime' ? 'border-lime/16' : tone === 'warning' ? 'border-warning/20' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1.5 text-faint">
        <span
          className={
            tone === 'lime' ? 'text-lime/80' : tone === 'warning' ? 'text-warning/80' : undefined
          }
        >
          {icon}
        </span>
        <p className="mono-label">{label}</p>
      </div>
      <p
        className={cn(
          'font-num mt-2.5 text-[24px] font-semibold leading-none tracking-[-0.02em]',
          tone === 'lime' && 'text-lime',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] leading-snug text-faint">{detail}</p>
    </div>
  )
}

function EditInboxDialog({
  item,
  onClose,
}: {
  item: InboxItem | null
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item) return
    setTitle(item.title)
    setNotes(item.notes)
    setSaving(false)
    setError(null)
  }, [item])

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!item) return
    if (!title.trim()) {
      setError('The capture needs a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateInboxItem(item.id, title.trim(), notes.trim())
      notifySaved('Capture updated')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader
          eyebrow="Edit capture"
          title="Sharpen the thought."
          description="A capture can stay rough. Make it specific enough that future-you knows what it meant."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <Field label="What is it?">
              <Input
                value={title}
                onChange={(input) => setTitle(input.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Context" optional>
              <Textarea
                value={notes}
                onChange={(input) => setNotes(input.target.value)}
                rows={4}
                placeholder="A date, a person, a link, or why it matters…"
                className="min-h-28"
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? null : <Save className="size-4" />}
              Save capture
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConvertInboxDialog({
  item,
  initialType,
  settings,
  subjects,
  onClose,
}: {
  item: InboxItem | null
  initialType: ConvertType
  settings: WorkspaceSettings | null
  subjects: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const [type, setType] = useState<ConvertType>(initialType)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [course, setCourse] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultMinutes = (nextType: ConvertType) => {
    if (!settings) return nextType === 'mission' ? 30 : nextType === 'assignment' ? 45 : 60
    if (nextType === 'mission') return settings.defaultDurations.mission
    if (nextType === 'assignment') return settings.defaultDurations.assignmentBlock
    return settings.defaultDurations.milestoneBlock
  }

  useEffect(() => {
    if (!item) return
    setType(initialType)
    setTitle(item.title)
    setSubjectId(subjects[0]?.id ?? 'sat')
    setCourse('')
    setDueDate('')
    setEstimatedMinutes(defaultMinutes(initialType))
    setSaving(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, initialType])

  if (!item) return null

  const changeType = (next: ConvertType) => {
    setType(next)
    setEstimatedMinutes(defaultMinutes(next))
    setError(null)
  }

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault()
    if (!title.trim()) {
      setError('The converted item needs a title.')
      return
    }
    if (type === 'mission' && !subjectId) {
      setError('Choose a subject for the mission.')
      return
    }
    if ((type === 'assignment' || type === 'project') && !course.trim()) {
      setError('Add a course so this work has a home.')
      return
    }
    if (estimatedMinutes < 5) {
      setError('Give the work at least five real minutes.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const minutes = Math.max(5, Math.round(estimatedMinutes))
      let entityId = ''
      if (type === 'mission') {
        entityId = await createMission({
          title: title.trim(),
          subjectId,
          topicId: null,
          description: item.notes,
          dueDate: dueDate || null,
          estimatedMinutes: minutes,
          missionType: 'learn',
          priority: 'medium',
        })
      } else if (type === 'assignment') {
        entityId = await createAssignment({
          title: title.trim(),
          course: course.trim(),
          description: item.notes,
          dueDate: dueDate || null,
          estimatedMinutes: minutes,
          priority: 'medium',
        })
      } else {
        entityId = await createProject({
          title: title.trim(),
          course: course.trim(),
          description: item.notes,
          dueDate: dueDate || null,
          estimatedMinutes: minutes,
          priority: 'medium',
        })
      }
      await markInboxConverted(item.id, type, entityId)
      notifySaved(
        `Converted to ${CONVERT_LABELS[type].toLowerCase()}`,
        item.title,
      )
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        <DialogHeader
          eyebrow="Make it real"
          title="Decide what this actually is."
          description="A capture is not a task. Choose the smallest real shape it can take. The original note becomes the description."
        />
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-2/35 p-3">
              <p className="mono-label">Captured</p>
              <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-fg">
                {item.title}
              </p>
              {item.notes ? (
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{item.notes}</p>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-[11.5px] font-medium text-muted">Destination</p>
              <SegmentedControl
                value={type}
                onChange={changeType}
                ariaLabel="Convert to"
                options={[
                  {
                    value: 'mission',
                    label: (
                      <>
                        <BookOpenCheck className="size-3.5" /> Mission
                      </>
                    ),
                  },
                  {
                    value: 'assignment',
                    label: (
                      <>
                        <CheckSquare2 className="size-3.5" /> Homework
                      </>
                    ),
                  },
                  {
                    value: 'project',
                    label: (
                      <>
                        <FolderKanban className="size-3.5" /> Project
                      </>
                    ),
                  },
                ]}
              />
            </div>

            <Field label="Title">
              <Input
                value={title}
                onChange={(input) => setTitle(input.target.value)}
                autoFocus
              />
            </Field>

            {type === 'mission' ? (
              <Field label="Subject" hint="Missions belong to one subject.">
                <select
                  value={subjectId}
                  onChange={(input) => setSubjectId(input.target.value)}
                  className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface-2/70 px-3 text-sm text-fg focus:border-lime/50 focus:outline-none"
                >
                  {subjects.length === 0 ? <option value="sat">SAT Preparation</option> : null}
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <FormGrid>
                <Field label="Course">
                  <Input
                    value={course}
                    onChange={(input) => setCourse(input.target.value)}
                    placeholder={type === 'assignment' ? 'e.g. AP World History' : 'e.g. English 11'}
                  />
                </Field>
                <Field label="Due date" optional hint="Leave blank if no real deadline exists.">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(input) => setDueDate(input.target.value)}
                  />
                </Field>
              </FormGrid>
            )}

            {type === 'mission' ? (
              <FormGrid>
                <Field label="Due date" optional hint="A real deadline, if one exists.">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(input) => setDueDate(input.target.value)}
                  />
                </Field>
                <Field label="Estimated time" hint="Do not use the calendar as a wish list.">
                  <NumberInput
                    min={5}
                    max={480}
                    step={5}
                    suffix="min"
                    value={estimatedMinutes}
                    onChange={(input) =>
                      setEstimatedMinutes(Number(input.target.value) || 0)
                    }
                  />
                </Field>
              </FormGrid>
            ) : (
              <Field label="Estimated time" hint="A realistic first block, not the whole life of the task.">
                <NumberInput
                  min={5}
                  max={480}
                  step={5}
                  suffix="min"
                  value={estimatedMinutes}
                  onChange={(input) =>
                    setEstimatedMinutes(Number(input.target.value) || 0)
                  }
                />
              </Field>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/25 px-3 py-2.5">
              <Badge tone={CONVERT_TONES[type]}>{CONVERT_LABELS[type]}</Badge>
              <p className="text-[10px] leading-relaxed text-faint">
                {type === 'mission'
                  ? 'It will enter the study queue unscheduled. Add a planned date later when you actually intend to do it.'
                  : type === 'assignment'
                    ? 'It will enter the homework list unscheduled. Set a target finish date once you know the real work involved.'
                    : 'It will become a project with no milestones yet. Break it into real steps when you plan it.'}
              </p>
            </div>

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[11.5px] leading-relaxed text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Keep in inbox
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Convert to {CONVERT_LABELS[type].toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
