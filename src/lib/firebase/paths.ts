import { collection, doc, type Firestore } from 'firebase/firestore'

export const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID?.trim() || 'lock-in-personal'

export const COLLECTIONS = {
  subjects: 'subjects',
  topics: 'topics',
  missions: 'missions',
  assignments: 'assignments',
  projects: 'projects',
  milestones: 'milestones',
  calendarEvents: 'calendarEvents',
  recurrenceSeries: 'recurrenceSeries',
  activityEvents: 'activityEvents',
  checkIns: 'checkIns',
  weeklyReviews: 'weeklyReviews',
  practiceRecords: 'practiceRecords',
  mistakes: 'mistakes',
  inboxItems: 'inboxItems',
  achievements: 'achievements',
} as const

export type CollectionKey = keyof typeof COLLECTIONS

export const SETTINGS_DOC_ID = 'main'

export function collectionPath(key: CollectionKey): string {
  return `workspaces/${WORKSPACE_ID}/${COLLECTIONS[key]}`
}

export function settingsPath(): string {
  return `workspaces/${WORKSPACE_ID}/settings/${SETTINGS_DOC_ID}`
}

export function workspaceRef(db: Firestore) {
  return doc(db, 'workspaces', WORKSPACE_ID)
}

export function collectionRef(db: Firestore, key: CollectionKey) {
  return collection(db, collectionPath(key))
}

export function settingsRef(db: Firestore) {
  return doc(db, settingsPath())
}

export function documentRef(db: Firestore, key: CollectionKey, id: string) {
  return doc(db, collectionPath(key), id)
}
