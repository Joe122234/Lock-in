import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Gauge,
  GraduationCap,
  HardDriveDownload,
  LockKeyhole,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import type {
  CalendarView,
  DateKey,
  StreakQualification,
  Subject,
  Topic,
  Weekday,
  WorkspaceCollections,
  WorkspaceSettings,
} from '@/types/domain'
import type { SyncSnapshot } from '@/lib/firebase/sync'
import { useWorkspaceData } from '@/hooks/use-workspace-data'
import { saveWorkspaceSettings } from '@/lib/firebase/repositories/settings'
import {
  archiveSubject,
  reorderSubjects,
  restoreSubject,
} from '@/lib/firebase/repositories/subjects'
import {
  BACKUP_APP,
  BACKUP_VERSION,
  downloadBackupJson,
  importBackup,
  resetWorkspace,
  validateBackupPayload,
  type BackupValidationResult,
} from '@/lib/backup'
import { firebaseProjectId } from '@/lib/firebase/client'
import { WORKSPACE_ID } from '@/lib/firebase/paths'
import {
  CALENDAR_VIEW_LABELS,
  SUBJECT_TYPE_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
} from '@/lib/constants'
import {
  daysBetween,
  formatDateKey,
  formatDuration,
  getSupportedTimezones,
  getWeekday,
  isValidLocalTime,
  startOfWeekKey,
  weekDateKeys,
} from '@/lib/dates'
import { plannedCapacityForDay } from '@/lib/scheduler/planner'
import { PageHeader, SegmentedControl, Stat } from '@/components/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Progress, Switch } from '@/components/ui/controls'
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Field, FormGrid, Input, NumberInput, Select } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { SubjectIcon } from '@/components/subject-icon'
import { notifyError, notifySaved } from '@/components/status'
import { SubjectEditor } from '@/features/study/subject-editor'
import { SubjectCreateDialog } from './subject-create-dialog'
import { cn, errorMessage } from '@/lib/utils'

type SettingsTab = 'general' | 'rhythm' | 'subjects' | 'calendar' | 'data'

const TAB_OPTIONS: Array<{ value: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { value: 'general', label: 'General', icon: Sparkles },
  { value: 'rhythm', label: 'Rhythm', icon: Gauge },
  { value: 'subjects', label: 'Subjects', icon: GraduationCap },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'data', label: 'Data', icon: Database },
]

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

const WEEK_START_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 0, label: 'Sunday' },
  { value: 6, label: 'Saturday' },
]

const LOCALE_OPTIONS = [
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-CA', 'English (Canada)'],
  ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)'],
  ['es-ES', 'Spanish (Spain)'],
  ['fr-FR', 'French (France)'],
  ['de-DE', 'German (Germany)'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['ja-JP', 'Japanese (Japan)'],
  ['ko-KR', 'Korean (South Korea)'],
  ['zh-CN', 'Chinese (Simplified)'],
  ['ar-EG', 'Arabic (Egypt)'],
  ['hi-IN', 'Hindi (India)'],
] as const

const STREAK_QUALIFICATION_OPTIONS: Array<{
  value: StreakQualification
  label: string
}> = [
  { value: 'meaningful', label: 'Any meaningful work' },
  { value: 'minutes', label: 'A minimum time' },
  { value: 'completions', label: 'A number of completions' },
]

const COLLECTION_LABELS: Array<{
  key: keyof WorkspaceCollections
  label: string
}> = [
  { key: 'subjects', label: 'Subjects' },
  { key: 'topics', label: 'Topics' },
  { key: 'missions', label: 'Missions' },
  { key: 'assignments', label: 'Homework' },
  { key: 'projects', label: 'Projects' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'calendarEvents', label: 'Calendar blocks' },
  { key: 'recurrenceSeries', label: 'Recurring series' },
  { key: 'activityEvents', label: 'Activity history' },
  { key: 'checkIns', label: 'Daily check-ins' },
  { key: 'weeklyReviews', label: 'Weekly reviews' },
  { key: 'practiceRecords', label: 'SAT practice' },
  { key: 'mistakes', label: 'Mistake journal' },
  { key: 'inboxItems', label: 'Inbox items' },
  { key: 'achievements', label: 'Achievements' },
]

const EDITABLE_KEYS = [
  'workspaceName',
  'timezone',
  'locale',
  'weekStartsOn',
  'targetSatDate',
  'preferredStudyDays',
  'unavailableDays',
  'weekdayCapacityMinutes',
  'weekendCapacityMinutes',
  'lighterDay',
  'weeklyRestDay',
  'weekendMode',
  'weeklyGoals',
  'defaultDurations',
  'calendar',
  'streakRules',
  'reminders',
] as const satisfies ReadonlyArray<keyof WorkspaceSettings>

function cloneSettings(settings: WorkspaceSettings): WorkspaceSettings {
  return {
    ...settings,
    preferredStudyDays: [...settings.preferredStudyDays],
    unavailableDays: [...settings.unavailableDays],
    weeklyGoals: { ...settings.weeklyGoals },
    defaultDurations: { ...settings.defaultDurations },
    calendar: { ...settings.calendar },
    streakRules: { ...settings.streakRules },
    reminders: { ...settings.reminders },
  }
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          stableValue((value as Record<string, unknown>)[key]),
        ]),
    )
  }
  return value
}

function editableSignature(settings: WorkspaceSettings): string {
  const subset: Partial<Record<(typeof EDITABLE_KEYS)[number], unknown>> = {}
  for (const key of EDITABLE_KEYS) subset[key] = settings[key]
  return JSON.stringify(stableValue(subset))
}

function validateDraft(draft: WorkspaceSettings): string[] {
  const errors: string[] = []
  if (!draft.workspaceName.trim()) errors.push('Workspace name cannot be empty.')
  if (!draft.timezone.trim()) errors.push('Choose a timezone.')
  if (!draft.locale.trim()) errors.push('Choose a locale.')
  if (draft.preferredStudyDays.length === 0) {
    errors.push('Choose at least one preferred study day.')
  }
  if (draft.weekdayCapacityMinutes < 0 || draft.weekdayCapacityMinutes > 1440) {
    errors.push('Weekday capacity must be between 0 and 1,440 minutes.')
  }
  if (draft.weekendCapacityMinutes < 0 || draft.weekendCapacityMinutes > 1440) {
    errors.push('Weekend capacity must be between 0 and 1,440 minutes.')
  }
  if (draft.reminders.dueSoonDays < 1 || draft.reminders.dueSoonDays > 90) {
    errors.push('The due-soon horizon must be between 1 and 90 days.')
  }
  if (!isValidLocalTime(draft.reminders.dailyNudgeTime)) {
    errors.push('The daily nudge time must use a valid 24-hour time.')
  }
  for (const [subjectId, target] of Object.entries(draft.weeklyGoals)) {
    if (!Number.isFinite(target) || target < 0 || target > 21 || !Number.isInteger(target)) {
      errors.push(`Weekly target for ${subjectId} must be a whole number from 0 to 21.`)
    }
  }
  for (const [key, value] of Object.entries(draft.defaultDurations)) {
    if (!Number.isFinite(value) || value < 5 || value > 480) {
      errors.push(`Default duration "${key}" must be between 5 and 480 minutes.`)
    }
  }
  return errors
}

