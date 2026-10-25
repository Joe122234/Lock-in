import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  GraduationCap,
  Loader2,
  Moon,
  Sparkles,
  Target,
} from 'lucide-react'
import type {
  Subject,
  SubjectType,
  Weekday,
  WeekendMode,
  WorkspaceSettings,
} from '@/types/domain'
import {
  createDefaultSettings,
  createSeedSubjects,
  createSeedTopics,
  SUBJECT_COLORS,
  WEEKDAY_SHORT,
} from '@/lib/constants'
import { getSupportedTimezones } from '@/lib/dates'
import { initializeWorkspace, saveWorkspaceSettings, seedTaxonomy, upsertSettingsFields } from '@/lib/firebase/repositories/settings'
import { updateSubject } from '@/lib/firebase/repositories/subjects'
import { useWorkspace } from '@/providers/workspace-provider'
import { LogoMark } from '@/components/brand'
import { SubjectIcon } from '@/components/subject-icon'
import { Button } from '@/components/ui/button'
import { Field, Input, NumberInput, Select } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/page'
import { Switch } from '@/components/ui/controls'
import { cn, errorMessage } from '@/lib/utils'

const STEPS = [
  { id: 'identity', label: 'Identity', icon: Sparkles },
  { id: 'dates', label: 'Deadlines', icon: Target },
  { id: 'rhythm', label: 'Rhythm', icon: Clock3 },
  { id: 'goals', label: 'Coverage', icon: GraduationCap },
  { id: 'launch', label: 'Launch', icon: Check },
] as const

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

const SUBJECT_META: Array<{
  id: string
  short: string
  name: string
  type: SubjectType
  icon: string
  color: string
}> = [
  { id: 'sat', short: 'SAT', name: 'SAT Preparation', type: 'sat', icon: 'target', color: SUBJECT_COLORS.sat },
  {
    id: 'ap-comparative',
    short: 'Comp Gov',
    name: 'AP Comparative Government',
    type: 'ap',
    icon: 'landmark',
    color: SUBJECT_COLORS.comparative,
  },
  {
    id: 'ap-world',
    short: 'World',
    name: 'AP World History',
    type: 'ap',
    icon: 'globe2',
    color: SUBJECT_COLORS.world,
  },
  {
    id: 'ap-macro',
    short: 'Macro',
    name: 'AP Macroeconomics',
    type: 'ap',
    icon: 'trending-up',
    color: SUBJECT_COLORS.macro,
  },
]

interface OnboardingDraft {
  workspaceName: string
  timezone: string
  targetSatDate: string
  examDates: Record<string, string>
  preferredStudyDays: Weekday[]
  weeklyRestDay: Weekday | null
  weekdayCapacityMinutes: number
  weekendCapacityMinutes: number
  weekendMode: WeekendMode
  lighterDay: Weekday | null
  weeklyGoals: Record<string, number>
  missionMinutes: number
  mockExamMinutes: number
  preserveRestDays: boolean
}

