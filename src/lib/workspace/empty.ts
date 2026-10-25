import type { WorkspaceCollections } from '@/types/domain'

export const EMPTY_COLLECTIONS: WorkspaceCollections = {
  subjects: [],
  topics: [],
  missions: [],
  assignments: [],
  projects: [],
  milestones: [],
  calendarEvents: [],
  recurrenceSeries: [],
  activityEvents: [],
  checkIns: [],
  weeklyReviews: [],
  practiceRecords: [],
  mistakes: [],
  inboxItems: [],
  achievements: [],
}

export const COLLECTION_KEYS = [
  'subjects',
  'topics',
  'missions',
  'assignments',
  'projects',
  'milestones',
  'calendarEvents',
  'recurrenceSeries',
  'activityEvents',
  'checkIns',
  'weeklyReviews',
  'practiceRecords',
  'mistakes',
  'inboxItems',
  'achievements',
] as const satisfies ReadonlyArray<keyof WorkspaceCollections>
