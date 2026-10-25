export type DateKey = string
/** Local wall-clock time in 24-hour `HH:mm` form. */
export type LocalTime = string
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type MissionType =
  | 'learn'
  | 'activeRecall'
  | 'practice'
  | 'review'
  | 'mockExam'
  | 'other'
export type MissionStatus =
  | 'inbox'
  | 'planned'
  | 'inProgress'
  | 'completed'
  | 'skipped'
  | 'deferred'
export type AssignmentStatus =
  | 'inbox'
  | 'planned'
  | 'inProgress'
  | 'completed'
  | 'submitted'
  | 'deferred'
export type ProjectStatus = 'notStarted' | 'inProgress' | 'waiting' | 'completed'
export type MilestoneStatus = 'notStarted' | 'inProgress' | 'completed' | 'skipped'
export type CalendarEventType =
  | 'study'
  | 'homework'
  | 'project'
  | 'personal'
  | 'rest'
  | 'school'
  | 'break'
export type CalendarEventStatus = 'planned' | 'completed' | 'skipped' | 'canceled'
export type LinkedEntityType =
  | 'mission'
  | 'assignment'
  | 'milestone'
  | 'personalBlock'
  | 'rest'
  | null
export type CalendarView = 'month' | 'week' | 'day' | 'agenda'
export type WorkloadMode = 'light' | 'normal' | 'intensive'
export type WeekendMode = 'normal' | 'light' | 'rest'
export type EnergyLevel = 'low' | 'normal' | 'high'
export type TopicStage = 'notStarted' | 'learning' | 'review' | 'confident'
export type InsightRange = '7d' | '30d' | '90d' | 'all'
export type StreakQualification = 'meaningful' | 'minutes' | 'completions'
export type ActivityKind =
  | 'mission'
  | 'assignment'
  | 'milestone'
  | 'studyBlock'
  | 'practice'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export type RecurrenceFrequency = 'daily' | 'weekly'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number
  /** Used for weekly recurrence. Empty means the weekday of startsOn. */
  weekdays: Weekday[]
  /** ISO date key after which no new occurrences are generated. */
  until: DateKey | null
}

export interface DefaultDurations {
  mission: number
  assignmentBlock: number
  milestoneBlock: number
  personalBlock: number
  review: number
  mockExam: number
}

export interface CalendarPreferences {
  defaultView: CalendarView
  showWeekends: boolean
  showCompleted: boolean
  showAllDay: boolean
  hidePastEvents: boolean
}

export interface StreakRules {
  qualification: StreakQualification
  minimumMinutes: number
  minimumCompletions: number
  separateProductivityStreak: boolean
  preserveScheduledRestDays: boolean
  includeHomework: boolean
  includeProjectMilestones: boolean
}

export interface ReminderSettings {
  inAppEnabled: boolean
  dueSoonDays: number
  browserNotifications: boolean
  dailyNudgeEnabled: boolean
  dailyNudgeTime: LocalTime
}

export interface WorkspaceSettings {
  schemaVersion: number
  workspaceName: string
  timezone: string
  locale: string
  weekStartsOn: Weekday
  targetSatDate: DateKey | null
  preferredStudyDays: Weekday[]
  unavailableDays: Weekday[]
  weekdayCapacityMinutes: number
  weekendCapacityMinutes: number
  lighterDay: Weekday | null
  weeklyRestDay: Weekday | null
  weekendMode: WeekendMode
  weeklyGoals: Record<string, number>
  defaultDurations: DefaultDurations
  calendar: CalendarPreferences
  streakRules: StreakRules
  reminders: ReminderSettings
  theme: 'dark'
  onboardingCompletedAt: Date | null
  setupSkipped: boolean
  seedVersion: number
  createdAt: Date
  updatedAt: Date
}

export type SubjectType = 'sat' | 'ap' | 'school' | 'other'