function firestoreRules(workspaceId: string): string {
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /workspaces/${workspaceId}/{document=**} {
      allow read, write: if true;
    }
  }
}`
}

function settingsTabFromParam(value: string | null): SettingsTab {
  return value === 'rhythm' ||
    value === 'subjects' ||
    value === 'calendar' ||
    value === 'data'
    ? value
    : 'general'
}

export function SettingsPage() {
  const workspace = useWorkspaceData()
  const { settings, collections, today, sync, reload } = workspace
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [draft, setDraft] = useState<WorkspaceSettings | null>(() =>
    settings ? cloneSettings(settings) : null,
  )
  const draftRef = useRef<WorkspaceSettings | null>(draft)
  const baselineRef = useRef<string>(settings ? editableSignature(settings) : '')
  const remoteSignatureRef = useRef<string>(settings ? editableSignature(settings) : '')
  const savingRef = useRef(false)
  const initializedRef = useRef(Boolean(settings))
  const [baselineSignature, setBaselineSignature] = useState<string>(() =>
    settings ? editableSignature(settings) : '',
  )
  const [remoteChanged, setRemoteChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [creatingSubject, setCreatingSubject] = useState(false)
  const [archivingSubject, setArchivingSubject] = useState<Subject | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null)
  const [reorderBusy, setReorderBusy] = useState(false)
  const [tab, setTab] = useState<SettingsTab>(() =>
    settingsTabFromParam(searchParams.get('tab')),
  )

  useEffect(() => {
    const requested = settingsTabFromParam(searchParams.get('tab'))
    setTab((current) => (current === requested ? current : requested))
  }, [searchParams])

  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const timeout = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(timeout)
  }, [location.hash, tab])

  const changeTab = (value: string) => {
    const next = settingsTabFromParam(value)
    setTab(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'general') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  useEffect(() => {
    if (!settings) return
    const incoming = cloneSettings(settings)
    const incomingSignature = editableSignature(incoming)
    remoteSignatureRef.current = incomingSignature
    if (!initializedRef.current || !draftRef.current) {
      initializedRef.current = true
      draftRef.current = incoming
      baselineRef.current = incomingSignature
      setBaselineSignature(incomingSignature)
      setDraft(incoming)
      setRemoteChanged(false)
      return
    }
    // A settings write triggered by this page (for example, editing a
    // subject's weekly target) can land while the local draft already has the
    // same value. Do not report that as an external conflict.
    if (savingRef.current) return
    const draftSignature = editableSignature(draftRef.current)
    if (draftSignature === baselineRef.current) {
      draftRef.current = incoming
      baselineRef.current = incomingSignature
      setBaselineSignature(incomingSignature)
      setDraft(incoming)
      setRemoteChanged(false)
      return
    }
    if (incomingSignature === draftSignature) {
      baselineRef.current = incomingSignature
      setBaselineSignature(incomingSignature)
      setRemoteChanged(false)
      return
    }
    if (incomingSignature !== baselineRef.current) {
      setRemoteChanged(true)
    }
  }, [settings])

  const patchDraft = (patch: Partial<WorkspaceSettings>) => {
    const current = draftRef.current
    if (!current) return
    const next = { ...current, ...patch }
    draftRef.current = next
    setDraft(next)
    setSaveError(null)
    const nextSignature = editableSignature(next)
    if (nextSignature === remoteSignatureRef.current) {
      baselineRef.current = nextSignature
      setBaselineSignature(nextSignature)
      setRemoteChanged(false)
    }
  }

  const isDirty = draft ? editableSignature(draft) !== baselineSignature : false

  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const errors = useMemo(() => (draft ? validateDraft(draft) : []), [draft])

  const previewWeek = useMemo(
    () => weekDateKeys(startOfWeekKey(today, 1)),
    [today],
  )

  const capacityPreview = useMemo(() => {
    if (!draft) return []
    return previewWeek.map((dateKey) => ({
      dateKey,
      weekday: getWeekday(dateKey),
      capacity: plannedCapacityForDay(dateKey, draft, 'normal'),
    }))
  }, [draft, previewWeek])

  const weeklyCeiling = capacityPreview.reduce(
    (sum, item) => sum + item.capacity.plannedCapacityMinutes,
    0,
  )
  const weeklyBase = capacityPreview.reduce(
    (sum, item) =>
      item.capacity.isRest || item.capacity.isUnavailable
        ? sum
        : sum + item.capacity.baseCapacityMinutes,
    0,
  )

  const activeSubjects = useMemo(
    () =>
      collections.subjects
        .filter((subject) => subject.active && !subject.archivedAt)
        .sort((a, b) => a.order - b.order),
    [collections.subjects],
  )
  const archivedSubjects = useMemo(
    () =>
      collections.subjects
        .filter((subject) => !subject.active || subject.archivedAt)
        .sort((a, b) => a.order - b.order),
    [collections.subjects],
  )
  const activeGoalTotal = activeSubjects.reduce(
    (sum, subject) => sum + (draft?.weeklyGoals[subject.id] ?? subject.weeklyTarget ?? 0),
    0,
  )

  const discardDraft = () => {
    if (!settings) return
    const incoming = cloneSettings(settings)
    draftRef.current = incoming
    const signature = editableSignature(incoming)
    baselineRef.current = signature
    setBaselineSignature(signature)
    setDraft(incoming)
    setRemoteChanged(false)
    setSaveError(null)
  }

  const save = async () => {
    if (!draft) return
    if (errors.length > 0) {
      setSaveError(errors[0] ?? 'Fix the settings before saving.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const next: WorkspaceSettings = {
        ...draft,
        workspaceName: draft.workspaceName.trim() || 'LOCK IN',
        reminders: { ...draft.reminders, browserNotifications: false },
      }
      await saveWorkspaceSettings(next, collections.subjects)
      draftRef.current = next
      const signature = editableSignature(next)
      baselineRef.current = signature
      setBaselineSignature(signature)
      setDraft(next)
      setRemoteChanged(false)
      notifySaved(
        'Settings saved',
        'Capacity, goals, streak rules, and preferences are live.',
      )
    } catch (err) {
      setSaveError(errorMessage(err))
      notifyError(err)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const moveSubject = async (subject: Subject, direction: -1 | 1) => {
    const index = activeSubjects.findIndex((item) => item.id === subject.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= activeSubjects.length) return
    const next = [...activeSubjects]
    const [moved] = next.splice(index, 1)
    if (!moved) return
    next.splice(target, 0, moved)
    setReorderBusy(true)
    try {
      await reorderSubjects(next.map((item) => item.id))
    } catch (err) {
      notifyError(err)
    } finally {
      setReorderBusy(false)
    }
  }

  const confirmArchive = async () => {
    if (!archivingSubject) return
    setArchiveBusy(true)
    try {
      await archiveSubject(archivingSubject.id)
      notifySaved(
        'Subject archived',
        'Its missions, topics, and history remain intact.',
      )
      setArchivingSubject(null)
    } catch (err) {
      notifyError(err)
    } finally {
      setArchiveBusy(false)
    }
  }

  const restore = async (subject: Subject) => {
    setRestoreBusyId(subject.id)
    try {
      await restoreSubject(subject.id)
      notifySaved('Subject restored', subject.name)
    } catch (err) {
      notifyError(err)
    } finally {
      setRestoreBusyId(null)
    }
  }

  if (!settings || !draft) return null

  const subjectCount = activeSubjects.length
  const lastSaved = settings.updatedAt

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="System controls"
        title="Settings"
        description="Change the plan when life changes. These controls shape future work — they never rewrite the record of what already happened."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={isDirty ? 'warning' : 'success'}>
              {isDirty ? 'Unsaved edits' : 'All changes saved'}
            </Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              loading={saving}
              disabled={!isDirty}
            >
              {!saving ? <Save className="size-3.5" /> : null}
              Save changes
            </Button>
          </div>
        }
      />

      {isDirty ? (
        <div className="sticky top-[3.75rem] z-20 flex flex-wrap items-center gap-3 rounded-xl border border-lime/20 bg-[#101510]/95 px-3.5 py-2.5 shadow-panel backdrop-blur-md">
          <span className="flex items-center gap-2 text-[11.5px] font-medium text-fg">
            <span className="size-1.5 rounded-full bg-lime pulse-dot" />
            {remoteChanged
              ? 'Workspace changed elsewhere. Your edits are still here.'
              : 'Unsaved settings'}
          </span>
          {errors.length > 0 ? (
            <span className="text-[10.5px] text-warning">
              {errors.length} {errors.length === 1 ? 'issue needs' : 'issues need'} attention
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              <RotateCcw className="size-3.5" />
              {remoteChanged ? 'Load latest' : 'Discard'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              loading={saving}
              disabled={errors.length > 0}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {saveError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/[0.055] px-3.5 py-3">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />
          <div>
            <p className="text-[11.5px] font-medium text-danger">Not saved</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-danger/80">{saveError}</p>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList ariaLabel="Settings sections" className="max-w-2xl">
          {TAB_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <TabsTrigger
                key={option.value}
                value={option.value}
                count={option.value === 'subjects' ? subjectCount : undefined}
              >
                <Icon className="size-3.5" />
                {option.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab
            draft={draft}
            patch={patchDraft}
            collections={collections}
            today={today}
            locale={draft.locale}
            weeklyCeiling={weeklyCeiling}
            lastSaved={lastSaved}
            onOpenData={() => changeTab('data')}
          />
        </TabsContent>

        <TabsContent value="rhythm" className="mt-4">
          <RhythmTab
            draft={draft}
            patch={patchDraft}
            capacityPreview={capacityPreview}
            weeklyCeiling={weeklyCeiling}
            weeklyBase={weeklyBase}
          />
        </TabsContent>

        <TabsContent value="subjects" className="mt-4">
          <SubjectsTab
            draft={draft}
            patch={patchDraft}
            activeSubjects={activeSubjects}
            archivedSubjects={archivedSubjects}
            topics={collections.topics}
            activeGoalTotal={activeGoalTotal}
            goals={workspace.derived?.goals ?? []}
            reorderBusy={reorderBusy}
            restoreBusyId={restoreBusyId}
            onAdd={() => setCreatingSubject(true)}
            onEdit={setEditingSubject}
            onArchive={setArchivingSubject}
            onRestore={(subject) => void restore(subject)}
            onMove={(subject, direction) => void moveSubject(subject, direction)}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarTab draft={draft} patch={patchDraft} />
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <DataTab
            settings={settings}
            collections={collections}
            sync={sync}
            onReload={reload}
          />
        </TabsContent>
      </Tabs>

      <SubjectCreateDialog
        open={creatingSubject}
        onOpenChange={setCreatingSubject}
        nextOrder={collections.subjects.length}
        onCreated={(subjectId, weeklyTarget) => {
          patchDraft({
            weeklyGoals: { ...draft.weeklyGoals, [subjectId]: weeklyTarget },
          })
        }}
      />

      {editingSubject ? (
        <SubjectEditor
          open
          onOpenChange={(open) => {
            if (!open) setEditingSubject(null)
          }}
          subject={editingSubject}
          onSaved={(saved) => {
            patchDraft({
              weeklyGoals: { ...draft.weeklyGoals, [editingSubject.id]: saved.weeklyTarget },
            })
            setEditingSubject(null)
          }}
        />
      ) : null}

      <ConfirmDialog
        open={archivingSubject !== null}
        onOpenChange={(open) => {
          if (!open) setArchivingSubject(null)
        }}
        title={`Archive ${archivingSubject?.name ?? 'this subject'}?`}
        description={
          <>
            It disappears from study screens and goal cards, but every mission, topic, practice
            record, and activity event stays in Firestore. You can restore it at any time.
          </>
        }
        confirmLabel="Archive subject"
        destructive
        loading={archiveBusy}
        onConfirm={confirmArchive}
      />
    </div>
  )
}

function GeneralTab({
  draft,
  patch,
  collections,
  today,
  locale,
  weeklyCeiling,
  lastSaved,
  onOpenData,
}: {
  draft: WorkspaceSettings
  patch: (patch: Partial<WorkspaceSettings>) => void
  collections: WorkspaceCollections
  today: DateKey
  locale: string
  weeklyCeiling: number
  lastSaved: Date
  onOpenData: () => void
}) {
  const [timezones] = useState(() => getSupportedTimezones())
  const [now] = useState(() => new Date())
  const timezoneOptions = useMemo(() => {
    const values = new Set(timezones)
    if (draft.timezone) values.add(draft.timezone)
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [timezones, draft.timezone])

  const documentCount = Object.values(collections).reduce(
    (sum, items) => sum + items.length,
    0,
  )
  const satDays = draft.targetSatDate
    ? daysBetween(today, draft.targetSatDate)
    : null

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <SettingsCard
          icon={<Sparkles className="size-4" />}
          title="Workspace identity"
          description="The label and conventions used across the app. Timezone and week start affect how dates are grouped."
        >
          <FormGrid>
            <Field label="Workspace name">
              <Input
                value={draft.workspaceName}
                onChange={(event) => patch({ workspaceName: event.target.value })}
                placeholder="e.g. Spring semester"
              />
            </Field>
            <Field
              label="Week starts on"
              hint="Weekly goals, reviews, and calendar weeks follow this."
            >
              <Select
                value={String(draft.weekStartsOn)}
                onChange={(event) =>
                  patch({ weekStartsOn: Number(event.target.value) as Weekday })
                }
              >
                {WEEK_START_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Timezone"
              hint="“Today” and date-only values resolve in this timezone."
            >
              <Select
                value={draft.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              >
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Locale" hint="Used for date and number formatting only.">
              <Select
                value={draft.locale}
                onChange={(event) => patch({ locale: event.target.value })}
              >
                {LOCALE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {!LOCALE_OPTIONS.some(([value]) => value === draft.locale) ? (
                  <option value={draft.locale}>{draft.locale}</option>
                ) : null}
              </Select>
            </Field>
          </FormGrid>
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
            <Clock3 className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <p className="text-[10.5px] leading-relaxed text-faint">
              It is currently{' '}
              <span className="text-muted">
                {new Intl.DateTimeFormat(locale, {
                  timeZone: draft.timezone,
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(now)}
              </span>{' '}
              in {draft.timezone.replaceAll('_', ' ')}. Timezone changes can move the current day,
              so check scheduled work after saving.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          id="dates"
          icon={<Target className="size-4" />}
          title="Key dates"
          description="A real date beats a vague intention. The SAT date drives the countdown on Today and Study."
        >
          <FormGrid>
            <Field
              label="Official SAT date"
              optional
              hint="Leave blank until the date is registered."
            >
              <Input
                type="date"
                value={draft.targetSatDate ?? ''}
                onChange={(event) =>
                  patch({ targetSatDate: event.target.value || null })
                }
              />
            </Field>
            <div className="flex min-h-10 items-center rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
              {draft.targetSatDate ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <div>
                    <p className="text-[11.5px] font-medium text-fg/90">
                      {satDays !== null && satDays >= 0
                        ? `${satDays} ${satDays === 1 ? 'day' : 'days'} out`
                        : 'This date has passed'}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                      {formatDateKey(draft.targetSatDate, locale, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  {satDays !== null && satDays >= 0 ? (
                    <Badge tone="lime">{satDays}d</Badge>
                  ) : (
                    <Badge tone="warning">Passed</Badge>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-faint">
                  No SAT date set. Study can still run without a countdown.
                </p>
              )}
            </div>
          </FormGrid>
          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Subject exam dates live under Subjects. Both are stored as plain calendar dates, not
            fabricated countdowns.
          </p>
        </SettingsCard>

        <SettingsCard
          icon={<LockKeyhole className="size-4" />}
          title="Access model"
          description="This is a private, single-person workspace with no login."
        >
          <div className="rounded-xl border border-warning/20 bg-warning/[0.045] px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-[11.5px] font-medium text-warning">
                  Private by URL is not real security.
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-warning/75">
                  Anyone with your Firebase project config and workspace id could read or edit the
                  data if the rules allow it. Keep the project unshared. If that stops being enough,
                  add authentication and tighten the rules.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface-2/30 px-3 py-2.5">
              <p className="mono-label">Workspace id</p>
              <p className="mt-1.5 break-all font-mono text-[10.5px] text-muted">
                {WORKSPACE_ID}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2/30 px-3 py-2.5">
              <p className="mono-label">Storage</p>
              <p className="mt-1.5 text-[10.5px] text-muted">
                Cloud Firestore · persistent browser cache
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenData}
            className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-lime/80 transition-colors hover:text-lime"
          >
            Open security rules and data tools
            <ChevronRight className="size-3" />
          </button>
        </SettingsCard>
      </div>

      <aside className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Subjects"
            value={collections.subjects.filter((subject) => subject.active).length}
            detail="Active areas"
            icon={<GraduationCap className="size-3.5" />}
          />
          <Stat
            label="Weekly ceiling"
            value={formatDuration(weeklyCeiling)}
            detail="Normal mode"
            icon={<Gauge className="size-3.5" />}
            tone="lime"
          />
          <Stat
            label="Documents"
            value={documentCount}
            detail="In this workspace"
            icon={<Database className="size-3.5" />}
          />
          <Stat
            label="Open work"
            value={
              collections.assignments.filter(
                (item) =>
                  !item.archivedAt &&
                  item.status !== 'completed' &&
                  item.status !== 'submitted',
              ).length +
              collections.missions.filter(
                (item) =>
                  !item.archivedAt &&
                  item.status !== 'completed' &&
                  item.status !== 'skipped',
              ).length
            }
            detail="Missions + homework"
            icon={<BookOpen className="size-3.5" />}
          />
        </div>

        <SettingsCard
          icon={<Cloud className="size-4" />}
          title="Workspace status"
          description="Live from Firestore"
        >
          <div className="space-y-2.5 text-[10.5px]">
            <FactRow
              label="Last settings save"
              value={lastSaved.toLocaleString(locale, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            />
            <FactRow label="Created" value={draft.createdAt.toLocaleDateString(locale)} />
            <FactRow label="Seed version" value={String(draft.seedVersion)} />
            <FactRow label="Schema" value={`v${draft.schemaVersion}`} />
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2/25 px-2.5 py-2">
            <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-teal" />
            <p className="text-[9.5px] leading-relaxed text-faint">
              Settings are stored as one workspace document. Subject targets are kept in sync when
              you save.
            </p>
          </div>
        </SettingsCard>

        <div className="rounded-2xl border border-line bg-surface/50 p-4">
          <p className="mono-label">Keep the record honest</p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            Lowering a goal does not remove completed work. Changing capacity does not rewrite past
            days. The plan can change; the history stays fixed.
          </p>
        </div>
      </aside>
    </div>
  )
}

function RhythmTab({
  draft,
  patch,
  capacityPreview,
  weeklyCeiling,
  weeklyBase,
}: {
  draft: WorkspaceSettings
  patch: (patch: Partial<WorkspaceSettings>) => void
  capacityPreview: Array<{
    dateKey: DateKey
    weekday: Weekday
    capacity: ReturnType<typeof plannedCapacityForDay>
  }>
  weeklyCeiling: number
  weeklyBase: number
}) {
  const togglePreferred = (day: Weekday) => {
    const preferred = draft.preferredStudyDays.includes(day)
    patch({
      preferredStudyDays: preferred
        ? draft.preferredStudyDays.filter((item) => item !== day)
        : [...draft.preferredStudyDays, day].sort((a, b) => a - b),
      unavailableDays: preferred
        ? draft.unavailableDays
        : draft.unavailableDays.filter((item) => item !== day),
    })
  }

  const toggleUnavailable = (day: Weekday) => {
    const unavailable = draft.unavailableDays.includes(day)
    patch({
      unavailableDays: unavailable
        ? draft.unavailableDays.filter((item) => item !== day)
        : [...draft.unavailableDays, day].sort((a, b) => a - b),
      preferredStudyDays: unavailable
        ? draft.preferredStudyDays
        : draft.preferredStudyDays.filter((item) => item !== day),
      weeklyRestDay: !unavailable && draft.weeklyRestDay === day ? null : draft.weeklyRestDay,
      lighterDay: !unavailable && draft.lighterDay === day ? null : draft.lighterDay,
    })
  }

  const streakSummary =
    draft.streakRules.qualification === 'minutes'
      ? `A day counts for study after ${draft.streakRules.minimumMinutes} meaningful minutes.`
      : draft.streakRules.qualification === 'completions'
        ? `A day counts after ${Math.max(1, draft.streakRules.minimumCompletions)} meaningful completions.`
        : 'Any meaningful completion keeps the study streak alive.'

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div className="min-w-0 space-y-4">
        <SettingsCard
          icon={<Gauge className="size-4" />}
          title="Weekly capacity"
          description="Capacity is a ceiling, not a target. The planner uses it to refuse impossible weeks."
          action={
            <Badge tone="lime">{formatDuration(weeklyCeiling)} / week</Badge>
          }
        >
          <FormGrid>
            <Field
              label="Weekday capacity"
              hint="Base minutes available on a normal school day."
            >
              <NumberInput
                min={0}
                max={1440}
                step={15}
                suffix="min"
                value={draft.weekdayCapacityMinutes}
                onChange={(event) =>
                  patch({ weekdayCapacityMinutes: Number(event.target.value) || 0 })
                }
              />
            </Field>
            <Field
              label="Weekend capacity"
              hint="Base minutes before the weekend mode is applied."
            >
              <NumberInput
                min={0}
                max={1440}
                step={15}
                suffix="min"
                value={draft.weekendCapacityMinutes}
                onChange={(event) =>
                  patch({ weekendCapacityMinutes: Number(event.target.value) || 0 })
                }
              />
            </Field>
          </FormGrid>

          <div className="mt-4 rounded-xl border border-line bg-surface-2/25 p-3">
            <div className="flex items-center justify-between">
              <span className="mono-label">Normal-mode week</span>
              <span className="font-mono text-[9px] text-faint">
                {formatDuration(weeklyBase)} base → {formatDuration(weeklyCeiling)} usable
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-7 gap-1">
              {WEEK_ORDER.map((day) => {
                const entry = capacityPreview.find((item) => item.weekday === day)
                if (!entry) return null
                const { capacity } = entry
                return (
                  <div
                    key={day}
                    className={cn(
                      'rounded-lg border px-1.5 py-2 text-center',
                      capacity.isRest || capacity.isUnavailable
                        ? 'border-line/70 bg-black/20'
                        : capacity.isLighter
                          ? 'border-warning/15 bg-warning/[0.035]'
                          : 'border-line bg-surface/60',
                    )}
                  >
                    <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-faint">
                      {WEEKDAY_SHORT[day].slice(0, 2)}
                    </p>
                    <p
                      className={cn(
                        'font-num mt-1 text-[12px] font-semibold',
                        capacity.isRest || capacity.isUnavailable
                          ? 'text-faint'
                          : 'text-fg',
                      )}
                    >
                      {capacity.isRest || capacity.isUnavailable
                        ? '—'
                        : formatDuration(capacity.plannedCapacityMinutes)}
                    </p>
                    <p className="mt-0.5 text-[7.5px] text-faint">
                      {capacity.isRest
                        ? 'Rest'
                        : capacity.isUnavailable
                          ? 'Off'
                          : capacity.isLighter
                            ? 'Lighter'
                            : capacity.isPreferred
                              ? 'Study'
                              : 'Reduced'}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="mt-2.5 text-[9.5px] leading-relaxed text-faint">
              Normal mode applies a 15% buffer, a 30% cut on lighter weekends, a 45% cut on your
              lighter day, and a 25% cut on non-preferred days. Rest and unavailable days are zero.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={<CalendarDays className="size-4" />}
          title="Study days"
          description="Preferred days get full capacity. Unavailable days are blocked entirely."
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] font-medium text-muted">Preferred study days</p>
                <span className="font-mono text-[9px] text-faint">
                  {draft.preferredStudyDays.length} selected
                </span>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {WEEK_ORDER.map((day) => {
                  const active = draft.preferredStudyDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => togglePreferred(day)}
                      aria-pressed={active}
                      className={cn(
                        'flex h-9 items-center justify-center rounded-lg border text-[10.5px] font-medium transition-colors',
                        active
                          ? 'border-lime/35 bg-lime/10 text-lime'
                          : 'border-line bg-surface-2/35 text-faint hover:border-line-strong hover:text-muted',
                      )}
                    >
                      {WEEKDAY_SHORT[day]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] font-medium text-muted">Unavailable days</p>
                <span className="font-mono text-[9px] text-faint">
                  {draft.unavailableDays.length} blocked
                </span>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {WEEK_ORDER.map((day) => {
                  const active = draft.unavailableDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleUnavailable(day)}
                      aria-pressed={active}
                      className={cn(
                        'flex h-9 items-center justify-center rounded-lg border text-[10.5px] font-medium transition-colors',
                        active
                          ? 'border-danger/25 bg-danger/[0.075] text-danger'
                          : 'border-line bg-surface-2/35 text-faint hover:border-line-strong hover:text-muted',
                      )}
                    >
                      {WEEKDAY_SHORT[day]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            If a day is both preferred and unavailable, unavailable wins. A weekday rest day also
            overrides study days.
          </p>
        </SettingsCard>

        <SettingsCard
          icon={<Moon className="size-4" />}
          title="Rest and recovery"
          description="Rest is part of the system. It preserves streak continuity instead of breaking it."
        >
          <FormGrid>
            <Field
              label="Weekly rest day"
              hint="No capacity is planned. A rest day keeps the streak intact."
            >
              <Select
                value={draft.weeklyRestDay === null ? '' : String(draft.weeklyRestDay)}
                onChange={(event) =>
                  patch({
                    weeklyRestDay:
                      event.target.value === ''
                        ? null
                        : (Number(event.target.value) as Weekday),
                  })
                }
              >
                <option value="">Flexible / none</option>
                {WEEK_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_LABELS[day]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lighter day" optional hint="Capacity drops to roughly half.">
              <Select
                value={draft.lighterDay === null ? '' : String(draft.lighterDay)}
                onChange={(event) =>
                  patch({
                    lighterDay:
                      event.target.value === ''
                        ? null
                        : (Number(event.target.value) as Weekday),
                  })
                }
              >
                <option value="">None</option>
                {WEEK_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_LABELS[day]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <div className="mt-4">
            <p className="mb-2 text-[11.5px] font-medium text-muted">Weekend mode</p>
            <SegmentedControl
              value={draft.weekendMode}
              onChange={(value) => patch({ weekendMode: value })}
              ariaLabel="Weekend mode"
              className="w-full [&>button]:flex-1"
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'light', label: 'Light' },
                { value: 'rest', label: 'Rest' },
              ]}
            />
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
              {draft.weekendMode === 'normal'
                ? 'Saturday and Sunday use the full weekend capacity.'
                : draft.weekendMode === 'light'
                  ? 'Weekend capacity is cut by 30%.'
                  : 'Saturday and Sunday are treated as rest days with zero planned capacity.'}
            </p>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={<Timer className="size-4" />}
          title="Planner block sizes"
          description="Used by plan-week proposals and inbox defaults. Estimates still come from the actual task."
        >
          <FormGrid cols={3}>
            <Field label="Study mission" hint="15–60 minute blocks.">
              <NumberInput
                min={5}
                max={480}
                step={5}
                suffix="min"
                value={draft.defaultDurations.mission}
                onChange={(event) =>
                  patch({
                    defaultDurations: {
                      ...draft.defaultDurations,
                      mission: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="Homework block" hint="20–60 minute blocks.">
              <NumberInput
                min={5}
                max={480}
                step={5}
                suffix="min"
                value={draft.defaultDurations.assignmentBlock}
                onChange={(event) =>
                  patch({
                    defaultDurations: {
                      ...draft.defaultDurations,
                      assignmentBlock: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="Milestone block" hint="20–90 minute blocks.">
              <NumberInput
                min={5}
                max={480}
                step={5}
                suffix="min"
                value={draft.defaultDurations.milestoneBlock}
                onChange={(event) =>
                  patch({
                    defaultDurations: {
                      ...draft.defaultDurations,
                      milestoneBlock: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          </FormGrid>
        </SettingsCard>
      </div>

      <aside className="space-y-4">
        <SettingsCard
          icon={<Zap className="size-4" />}
          title="Streak rules"
          description="A streak should mean the work happened, not that the app was opened."
        >
          <p className="mb-2 text-[11.5px] font-medium text-muted">A day qualifies when</p>
          <SegmentedControl
            value={draft.streakRules.qualification}
            onChange={(value) =>
              patch({
                streakRules: { ...draft.streakRules, qualification: value },
              })
            }
            ariaLabel="Streak qualification"
            className="w-full flex-col items-stretch [&>button]:justify-start"
            options={STREAK_QUALIFICATION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />

          {draft.streakRules.qualification === 'minutes' ? (
            <Field
              label="Minimum study minutes"
              hint="Only meaningful study activity counts."
              className="mt-3"
            >
              <NumberInput
                min={1}
                max={600}
                step={5}
                suffix="min"
                value={draft.streakRules.minimumMinutes}
                onChange={(event) =>
                  patch({
                    streakRules: {
                      ...draft.streakRules,
                      minimumMinutes: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          ) : null}

          {draft.streakRules.qualification === 'completions' ? (
            <Field
              label="Minimum completions"
              hint="A whole number of meaningful activities."
              className="mt-3"
            >
              <NumberInput
                min={1}
                max={20}
                value={draft.streakRules.minimumCompletions}
                onChange={(event) =>
                  patch({
                    streakRules: {
                      ...draft.streakRules,
                      minimumCompletions: Number(event.target.value) || 1,
                    },
                  })
                }
              />
            </Field>
          ) : null}

          <div className="mt-3 divide-y divide-line border-y border-line">
            <SettingToggle
              label="Preserve scheduled rest days"
              hint="An intentional rest day does not break continuity."
              checked={draft.streakRules.preserveScheduledRestDays}
              onCheckedChange={(checked) =>
                patch({
                  streakRules: {
                    ...draft.streakRules,
                    preserveScheduledRestDays: checked,
                  },
                })
              }
            />
            <SettingToggle
              label="Homework counts"
              hint="Completed homework feeds the productivity record."
              checked={draft.streakRules.includeHomework}
              onCheckedChange={(checked) =>
                patch({
                  streakRules: { ...draft.streakRules, includeHomework: checked },
                })
              }
            />
            <SettingToggle
              label="Milestones count"
              hint="Completed project milestones feed the productivity record."
              checked={draft.streakRules.includeProjectMilestones}
              onCheckedChange={(checked) =>
                patch({
                  streakRules: {
                    ...draft.streakRules,
                    includeProjectMilestones: checked,
                  },
                })
              }
            />
          </div>
          <p className="mt-3 rounded-lg border border-lime/12 bg-lime/[0.03] px-2.5 py-2 text-[9.5px] leading-relaxed text-lime/75">
            {streakSummary}
          </p>
        </SettingsCard>

        <div className="rounded-2xl border border-line bg-surface/50 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-faint" />
            <p className="mono-label">Why the buffer</p>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            Planning to 100% of your theoretical free time guarantees failure. The normal-mode
            ceiling keeps roughly 15% unclaimed so a real day can absorb a surprise.
          </p>
          <div className="mt-3 flex items-center justify-between text-[10px]">
            <span className="text-faint">Base capacity</span>
            <span className="font-mono text-muted">{formatDuration(weeklyBase)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className="text-faint">Usable plan</span>
            <span className="font-mono text-lime">{formatDuration(weeklyCeiling)}</span>
          </div>
          <Progress
            value={weeklyBase > 0 ? Math.round((weeklyCeiling / weeklyBase) * 100) : 0}
            tone="lime"
            size="sm"
            className="mt-2"
          />
        </div>
      </aside>
    </div>
  )
}

function SubjectsTab({
  draft,
  patch,
  activeSubjects,
  archivedSubjects,
  topics,
  activeGoalTotal,
  goals,
  reorderBusy,
  restoreBusyId,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
  onMove,
}: {
  draft: WorkspaceSettings
  patch: (patch: Partial<WorkspaceSettings>) => void
  activeSubjects: Subject[]
  archivedSubjects: Subject[]
  topics: Topic[]
  activeGoalTotal: number
  goals: Array<{ subject: Subject; completed: number; target: number }>
  reorderBusy: boolean
  restoreBusyId: string | null
  onAdd: () => void
  onEdit: (subject: Subject) => void
  onArchive: (subject: Subject) => void
  onRestore: (subject: Subject) => void
  onMove: (subject: Subject, direction: -1 | 1) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border border-lime/20 bg-lime/[0.07] text-lime">
            <GraduationCap className="size-4" />
          </span>
          <div>
            <p className="text-[12.5px] font-medium">
              {activeSubjects.length} active {activeSubjects.length === 1 ? 'subject' : 'subjects'}
              <span className="ml-2 font-normal text-faint">· {activeGoalTotal} sessions / week</span>
            </p>
            <p className="mt-0.5 text-[10px] text-faint">
              Weekly targets count completed study activities. They are not minute quotas.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={onAdd}>
          <Plus className="size-3.5" />
          Add subject
        </Button>
      </div>

      {activeSubjects.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface/50 px-5 py-10 text-center">
          <GraduationCap className="mx-auto size-6 text-faint" />
          <p className="mt-3 text-[13px] font-medium">No active subjects.</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-faint">
            Add at least one subject so study missions and weekly goals have a home.
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add your first subject
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {activeSubjects.map((subject, index) => {
            const target = draft.weeklyGoals[subject.id] ?? subject.weeklyTarget ?? 0
            const goal = goals.find((item) => item.subject.id === subject.id)
            const percent =
              target > 0 ? Math.min(100, Math.round(((goal?.completed ?? 0) / target) * 100)) : 100
            const topicCount = topics.filter((topic) => topic.subjectId === subject.id).length
            return (
              <div
                key={subject.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface/75"
              >
                <div className="flex items-start gap-3 border-b border-line px-4 py-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${subject.color}18`, color: subject.color }}
                  >
                    <SubjectIcon icon={subject.icon} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold">{subject.name}</p>
                      <Badge tone="outline" className="hidden sm:inline-flex">
                        {SUBJECT_TYPE_LABELS[subject.type]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9.5px] text-faint">
                      <span>{SUBJECT_TYPE_LABELS[subject.type]}</span>
                      {subject.examDate ? (
                        <span>
                          Exam{' '}
                          {formatDateKey(subject.examDate, draft.locale, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      ) : null}
                      <span>{topicCount} topics</span>
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${subject.name}`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/5 hover:text-fg"
                      >
                        <Settings2 className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-52">
                      <DropdownMenuLabel>Subject</DropdownMenuLabel>
                      <DropdownMenuItem
                        icon={<Pencil className="size-3.5" />}
                        onSelect={() => onEdit(subject)}
                      >
                        Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<ArrowUp className="size-3.5" />}
                        disabled={index === 0 || reorderBusy}
                        onSelect={() => onMove(subject, -1)}
                      >
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<ArrowDown className="size-3.5" />}
                        disabled={index === activeSubjects.length - 1 || reorderBusy}
                        onSelect={() => onMove(subject, 1)}
                      >
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<BookOpen className="size-3.5" />}
                        onSelect={() => {
                          window.location.assign(`/study/${encodeURIComponent(subject.id)}`)
                        }}
                      >
                        Open subject
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        danger
                        icon={<Archive className="size-3.5" />}
                        onSelect={() => onArchive(subject)}
                      >
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="mono-label">Weekly target</p>
                      <p className="mt-1 text-[9.5px] text-faint">
                        {goal?.completed ?? 0} completed this week
                      </p>
                    </div>
                    <TargetStepper
                      value={target}
                      onChange={(value) =>
                        patch({
                          weeklyGoals: { ...draft.weeklyGoals, [subject.id]: value },
                        })
                      }
                    />
                  </div>
                  <Progress
                    value={percent}
                    tone={percent >= 100 ? 'teal' : 'lime'}
                    size="sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-faint">
                      {target === 0
                        ? 'No target'
                        : percent >= 100
                          ? 'Target met'
                          : `${Math.max(0, target - (goal?.completed ?? 0))} to go`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(subject)}
                      className="text-[10px] font-medium text-muted transition-colors hover:text-lime"
                    >
                      Edit subject
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface/40 px-3.5 py-3">
        <p className="text-[10px] leading-relaxed text-faint">
          <span className="font-medium text-muted">How targets save:</span> targets edited here are
          part of the settings draft above. Editing a subject's details saves that subject
          immediately and also keeps the weekly target in sync.
        </p>
      </div>

      {archivedSubjects.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface/50">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Archive className="size-3.5 text-faint" />
              <p className="text-[12px] font-medium text-muted">Archived subjects</p>
            </div>
            <Badge tone="outline">{archivedSubjects.length}</Badge>
          </div>
          <div className="divide-y divide-line">
            {archivedSubjects.map((subject) => (
              <div key={subject.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg opacity-60"
                  style={{ backgroundColor: `${subject.color}14`, color: subject.color }}
                >
                  <SubjectIcon icon={subject.icon} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-muted">{subject.name}</p>
                  <p className="mt-0.5 text-[9px] text-faint">
                    {SUBJECT_TYPE_LABELS[subject.type]} · history preserved
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  loading={restoreBusyId === subject.id}
                  onClick={() => onRestore(subject)}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CalendarTab({
  draft,
  patch,
}: {
  draft: WorkspaceSettings
  patch: (patch: Partial<WorkspaceSettings>) => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="space-y-4">
        <SettingsCard
          icon={<CalendarDays className="size-4" />}
          title="Calendar defaults"
          description="What you see when the calendar opens. Filters inside the calendar can still change for the current session."
        >
          <Field label="Default view">
            <Select
              value={draft.calendar.defaultView}
              onChange={(event) =>
                patch({
                  calendar: {
                    ...draft.calendar,
                    defaultView: event.target.value as CalendarView,
                  },
                })
              }
            >
              {(Object.keys(CALENDAR_VIEW_LABELS) as CalendarView[]).map((view) => (
                <option key={view} value={view}>
                  {CALENDAR_VIEW_LABELS[view]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-3 divide-y divide-line border-y border-line">
            <SettingToggle
              label="Show weekends"
              hint="When off, Saturday and Sunday are hidden from month and week views."
              checked={draft.calendar.showWeekends}
              onCheckedChange={(checked) =>
                patch({ calendar: { ...draft.calendar, showWeekends: checked } })
              }
            />
            <SettingToggle
              label="Show completed blocks"
              hint="Completed blocks remain visible until you hide them for the session."
              checked={draft.calendar.showCompleted}
              onCheckedChange={(checked) =>
                patch({ calendar: { ...draft.calendar, showCompleted: checked } })
              }
            />
          </div>
        </SettingsCard>

        <SettingsCard
          icon={<BellRing className="size-4" />}
          title="In-app reminders"
          description="A quiet prompt inside the app. Nothing is pushed to a closed tab or sent to your phone."
        >
          <div className="divide-y divide-line border-y border-line">
            <SettingToggle
              label="Enable in-app reminders"
              hint="Master switch for the daily check-in nudge on Today."
              checked={draft.reminders.inAppEnabled}
              onCheckedChange={(checked) =>
                patch({ reminders: { ...draft.reminders, inAppEnabled: checked } })
              }
            />
            <SettingToggle
              label="Daily check-in nudge"
              hint="Shown on Today after your chosen time until a reflection is logged."
              checked={draft.reminders.dailyNudgeEnabled}
              disabled={!draft.reminders.inAppEnabled}
              onCheckedChange={(checked) =>
                patch({ reminders: { ...draft.reminders, dailyNudgeEnabled: checked } })
              }
            />
          </div>
          <FormGrid className="mt-3">
            <Field label="Nudge time" hint="Local time in your workspace timezone.">
              <Input
                type="time"
                value={draft.reminders.dailyNudgeTime}
                disabled={!draft.reminders.inAppEnabled || !draft.reminders.dailyNudgeEnabled}
                onChange={(event) =>
                  patch({ reminders: { ...draft.reminders, dailyNudgeTime: event.target.value } })
                }
              />
            </Field>
            <Field
              label="Due-soon horizon"
              hint="Days ahead used by Today's due-soon list."
            >
              <NumberInput
                min={1}
                max={90}
                suffix="days"
                value={draft.reminders.dueSoonDays}
                onChange={(event) =>
                  patch({
                    reminders: {
                      ...draft.reminders,
                      dueSoonDays: Number(event.target.value) || 1,
                    },
                  })
                }
              />
            </Field>
          </FormGrid>
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <p className="text-[10px] leading-relaxed text-faint">
              Browser notifications are intentionally not supported. There is no server worker or
              closed-tab delivery, so the app never claims a push will arrive. In-app means this tab
              or window only.
            </p>
          </div>
        </SettingsCard>
      </div>

      <aside className="space-y-3">
        <SettingsCard
          icon={<Clock3 className="size-4" />}
          title="How capacity becomes a day"
          description="A quick read on the rules that shape your plan"
        >
          <div className="space-y-2.5">
            <InfoRow
              label="Preferred days"
              value={`${draft.preferredStudyDays.length} / 7`}
            />
            <InfoRow
              label="Weekly rest"
              value={
                draft.weeklyRestDay === null
                  ? 'Flexible'
                  : WEEKDAY_LABELS[draft.weeklyRestDay]
              }
            />
            <InfoRow
              label="Lighter day"
              value={draft.lighterDay === null ? 'None' : WEEKDAY_LABELS[draft.lighterDay]}
            />
            <InfoRow
              label="Weekend mode"
              value={
                draft.weekendMode === 'normal'
                  ? 'Normal'
                  : draft.weekendMode === 'light'
                    ? 'Light'
                    : 'Rest'
              }
            />
            <InfoRow
              label="Week starts"
              value={WEEKDAY_LABELS[draft.weekStartsOn]}
            />
          </div>
        </SettingsCard>
        <div className="rounded-2xl border border-line bg-surface/50 p-4">
          <div className="flex items-center gap-2">
            <Moon className="size-3.5 text-faint" />
            <p className="mono-label">Rest is not failure</p>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            A rest day is a real part of the plan. It removes capacity instead of pretending you
            will work, and it protects streak continuity when rest days are preserved.
          </p>
        </div>
      </aside>
    </div>
  )
}

function DataTab({
  settings,
  collections,
  sync,
  onReload,
}: {
  settings: WorkspaceSettings
  collections: WorkspaceCollections
  sync: SyncSnapshot
  onReload: () => void
}) {
  const [exporting, setExporting] = useState(false)
  const [importPreview, setImportPreview] = useState<{
    fileName: string
    validation: BackupValidationResult
  } | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const counts = COLLECTION_LABELS.map((item) => ({
    ...item,
    count: collections[item.key].length,
  }))
  const totalDocuments = counts.reduce((sum, item) => sum + item.count, 0)
  const rules = firestoreRules(WORKSPACE_ID)

  const exportBackup = async () => {
    setExporting(true)
    try {
      await downloadBackupJson()
      notifySaved(
        'Backup exported',
        `${totalDocuments} documents and the workspace settings were read from Firestore.`,
      )
    } catch (err) {
      notifyError(err, 'The backup could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setImportPreview({
        fileName: file.name,
        validation: {
          ok: false,
          errors: ['That file is larger than 10 MB. This app does not need a backup that large.'],
          warnings: [],
          payload: null,
          summary: null,
        },
      })
      setImportMode('merge')
      setReplaceAcknowledged(false)
      return
    }
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        setImportPreview({
          fileName: file.name,
          validation: {
            ok: false,
            errors: ['That file is not valid JSON.'],
            warnings: [],
            payload: null,
            summary: null,
          },
        })
        setImportMode('merge')
        setReplaceAcknowledged(false)
        return
      }
      const validation = validateBackupPayload(parsed)
      setImportPreview({ fileName: file.name, validation })
      setImportMode('merge')
      setReplaceAcknowledged(false)
    } catch (err) {
      notifyError(err, 'The file could not be read.')
    }
  }

  const confirmImport = async () => {
    const validation = importPreview?.validation
    if (!validation?.ok || !validation.payload) return
    if (importMode === 'replace' && !replaceAcknowledged) return
    setImporting(true)
    try {
      const result = await importBackup(validation.payload, importMode)
      notifySaved(
        'Backup imported',
        `${result.written} records written in ${importMode} mode. Live views will update from Firestore.`,
      )
      setImportPreview(null)
      setReplaceAcknowledged(false)
    } catch (err) {
      notifyError(err, 'The backup could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  const confirmReset = async () => {
    if (resetConfirm.trim().toUpperCase() !== 'RESET') return
    setResetting(true)
    try {
      await resetWorkspace()
      notifySaved(
        'Workspace erased',
        'The onboarding screen will appear when Firestore confirms the deletion.',
      )
      setResetOpen(false)
      setResetConfirm('')
    } catch (err) {
      notifyError(err, 'The workspace could not be reset.')
    } finally {
      setResetting(false)
    }
  }

  const copyRules = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard access is unavailable in this browser context.')
      }
      await navigator.clipboard.writeText(rules)
      setCopied(true)
      notifySaved('Firestore rules copied')
    } catch (err) {
      notifyError(err, 'The rules could not be copied. Select the text manually.')
    }
  }

  const syncTone =
    sync.phase === 'error'
      ? 'danger'
      : sync.phase === 'offline'
        ? 'warning'
        : sync.phase === 'saving' || sync.phase === 'loading'
          ? 'info'
          : 'success'

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={<Cloud className="size-4" />}
        title="Firestore connection"
        description="Every record is stored in your own Firebase project. The app never falls back to mock data."
        action={
          <Badge tone={syncTone}>
            {sync.online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {sync.phase === 'synced'
              ? 'Synced'
              : sync.phase === 'saving'
                ? 'Saving'
                : sync.phase === 'loading'
                  ? 'Loading'
                  : sync.phase === 'offline'
                    ? 'Offline'
                    : sync.phase === 'error'
                      ? 'Error'
                      : 'Idle'}
          </Badge>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FactCard label="Workspace id" value={WORKSPACE_ID} mono />
          <FactCard label="Firebase project" value={firebaseProjectId || 'Not configured'} mono />
          <FactCard
            label="Total documents"
            value={`${totalDocuments} + settings`}
          />
          <FactCard
            label="Last sync"
            value={
              sync.lastSyncedAt
                ? sync.lastSyncedAt.toLocaleTimeString(settings.locale, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'This session'
            }
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {counts.map((item) => (
            <div
              key={item.key}
              className="rounded-lg border border-line bg-surface-2/25 px-2 py-2 text-center"
            >
              <p className="font-num text-[15px] font-semibold leading-none">{item.count}</p>
              <p className="mt-1 truncate text-[8px] leading-tight text-faint">{item.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onReload}>
            <RefreshCw className="size-3.5" />
            Reload workspace
          </Button>
          <span className="text-[9.5px] text-faint">
            Offline edits queue in the browser and sync when the connection returns.
          </span>
        </div>
      </SettingsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard
          icon={<HardDriveDownload className="size-4" />}
          title="Export a backup"
          description="Reads the raw workspace from Firestore and downloads a versioned JSON file."
        >
          <div className="rounded-xl border border-line bg-surface-2/25 p-3">
            <div className="flex items-center justify-between">
              <span className="mono-label">Backup format</span>
              <Badge tone="outline">v{BACKUP_VERSION}</Badge>
            </div>
            <p className="mt-2 font-mono text-[10px] text-faint">
              {BACKUP_APP.toLowerCase().replace(' ', '-')}-backup-YYYY-MM-DD.json
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-faint">Documents</span>
              <span className="font-mono text-muted">{totalDocuments}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className="text-faint">Settings included</span>
              <span className="font-mono text-muted">Yes</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="mt-3 w-full"
            loading={exporting}
            onClick={() => void exportBackup()}
          >
            {!exporting ? <Download className="size-3.5" /> : null}
            Download backup
          </Button>
          <p className="mt-2 text-[9.5px] leading-relaxed text-faint">
            Export is a real read. If Firestore cannot be reached, the download fails and you get an
            error instead of an empty file.
          </p>
        </SettingsCard>

        <SettingsCard
          icon={<Upload className="size-4" />}
          title="Import a backup"
          description="Validate first, then merge or replace. The file never goes anywhere except your Firestore workspace."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => void handleFile(event)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-2/25 px-4 py-7 text-center transition-colors hover:border-lime/30 hover:bg-lime/[0.02]"
          >
            <FileJson className="size-6 text-faint" />
            <span className="mt-2 text-[12px] font-medium text-fg/90">
              Choose a backup file
            </span>
            <span className="mt-1 text-[10px] text-faint">.json · up to 10 MB</span>
          </button>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2/25 px-2.5 py-2">
            <ShieldCheck className="mt-0.5 size-3 shrink-0 text-teal" />
            <p className="text-[9.5px] leading-relaxed text-faint">
              Merge keeps existing documents and overwrites matching ids. Replace deletes current
              workspace documents first. Both are validated against backup version {BACKUP_VERSION}.
            </p>
          </div>
        </SettingsCard>
      </div>

      <SettingsCard
        icon={<LockKeyhole className="size-4" />}
        title="Firestore rules"
        description="The only thing standing between this URL and your data. Publish these in the Firebase console."
        action={
          <Button variant="secondary" size="xs" onClick={() => void copyRules()}>
            <Copy className="size-3" />
            {copied ? 'Copied' : 'Copy rules'}
          </Button>
        }
      >
        <pre className="overflow-x-auto rounded-xl border border-line bg-[#080a09] p-3.5 font-mono text-[10px] leading-relaxed text-lime/75">
          {rules}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[11px] text-muted transition-colors hover:text-fg"
            href={
              firebaseProjectId
                ? `https://console.firebase.google.com/project/${firebaseProjectId}/firestore/rules`
                : 'https://console.firebase.google.com/'
            }
            target="_blank"
            rel="noreferrer"
          >
            Firebase console
            <ExternalLink className="size-3" />
          </a>
          <span className="text-[9.5px] text-faint">
            These open rules allow anyone with the workspace id to read and write. That is the
            tradeoff of no login. Keep the project private.
          </span>
        </div>
      </SettingsCard>

      <section className="overflow-hidden rounded-2xl border border-danger/20 bg-danger/[0.025]">
        <div className="flex items-start gap-3 border-b border-danger/15 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <ShieldAlert className="size-4" />
          </span>
          <div>
            <h2 className="text-[13.5px] font-semibold">Danger zone</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
              Reset deletes every document in this workspace, including settings. It cannot be
              undone except from a backup you exported yourself.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <p className="text-[11.5px] font-medium text-danger/90">Erase this workspace</p>
            <p className="mt-0.5 text-[10px] text-faint">
              Returns the app to first-run onboarding. No records are kept.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
            <Trash2 className="size-3.5" />
            Reset workspace
          </Button>
        </div>
      </section>

      <Dialog
        open={importPreview !== null}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setImportPreview(null)
            setReplaceAcknowledged(false)
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader
            eyebrow="Backup validation"
            title={
              importPreview?.validation.ok
                ? 'This backup can be imported.'
                : 'This file is not safe to import.'
            }
            description={
              importPreview
                ? `${importPreview.fileName} · validated against backup version ${BACKUP_VERSION}.`
                : undefined
            }
          />
          <DialogBody className="space-y-4">
            {importPreview?.validation.summary ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <FactCard
                    label="Format"
                    value={`${importPreview.validation.payload?.app ?? BACKUP_APP} v${importPreview.validation.payload?.version ?? '?'}`}
                  />
                  <FactCard
                    label="Documents"
                    value={String(importPreview.validation.summary.totalDocuments)}
                  />
                  <FactCard
                    label="Exported"
                    value={
                      importPreview.validation.summary.exportedAt
                        ? new Date(
                            importPreview.validation.summary.exportedAt,
                          ).toLocaleDateString()
                        : 'Unknown'
                    }
                  />
                  <FactCard
                    label="Workspace"
                    value={
                      importPreview.validation.summary.workspaceMatches
                        ? 'Matches'
                        : 'Different id'
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {COLLECTION_LABELS.map((item) => {
                    const count =
                      importPreview.validation.summary?.perCollection[item.key] ?? 0
                    if (count === 0) return null
                    return (
                      <div
                        key={item.key}
                        className="rounded-lg border border-line bg-surface-2/25 px-2 py-2 text-center"
                      >
                        <p className="font-num text-[14px] font-semibold leading-none">{count}</p>
                        <p className="mt-1 truncate text-[8px] text-faint">{item.label}</p>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}

            {importPreview?.validation.errors.length ? (
              <div className="rounded-xl border border-danger/20 bg-danger/[0.045] px-3.5 py-3">
                <p className="text-[11px] font-medium text-danger">Blocking errors</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-relaxed text-danger/85">
                  {importPreview.validation.errors.map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importPreview?.validation.warnings.length ? (
              <div className="rounded-xl border border-warning/20 bg-warning/[0.04] px-3.5 py-3">
                <p className="text-[11px] font-medium text-warning">Warnings</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-relaxed text-warning/80">
                  {importPreview.validation.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importPreview?.validation.ok ? (
              <>
                <div>
                  <p className="mb-2 text-[11.5px] font-medium text-muted">Import mode</p>
                  <SegmentedControl
                    value={importMode}
                    onChange={(value) => {
                      setImportMode(value)
                      if (value === 'merge') setReplaceAcknowledged(false)
                    }}
                    ariaLabel="Import mode"
                    className="w-full [&>button]:flex-1"
                    options={[
                      { value: 'merge', label: 'Merge' },
                      { value: 'replace', label: 'Replace' },
                    ]}
                  />
                  <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                    {importMode === 'merge'
                      ? 'Existing documents stay. Matching ids are overwritten by the backup.'
                      : 'All current workspace documents are deleted first, then the backup is written. Export a fresh backup before continuing.'}
                  </p>
                </div>

                {importMode === 'replace' ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/[0.035] px-3 py-2.5">
                    <Checkbox
                      checked={replaceAcknowledged}
                      onCheckedChange={setReplaceAcknowledged}
                      label="Confirm replacement"
                      className="mt-0.5"
                    />
                    <span className="text-[10.5px] leading-relaxed text-danger/85">
                      I understand this deletes the current workspace contents before importing the
                      backup.
                    </span>
                  </label>
                ) : null}
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setImportPreview(null)
                setReplaceAcknowledged(false)
              }}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              variant={importMode === 'replace' ? 'danger' : 'primary'}
              loading={importing}
              disabled={
                !importPreview?.validation.ok ||
                (importMode === 'replace' && !replaceAcknowledged)
              }
              onClick={() => void confirmImport()}
            >
              {!importing ? <Upload className="size-4" /> : null}
              {importMode === 'replace' ? 'Replace workspace' : 'Merge backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!resetting) {
            setResetOpen(open)
            if (!open) setResetConfirm('')
          }
        }}
      >
        <DialogContent size="sm">
          <DialogHeader
            eyebrow="Permanent deletion"
            title="Erase this workspace?"
            description="Every subject, mission, assignment, project, calendar block, activity record, and settings document will be deleted from Firestore."
          />
          <DialogBody className="space-y-4">
            <div className="rounded-xl border border-danger/20 bg-danger/[0.04] px-3.5 py-3">
              <p className="text-[10.5px] leading-relaxed text-danger/85">
                There is no undo and no server-side trash. A backup is the only recovery path.
              </p>
            </div>
            <Field label='Type "RESET" to confirm'>
              <Input
                value={resetConfirm}
                onChange={(event) => setResetConfirm(event.target.value)}
                placeholder="RESET"
                autoComplete="off"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={resetting}
              disabled={resetConfirm.trim().toUpperCase() !== 'RESET'}
              onClick={() => void confirmReset()}
            >
              {!resetting ? <Trash2 className="size-4" /> : null}
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsCard({
  icon,
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface/75',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2/60 text-lime/80">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description ? (
              <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function SettingToggle({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className={cn('text-[11.5px] font-medium', disabled ? 'text-faint' : 'text-fg/90')}>
          {label}
        </p>
        {hint ? <p className="mt-0.5 text-[9.5px] leading-relaxed text-faint">{hint}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={label}
      />
    </div>
  )
}

function TargetStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center rounded-lg border border-line bg-surface-2/50">
      <button
        type="button"
        aria-label="Decrease weekly target"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        className="flex size-8 items-center justify-center text-faint transition-colors hover:text-fg disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-9 text-center font-mono text-[12px] text-fg">{value}</span>
      <button
        type="button"
        aria-label="Increase weekly target"
        onClick={() => onChange(Math.min(21, value + 1))}
        disabled={value >= 21}
        className="flex size-8 items-center justify-center text-faint transition-colors hover:text-fg disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-faint">{label}</span>
      <span className="text-right font-mono text-muted">{value}</span>
    </div>
  )
}

function FactCard({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/30 px-3 py-2.5">
      <p className="mono-label">{label}</p>
      <p
        className={cn(
          'mt-1.5 break-all text-[11px] leading-snug text-muted',
          mono && 'font-mono text-[10px]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[10.5px] text-faint">{label}</span>
      <span className="text-[10.5px] text-muted">{value}</span>
    </div>
  )
}