export function OnboardingWizard() {
  const { settings, collections, today } = useWorkspace()
  const base = useMemo(
    () =>
      settings ??
      createDefaultSettings({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    [settings],
  )
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    workspaceName: base.workspaceName === 'LOCK IN' ? 'My locked-in semester' : base.workspaceName,
    timezone: base.timezone,
    targetSatDate: base.targetSatDate ?? '',
    examDates: Object.fromEntries(
      collections.subjects.filter((subject) => subject.examDate).map((subject) => [subject.id, subject.examDate ?? '']),
    ),
    preferredStudyDays: base.preferredStudyDays,
    weeklyRestDay: base.weeklyRestDay,
    weekdayCapacityMinutes: base.weekdayCapacityMinutes,
    weekendCapacityMinutes: base.weekendCapacityMinutes,
    weekendMode: base.weekendMode,
    lighterDay: base.lighterDay,
    weeklyGoals: {
      sat: base.weeklyGoals.sat ?? 3,
      'ap-comparative': base.weeklyGoals['ap-comparative'] ?? 1,
      'ap-world': base.weeklyGoals['ap-world'] ?? 1,
      'ap-macro': base.weeklyGoals['ap-macro'] ?? 1,
    },
    missionMinutes: base.defaultDurations.mission,
    mockExamMinutes: base.defaultDurations.mockExam,
    preserveRestDays: base.streakRules.preserveScheduledRestDays,
  }))
  const patch = (next: Partial<OnboardingDraft>) => setDraft((current) => ({ ...current, ...next }))
  const timezones = useMemo(() => getSupportedTimezones(), [])

  const totalGoalSessions = Object.values(draft.weeklyGoals).reduce((sum, value) => sum + value, 0)
  const totalWeeklyCapacity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => index as Weekday)
    return days.reduce<number>((sum, day) => {
      if (draft.weeklyRestDay === day) return sum
      if (draft.weekendMode === 'rest' && (day === 0 || day === 6)) return sum
      const isWeekend = day === 0 || day === 6
      let capacity = isWeekend ? draft.weekendCapacityMinutes : draft.weekdayCapacityMinutes
      if (isWeekend && draft.weekendMode === 'light') capacity = Math.round(capacity * 0.7)
      if (draft.lighterDay === day) capacity = Math.round(capacity * 0.55)
      if (!draft.preferredStudyDays.includes(day)) capacity = Math.round(capacity * 0.75)
      return sum + capacity
    }, 0)
  }, [draft])

  const toggleDay = (day: Weekday) => {
    patch({
      preferredStudyDays: draft.preferredStudyDays.includes(day)
        ? draft.preferredStudyDays.filter((item) => item !== day)
        : [...draft.preferredStudyDays, day].sort((a, b) => a - b),
    })
  }

  const next = () => {
    setError(null)
    if (step === 0 && !draft.workspaceName.trim()) {
      setError('Give your workspace a name.')
      return
    }
    if (step === 2 && draft.preferredStudyDays.length === 0) {
      setError('Choose at least one study day.')
      return
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1))
  }

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      const now = new Date()
      const finalSettings: WorkspaceSettings = {
        ...base,
        workspaceName: draft.workspaceName.trim() || 'LOCK IN',
        timezone: draft.timezone,
        targetSatDate: draft.targetSatDate || null,
        preferredStudyDays: draft.preferredStudyDays,
        weeklyRestDay: draft.weeklyRestDay,
        weekdayCapacityMinutes: Math.max(0, draft.weekdayCapacityMinutes),
        weekendCapacityMinutes: Math.max(0, draft.weekendCapacityMinutes),
        weekendMode: draft.weekendMode,
        lighterDay: draft.lighterDay,
        weeklyGoals: {
          sat: draft.weeklyGoals.sat ?? 3,
          'ap-comparative': draft.weeklyGoals['ap-comparative'] ?? 1,
          'ap-world': draft.weeklyGoals['ap-world'] ?? 1,
          'ap-macro': draft.weeklyGoals['ap-macro'] ?? 1,
        },
        defaultDurations: {
          ...base.defaultDurations,
          mission: Math.max(10, draft.missionMinutes),
          mockExam: Math.max(30, draft.mockExamMinutes),
        },
        streakRules: {
          ...base.streakRules,
          preserveScheduledRestDays: draft.preserveRestDays,
        },
        onboardingCompletedAt: now,
        setupSkipped: false,
        updatedAt: now,
      }

      const seededSubjects: Subject[] = createSeedSubjects(now).map((subject) => ({
        ...subject,
        weeklyTarget: finalSettings.weeklyGoals[subject.id] ?? subject.weeklyTarget,
        examDate: draft.examDates[subject.id] || null,
        color:
          SUBJECT_META.find((meta) => meta.id === subject.id)?.color ?? subject.color,
      }))
      const seededTopics = createSeedTopics(now)

      if (!settings) {
        await initializeWorkspace(finalSettings, {
          seed: true,
          subjects: seededSubjects,
          topics: seededTopics,
        })
      } else {
        await saveWorkspaceSettings(finalSettings, collections.subjects)
        if (collections.subjects.length === 0) {
          await seedTaxonomy(seededSubjects, seededTopics)
        } else {
          await Promise.all(
            seededSubjects
              .filter((subject) =>
                collections.subjects.some((existing) => existing.id === subject.id),
              )
              .map((subject) =>
                updateSubject(subject.id, {
                  examDate: subject.examDate,
                  weeklyTarget: subject.weeklyTarget,
                }),
              ),
          )
        }
        await upsertSettingsFields({ onboardingCompletedAt: now })
      }
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  const activeStep = STEPS[step]

  return (
    <div className="min-h-dvh bg-ink lg:grid lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line p-10 lg:flex lg:flex-col xl:p-14">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="pointer-events-none absolute -left-32 top-1/3 size-[26rem] rounded-full bg-lime/[0.055] blur-3xl" />
        <div className="relative flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <p className="text-[15px] font-bold tracking-[0.1em]">LOCK IN</p>
            <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.22em] text-faint">
              Build the record
            </p>
          </div>
        </div>

        <div className="relative mt-auto">
          <p className="mono-label text-lime/70">Setup · 4 min</p>
          <h1 className="mt-5 max-w-md text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] xl:text-[52px]">
            Turn the semester
            <br />
            into a system.
          </h1>
          <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-muted">
            One private workspace for SAT prep, three AP courses, homework, projects, and the
            record of what you actually finish.
          </p>
          <div className="mt-10 space-y-0.5">
            {STEPS.map((item, index) => {
              const Icon = item.icon
              const complete = index < step
              const active = index === step
              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                    active && 'bg-white/[0.045]',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-lg border font-mono text-[10px]',
                      active && 'border-lime/30 bg-lime/10 text-lime',
                      complete && 'border-lime/20 bg-lime/5 text-lime/80',
                      !active && !complete && 'border-line text-faint',
                    )}
                  >
                    {complete ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  <span
                    className={cn(
                      'text-[12.5px]',
                      active ? 'font-medium text-fg' : 'text-faint',
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-10 max-w-xs border-l border-line pl-4 text-[11px] leading-relaxed text-faint">
            No account. No follower feed. No invented history. Every number in this app comes
            from work you actually complete.
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:hidden">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[13px] font-bold tracking-[0.1em]">LOCK IN</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
            Step {step + 1} / {STEPS.length}
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          <div className="hidden items-center justify-between lg:flex">
            <div>
              <p className="mono-label text-lime/70">
                {String(step + 1).padStart(2, '0')} — {activeStep.label}
              </p>
              <p className="mt-1 text-[12px] text-faint">Set the defaults. You can change everything later.</p>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((item, index) => (
                <span
                  key={item.id}
                  className={cn(
                    'h-1 rounded-full transition-all',
                    index === step ? 'w-7 bg-lime' : index < step ? 'w-3 bg-lime/40' : 'w-3 bg-white/10',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex-1 lg:mt-12">
            {step === 0 ? (
              <section className="rise-in space-y-7">
                <div>
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
                    This is your command center.
                  </h2>
                  <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                    Name the workspace and confirm how dates should be calculated. Everything is
                    stored privately in your own Firebase project.
                  </p>
                </div>
                <Field label="Workspace name" htmlFor="workspace-name">
                  <Input
                    id="workspace-name"
                    value={draft.workspaceName}
                    onChange={(event) => patch({ workspaceName: event.target.value })}
                    placeholder="My locked-in semester"
                    autoFocus
                  />
                </Field>
                <Field
                  label="Timezone"
                  htmlFor="timezone"
                  hint="A date only changes at midnight in this timezone. Study history and planner capacity use it."
                >
                  <Select
                    id="timezone"
                    value={draft.timezone}
                    onChange={(event) => patch({ timezone: event.target.value })}
                  >
                    {timezones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="rounded-xl border border-line bg-surface/70 p-4">
                  <p className="text-[12px] font-medium text-fg">What you are setting up</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {SUBJECT_META.map((meta) => (
                      <div key={meta.id} className="flex items-center gap-2 text-[11.5px] text-muted">
                        <span
                          className="flex size-6 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${meta.color}16`, color: meta.color }}
                        >
                          <SubjectIcon icon={meta.icon} size={13} />
                        </span>
                        {meta.short}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 1 ? (
              <section className="rise-in space-y-6">
                <div>
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
                    Put the real deadlines on the board.
                  </h2>
                  <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                    These dates drive countdowns and pacing. Only fill in what you know — leave
                    anything uncertain empty rather than guessing.
                  </p>
                </div>
                <div className="space-y-4 rounded-2xl border border-line bg-surface/80 p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-lime/10 text-lime">
                      <Target className="size-4" />
                    </span>
                    <div>
                      <p className="text-[12.5px] font-medium">SAT test date</p>
                      <p className="text-[10.5px] text-faint">Your next official test</p>
                    </div>
                  </div>
                  <Field label="Official SAT date" optional>
                    <Input
                      type="date"
                      value={draft.targetSatDate}
                      min={today}
                      onChange={(event) => patch({ targetSatDate: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="space-y-3 rounded-2xl border border-line bg-surface/80 p-4 sm:p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-muted">
                      <GraduationCap className="size-4" />
                    </span>
                    <div>
                      <p className="text-[12.5px] font-medium">AP exam dates</p>
                      <p className="text-[10.5px] text-faint">Optional now, editable later</p>
                    </div>
                  </div>
                  {SUBJECT_META.filter((subject) => subject.type === 'ap').map((subject) => (
                    <Field key={subject.id} label={subject.name}>
                      <Input
                        type="date"
                        min={today}
                        value={draft.examDates[subject.id] ?? ''}
                        onChange={(event) =>
                          patch({
                            examDates: { ...draft.examDates, [subject.id]: event.target.value },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="rise-in space-y-6">
                <div>
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
                    Design a week you can actually repeat.
                  </h2>
                  <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                    Capacity is a ceiling, not a quota. The planner will never silently overfill a
                    day or move a protected rest day.
                  </p>
                </div>

                <Field label="Preferred study days">
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((day) => {
                      const active = draft.preferredStudyDays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            'flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-[10px] transition-colors',
                            active
                              ? 'border-lime/35 bg-lime/10 text-lime'
                              : 'border-line bg-surface-2/50 text-faint hover:border-line-strong',
                          )}
                        >
                          <span className="font-mono uppercase">{WEEKDAY_SHORT[day].slice(0, 2)}</span>
                          <span className="text-[8.5px] opacity-60">{active ? 'ON' : 'OFF'}</span>
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Weekday ceiling" hint="Minutes you can focus after school.">
                    <NumberInput
                      min={0}
                      max={600}
                      step={15}
                      suffix="min"
                      value={draft.weekdayCapacityMinutes}
                      onChange={(event) =>
                        patch({ weekdayCapacityMinutes: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field label="Weekend ceiling" hint="A realistic upper limit.">
                    <NumberInput
                      min={0}
                      max={720}
                      step={15}
                      suffix="min"
                      value={draft.weekendCapacityMinutes}
                      onChange={(event) =>
                        patch({ weekendCapacityMinutes: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                </div>

                <Field label="Weekend mode" hint="Use lighter weekends for recovery by default.">
                  <SegmentedControl
                    value={draft.weekendMode}
                    onChange={(value) => patch({ weekendMode: value })}
                    ariaLabel="Weekend mode"
                    className="w-full [&>button]:flex-1"
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'light', label: 'Lighter' },
                      { value: 'rest', label: 'Rest' },
                    ]}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Protected rest day" optional>
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
                      <option value="">None</option>
                      {WEEKDAYS.map((day) => (
                        <option key={day} value={day}>
                          {WEEKDAY_SHORT[day]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Lighter day" optional>
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
                      {WEEKDAYS.map((day) => (
                        <option key={day} value={day}>
                          {WEEKDAY_SHORT[day]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-line bg-surface/70 px-4 py-3">
                  <div>
                    <p className="text-[12px] font-medium text-fg">Rest preserves your streak</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
                      Scheduled rest never counts as a missed day. Other empty days still do.
                    </p>
                  </div>
                  <Switch
                    checked={draft.preserveRestDays}
                    onCheckedChange={(checked) => patch({ preserveRestDays: checked })}
                    label="Rest preserves streak"
                  />
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="rise-in space-y-6">
                <div>
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
                    Aim for coverage, not busyness.
                  </h2>
                  <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                    Weekly goals count completed study sessions per subject. The planner uses them
                    to protect each course from disappearing.
                  </p>
                </div>

                <div className="space-y-2">
                  {SUBJECT_META.map((subject) => {
                    const goal = draft.weeklyGoals[subject.id] ?? 1
                    return (
                      <div
                        key={subject.id}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface/80 p-3.5"
                      >
                        <span
                          className="flex size-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${subject.color}14`, color: subject.color }}
                        >
                          <SubjectIcon icon={subject.icon} size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium">{subject.name}</p>
                          <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
                            sessions / week
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Decrease ${subject.short} goal`}
                            className="flex size-7 items-center justify-center rounded-md border border-line text-muted hover:bg-white/5"
                            onClick={() =>
                              patch({
                                weeklyGoals: {
                                  ...draft.weeklyGoals,
                                  [subject.id]: Math.max(0, goal - 1),
                                },
                              })
                            }
                          >
                            −
                          </button>
                          <span className="w-7 text-center font-mono text-sm text-fg">{goal}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${subject.short} goal`}
                            className="flex size-7 items-center justify-center rounded-md border border-line text-muted hover:bg-white/5"
                            onClick={() =>
                              patch({
                                weeklyGoals: { ...draft.weeklyGoals, [subject.id]: goal + 1 },
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Default mission block" hint="Used when planning study work.">
                    <NumberInput
                      min={10}
                      max={120}
                      step={5}
                      suffix="min"
                      value={draft.missionMinutes}
                      onChange={(event) =>
                        patch({ missionMinutes: Number(event.target.value) || 30 })
                      }
                    />
                  </Field>
                  <Field label="Mock exam block" hint="Reserved for full SAT practice.">
                    <NumberInput
                      min={30}
                      max={300}
                      step={10}
                      suffix="min"
                      value={draft.mockExamMinutes}
                      onChange={(event) =>
                        patch({ mockExamMinutes: Number(event.target.value) || 180 })
                      }
                    />
                  </Field>
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className="rise-in space-y-6">
                <div>
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] sm:text-[30px]">
                    Ready. The record starts empty.
                  </h2>
                  <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
                    No fake tasks. No invented scores. Your streak, progress, and achievements begin
                    the moment you complete real work.
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-line">
                  <div className="flex items-center gap-3 border-b border-line bg-lime/[0.045] px-4 py-3.5">
                    <Moon className="size-4 text-lime" />
                    <div>
                      <p className="text-[12.5px] font-medium">{draft.workspaceName || 'LOCK IN'}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                        {draft.timezone.replaceAll('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-line">
                    <div className="p-4">
                      <p className="mono-label">Weekly goal</p>
                      <p className="font-num mt-2 text-2xl font-semibold">
                        {totalGoalSessions}
                        <span className="ml-1 text-[11px] font-normal text-faint">sessions</span>
                      </p>
                    </div>
                    <div className="p-4">
                      <p className="mono-label">Weekly ceiling</p>
                      <p className="font-num mt-2 text-2xl font-semibold">
                        {Math.floor(totalWeeklyCapacity / 60)}
                        <span className="ml-1 text-[11px] font-normal text-faint">
                          h {totalWeeklyCapacity % 60}m
                        </span>
                      </p>
                    </div>
                    <div className="border-t border-line p-4">
                      <p className="mono-label">Study days</p>
                      <p className="mt-2 text-[13px] font-medium">
                        {draft.preferredStudyDays
                          .slice()
                          .sort()
                          .map((day) => WEEKDAY_SHORT[day].slice(0, 2))
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="border-t border-line p-4">
                      <p className="mono-label">Rest day</p>
                      <p className="mt-2 text-[13px] font-medium">
                        {draft.weeklyRestDay === null
                          ? 'Flexible'
                          : WEEKDAY_SHORT[draft.weeklyRestDay]}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-surface/60 px-4 py-3.5">
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-fg">What gets created:</span> four subject
                    areas, editable topic lists, and your planner defaults. Everything else — tasks,
                    homework, projects, SAT practice, scores — starts empty and belongs to you.
                  </p>
                </div>

                <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-faint">
                  <span className="mt-0.5 flex size-4 items-center justify-center rounded border border-lime/30 bg-lime/10 text-lime">
                    <Check className="size-3" />
                  </span>
                  I understand this workspace is protected only by my Firebase security rules and
                  should not be shared publicly.
                </label>
              </section>
            ) : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-[12px] leading-relaxed text-danger">
              {error}
            </div>
          ) : null}

          <footer className="mt-8 flex items-center gap-2 border-t border-line pt-5">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((current) => current - 1)} disabled={saving}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            ) : (
              <span className="flex items-center gap-2 text-[10.5px] text-faint">
                <span className="size-1.5 rounded-full bg-lime/60 pulse-dot" />
                Live Firebase workspace
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint sm:block">
                {step + 1} / {STEPS.length}
              </span>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" onClick={next} className="min-w-28">
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={finish}
                  disabled={saving}
                  className="min-w-40"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
                  {saving ? 'Building workspace' : 'Enter LOCK IN'}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}