export interface Subject {
  id: string
  name: string
  type: SubjectType
  color: string
  icon: string
  active: boolean
  examDate: DateKey | null
  weeklyTarget: number
  order: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Topic {
  id: string
  subjectId: string
  name: string
  group: string | null
  order: number
  stage: TopicStage
  notes: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Mission {
  id: string
  title: string
  subjectId: string
  topicId: string | null
  description: string
  missionType: MissionType
  estimatedMinutes: number
  difficulty: 1 | 2 | 3 | 4 | 5
  priority: Priority
  plannedDate: DateKey | null
  dueDate: DateKey | null
  status: MissionStatus
  recurrenceRule: RecurrenceRule | null
  checklist: ChecklistItem[]
  resourceLinks: string[]
  notes: string
  completionSummary: string
  confidence: 1 | 2 | 3 | 4 | 5 | null
  practiceAttempted: number | null
  practiceCorrect: number | null
  actualMinutes: number | null
  reviewAgainDate: DateKey | null
  origin: 'manual' | 'recurring' | 'suggested' | 'projectMilestone'
  seriesId: string | null
  occurrenceDate: DateKey | null
  plannedEventId: string | null
  completionActivityId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export interface Assignment {
  id: string
  title: string
  description: string
  course: string
  teacher: string
  assignedDate: DateKey | null
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  estimatedMinutes: number
  priority: Priority
  status: AssignmentStatus
  checklist: ChecklistItem[]
  resourceLinks: string[]
  notes: string
  actualMinutes: number | null
  completionActivityId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  submittedAt: Date | null
}

export interface Project {
  id: string
  title: string
  description: string
  course: string
  subjectId: string | null
  priority: Priority
  assignedDate: DateKey | null
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  estimatedMinutes: number
  status: ProjectStatus
  notes: string
  resourceLinks: string[]
  finalSubmissionLink: string
  order: number
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export interface Milestone {
  id: string
  projectId: string
  title: string
  description: string
  plannedDate: DateKey | null
  dueDate: DateKey | null
  estimatedMinutes: number
  status: MilestoneStatus
  checklist: ChecklistItem[]
  order: number
  completionActivityId: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}

export interface CalendarEvent {
  id: string
  linkedEntityType: LinkedEntityType
  linkedEntityId: string | null
  title: string
  dateKey: DateKey
  startTime: LocalTime | null
  endTime: LocalTime | null
  estimatedMinutes: number
  eventType: CalendarEventType
  subjectId: string | null
  status: CalendarEventStatus
  recurrenceRule: RecurrenceRule | null
  userEdited: boolean
  countsTowardCapacity: boolean
  notes: string
  seriesId: string | null
  occurrenceDate: DateKey | null
  completionActivityId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface EventTemplate {
  title: string
  eventType: CalendarEventType
  subjectId: string | null
  startTime: LocalTime | null
  endTime: LocalTime | null
  estimatedMinutes: number
  countsTowardCapacity: boolean
  notes: string
  linkedEntityType: LinkedEntityType
  linkedEntityId: string | null
}

export interface MissionTemplate {
  title: string
  subjectId: string
  topicId: string | null
  description: string
  missionType: MissionType
  estimatedMinutes: number
  difficulty: 1 | 2 | 3 | 4 | 5
  priority: Priority
  startTime: LocalTime | null
  endTime: LocalTime | null
}

/** A bounded source of truth for a recurring event or mission series. */
export interface RecurrenceSeries {
  id: string
  ownerType: 'calendarEvent' | 'mission'
  startsOn: DateKey
  rule: RecurrenceRule
  timezone: string
  eventTemplate: EventTemplate | null
  missionTemplate: MissionTemplate | null
  materializedThrough: DateKey | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  entityType: 'mission' | 'assignment' | 'milestone' | 'calendarEvent' | 'practice'
  entityId: string
  entityTitle: string
  subjectId: string | null
  dateKey: DateKey
  occurredAt: Date
  minutes: number
  meaningful: boolean
  confidence: number | null
  practiceAttempted: number | null
  practiceCorrect: number | null
  reversedAt: Date | null
  reversalReason: string
  createdAt: Date
  updatedAt: Date
}

export interface DailyCheckIn {
  id: string
  dateKey: DateKey
  energy: EnergyLevel | null
  workloadMode: 'normal' | 'lowEnergy' | 'rest'
  reflection: string
  createdAt: Date
  updatedAt: Date
}

export interface WeeklyReview {
  id: string
  weekStartDate: DateKey
  weekEndDate: DateKey
  wins: string
  missed: string
  weakTopics: string
  adjustments: string
  workloadNextWeek: WorkloadMode
  completedHomework: number
  completedMissions: number
  studyMinutes: number
  createdAt: Date
  updatedAt: Date
}

export interface PracticeRecord {
  id: string
  dateKey: DateKey
  recordType: 'fullTest' | 'section' | 'questions'
  source: string
  section: 'math' | 'readingWriting' | 'mixed'
  attempted: number
  correct: number
  totalScore: number | null
  mathScore: number | null
  readingWritingScore: number | null
  minutes: number
  notes: string
  activityId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Mistake {
  id: string
  topicId: string | null
  skill: string
  questionType: string
  questionRef: string
  whyWrong: string
  correctReasoning: string
  nextReviewDate: DateKey | null
  status: 'open' | 'reviewed' | 'mastered'
  createdAt: Date
  updatedAt: Date
  reviewedAt: Date | null
}

export interface InboxItem {
  id: string
  title: string
  notes: string
  convertedAt: Date | null
  convertedEntityType: 'mission' | 'assignment' | 'project' | null
  convertedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Achievement {
  id: string
  title: string
  description: string
  earnedAt: Date
  dateKey: DateKey
  createdAt: Date
  updatedAt: Date
}

export interface WorkspaceCollections {
  subjects: Subject[]
  topics: Topic[]
  missions: Mission[]
  assignments: Assignment[]
  projects: Project[]
  milestones: Milestone[]
  calendarEvents: CalendarEvent[]
  recurrenceSeries: RecurrenceSeries[]
  activityEvents: ActivityEvent[]
  checkIns: DailyCheckIn[]
  weeklyReviews: WeeklyReview[]
  practiceRecords: PracticeRecord[]
  mistakes: Mistake[]
  inboxItems: InboxItem[]
  achievements: Achievement[]
}

export interface TaskDeadline {
  entityType: 'mission' | 'assignment' | 'milestone' | 'project'
  entityId: string
  title: string
  dateKey: DateKey
  priority: Priority
  subjectId: string | null
}

export interface LinkedTaskRef {
  entityType: 'mission' | 'assignment' | 'milestone' | 'project'
  entityId: string
  title: string
  dueDate: DateKey | null
  targetFinishDate: DateKey | null
  priority: Priority
  subjectId: string | null
  status: string
  href: string
}
