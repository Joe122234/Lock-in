import type {
  AssignmentStatus,
  CalendarEventType,
  CalendarView,
  MissionStatus,
  MissionType,
  Priority,
  ProjectStatus,
  Subject,
  SubjectType,
  Topic,
  Weekday,
  WeekendMode,
  WorkspaceSettings,
} from '@/types/domain'
import { getBrowserLocale, getBrowserTimeZone } from '@/lib/dates'

export const APP_NAME = 'LOCK IN'
export const SCHEMA_VERSION = 1
export const SEED_VERSION = 1

export const SUBJECT_COLORS = {
  sat: '#c6f74a',
  comparative: '#62a8ff',
  world: '#f4b860',
  macro: '#b79cff',
} as const

export const DEFAULT_WEEKLY_GOALS: Record<string, number> = {
  sat: 3,
  'ap-comparative': 1,
  'ap-world': 1,
  'ap-macro': 1,
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  learn: 'Learn',
  activeRecall: 'Active recall',
  practice: 'Practice',
  review: 'Review',
  mockExam: 'Mock exam',
  other: 'Other',
}

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  inbox: 'Inbox',
  planned: 'Planned',
  inProgress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
  deferred: 'Deferred',
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  inbox: 'Inbox',
  planned: 'Planned',
  inProgress: 'In progress',
  completed: 'Completed',
  submitted: 'Submitted',
  deferred: 'Deferred',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  notStarted: 'Not started',
  inProgress: 'In progress',
  waiting: 'Waiting / blocked',
  completed: 'Completed',
}

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  sat: 'SAT prep',
  ap: 'AP course',
  school: 'School course',
  other: 'Other',
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  study: 'Study',
  homework: 'Homework',
  project: 'Project',
  personal: 'Personal',
  rest: 'Rest',
  school: 'School',
  break: 'Break',
}

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
}

export const WEEKEND_MODE_LABELS: Record<WeekendMode, string> = {
  normal: 'Normal workdays',
  light: 'Lighter weekend',
  rest: 'Rest at weekends',
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

export const DEFAULT_TIMEZONE_FALLBACK = 'UTC'

export function subjectColorFor(subjectId: string | null, subjects: Subject[]): string {
  if (!subjectId) return '#93a09a'
  return subjects.find((subject) => subject.id === subjectId)?.color ?? '#93a09a'
}

export function createDefaultSettings(options?: {
  timezone?: string
  locale?: string
  onboardingCompletedAt?: Date | null
  setupSkipped?: boolean
}): WorkspaceSettings {
  const now = new Date()
  const timezone = options?.timezone ?? getBrowserTimeZone() ?? DEFAULT_TIMEZONE_FALLBACK
  return {
    schemaVersion: SCHEMA_VERSION,
    workspaceName: APP_NAME,
    timezone,
    locale: options?.locale ?? getBrowserLocale(),
    weekStartsOn: 1,
    targetSatDate: null,
    preferredStudyDays: [1, 2, 3, 4, 5, 6],
    unavailableDays: [],
    weekdayCapacityMinutes: 120,
    weekendCapacityMinutes: 150,
    lighterDay: 6,
    weeklyRestDay: 0,
    weekendMode: 'light',
    weeklyGoals: { ...DEFAULT_WEEKLY_GOALS },
    defaultDurations: {
      mission: 30,
      assignmentBlock: 45,
      milestoneBlock: 60,
      personalBlock: 30,
      review: 20,
      mockExam: 180,
    },
    calendar: {
      defaultView: 'month',
      showWeekends: true,
      showCompleted: true,
      showAllDay: true,
      hidePastEvents: false,
    },
    streakRules: {
      qualification: 'meaningful',
      minimumMinutes: 20,
      minimumCompletions: 1,
      separateProductivityStreak: true,
      preserveScheduledRestDays: true,
      includeHomework: true,
      includeProjectMilestones: true,
    },
    reminders: {
      inAppEnabled: true,
      dueSoonDays: 3,
      browserNotifications: false,
      dailyNudgeEnabled: true,
      dailyNudgeTime: '18:00',
    },
    theme: 'dark',
    onboardingCompletedAt: options?.onboardingCompletedAt ?? null,
    setupSkipped: options?.setupSkipped ?? false,
    seedVersion: SEED_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

export function createSeedSubjects(now = new Date()): Subject[] {
  const base = {
    type: 'sat' as const,
    active: true,
    examDate: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  return [
    {
      ...base,
      id: 'sat',
      name: 'SAT Preparation',
      color: SUBJECT_COLORS.sat,
      icon: 'target',
      weeklyTarget: 3,
      order: 0,
    },
    {
      ...base,
      id: 'ap-comparative',
      name: 'AP Comparative Government',
      type: 'ap',
      color: SUBJECT_COLORS.comparative,
      icon: 'landmark',
      weeklyTarget: 1,
      order: 1,
    },
    {
      ...base,
      id: 'ap-world',
      name: 'AP World History',
      type: 'ap',
      color: SUBJECT_COLORS.world,
      icon: 'globe2',
      weeklyTarget: 1,
      order: 2,
    },
    {
      ...base,
      id: 'ap-macro',
      name: 'AP Macroeconomics',
      type: 'ap',
      color: SUBJECT_COLORS.macro,
      icon: 'trending-up',
      weeklyTarget: 1,
      order: 3,
    },
  ]
}

const SAT_TOPICS: Array<[string, string]> = [
  ['Linear equations & inequalities', 'Math'],
  ['Systems of equations', 'Math'],
  ['Functions & linear models', 'Math'],
  ['Quadratics & nonlinear equations', 'Math'],
  ['Ratios, rates & proportions', 'Math'],
  ['Percentages', 'Math'],
  ['Data & statistics', 'Math'],
  ['Probability', 'Math'],
  ['Geometry & trigonometry', 'Math'],
  ['Graphs & tables', 'Math'],
  ['Main ideas & details', 'Reading & Writing'],
  ['Inferences', 'Reading & Writing'],
  ['Command of evidence', 'Reading & Writing'],
  ['Words in context', 'Reading & Writing'],
  ['Text structure & purpose', 'Reading & Writing'],
  ['Cross-text connections', 'Reading & Writing'],
  ['Transitions', 'Reading & Writing'],
  ['Rhetorical synthesis', 'Reading & Writing'],
  ['Boundaries & sentence structure', 'Reading & Writing'],
  ['Punctuation & usage', 'Reading & Writing'],
]

const AP_COMPARATIVE_TOPICS = [
  'Political systems, regimes & governments',
  'Political institutions',
  'Political culture & participation',
  'Party & electoral systems / citizen organizations',
  'Political & economic changes & development',
]

const AP_WORLD_TOPICS = [
  'The global tapestry',
  'Networks of exchange',
  'Land-based empires',
  'Transoceanic interconnections',
  'Revolutions',
  'Consequences of industrialization',
  'Global conflict',
  'Cold War & decolonization',
  'Globalization',
]

const AP_MACRO_TOPICS = [
  'Basic economic concepts',
  'Economic indicators & the business cycle',
  'National income & price determination',
  'The financial sector',
  'Long-run consequences of stabilization policies',
  'Open economy: international trade & finance',
]

export function createSeedTopics(now = new Date()): Topic[] {
  const topics: Topic[] = []
  const add = (subjectId: string, name: string, group: string | null, order: number) => {
    const slug = name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    topics.push({
      id: `${subjectId}-${slug}`,
      subjectId,
      name,
      group,
      order,
      stage: 'notStarted',
      notes: '',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  SAT_TOPICS.forEach(([name, group], index) => add('sat', name, group, index))
  AP_COMPARATIVE_TOPICS.forEach((name, index) =>
    add('ap-comparative', name, 'Units 1–5', index),
  )
  AP_WORLD_TOPICS.forEach((name, index) => add('ap-world', name, 'Units 1–9', index))
  AP_MACRO_TOPICS.forEach((name, index) => add('ap-macro', name, 'Units 1–6', index))
  return topics
}

export const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  inbox: 'neutral',
  planned: 'info',
  inProgress: 'warning',
  completed: 'success',
  submitted: 'success',
  skipped: 'neutral',
  deferred: 'warning',
  notStarted: 'neutral',
  waiting: 'warning',
}

export const PRESET_SUBJECT_COLORS = [
  SUBJECT_COLORS.sat,
  SUBJECT_COLORS.comparative,
  SUBJECT_COLORS.world,
  SUBJECT_COLORS.macro,
  '#ff7a8a',
  '#64d9c4',
]
