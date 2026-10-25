import { z } from 'zod'
import {
  collection,
  deleteDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { WorkspaceSettings } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import {
  COLLECTIONS,
  collectionPath,
  documentRef,
  settingsRef,
  WORKSPACE_ID,
  type CollectionKey,
} from '@/lib/firebase/paths'
import {
  readAllCollectionsRaw,
  readSettingsRaw,
  serializeDocument,
} from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'
import { isValidDateKey, isValidLocalTime } from '@/lib/dates'

export const BACKUP_VERSION = 1
export const BACKUP_APP = 'LOCK IN'

type RawRecord = Record<string, unknown>

export interface BackupPayload {
  app: string
  version: number
  exportedAt: string
  workspaceId: string
  settings: RawRecord
  collections: Record<CollectionKey, RawRecord[]>
}

export interface BackupSummary {
  totalDocuments: number
  perCollection: Record<string, number>
  hasSettings: boolean
  exportedAt: string | null
  workspaceMatches: boolean
}

export interface BackupValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  payload: BackupPayload | null
  summary: BackupSummary | null
}

const timestampFields = new Set([
  'createdAt',
  'updatedAt',
  'completedAt',
  'submittedAt',
  'occurredAt',
  'reversedAt',
  'reviewedAt',
  'earnedAt',
  'convertedAt',
  'onboardingCompletedAt',
])

const dateKeyFields = new Set([
  'dateKey',
  'dueDate',
  'targetFinishDate',
  'plannedDate',
  'assignedDate',
  'examDate',
  'nextReviewDate',
  'reviewAgainDate',
  'weekStartDate',
  'weekEndDate',
  'startsOn',
  'materializedThrough',
  'occurrenceDate',
])

const timeFields = new Set(['startTime', 'endTime', 'dailyNudgeTime'])

const envelopeSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().positive(),
  exportedAt: z.string().min(1),
  workspaceId: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
  collections: z.record(z.string(), z.unknown()),
})

function normalizeRecord(record: RawRecord, errors: string[], context: string): RawRecord {
  const result: RawRecord = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue
    if (timestampFields.has(key)) {
      if (value === null) {
        result[key] = null
      } else if (typeof value === 'string') {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) errors.push(`${context}: invalid timestamp for ${key}`)
        else result[key] = date
      } else if (value instanceof Date) {
        result[key] = value
      } else {
        errors.push(`${context}: expected ISO date for ${key}`)
      }
      continue
    }
    if (dateKeyFields.has(key)) {
      if (value === null) {
        result[key] = null
      } else if (typeof value === 'string' && isValidDateKey(value)) {
        result[key] = value
      } else {
        errors.push(`${context}: invalid YYYY-MM-DD date for ${key}`)
      }
      continue
    }
    if (timeFields.has(key)) {
      if (value === null) result[key] = null
      else if (typeof value === 'string' && isValidLocalTime(value)) result[key] = value
      else errors.push(`${context}: invalid local time for ${key}`)
      continue
    }
    if (Array.isArray(value)) {
      result[key] = value.map((entry, index) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          return normalizeRecord(entry as RawRecord, errors, `${context}.${key}[${index}]`)
        }
        return entry
      })
      continue
    }
    if (value && typeof value === 'object' && value.constructor === Object) {
      result[key] = normalizeRecord(value as RawRecord, errors, `${context}.${key}`)
      continue
    }
    result[key] = value
  }
  return result
}

export function validateBackupPayload(input: unknown): BackupValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const parsed = envelopeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      warnings,
      payload: null,
      summary: null,
    }
  }
  if (parsed.data.version !== BACKUP_VERSION) {
    errors.push(
      `Unsupported backup version ${parsed.data.version}. This app imports version ${BACKUP_VERSION}.`,
    )
  }

  const rawCollections = parsed.data.collections as Record<string, unknown>
  const knownKeys = Object.keys(COLLECTIONS) as CollectionKey[]
  const collections = {} as Record<CollectionKey, RawRecord[]>
  for (const key of knownKeys) {
    const value = rawCollections[key]
    if (value === undefined) {
      collections[key] = []
      warnings.push(`Backup has no "${key}" collection; it will be treated as empty.`)
      continue
    }
    if (!Array.isArray(value)) {
      errors.push(`collections.${key} must be an array.`)
      collections[key] = []
      continue
    }
    const normalized: RawRecord[] = []
    value.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`collections.${key}[${index}] is not an object.`)
        return
      }
      const record = entry as RawRecord
      if (typeof record.id !== 'string' || !record.id.trim()) {
        errors.push(`collections.${key}[${index}] is missing a document id.`)
        return
      }
      if (record.id.includes('/')) {
        errors.push(`collections.${key}[${index}] has an unsafe document id.`)
        return
      }
      normalized.push(normalizeRecord(record, errors, `${key}[${index}]`))
    })
    collections[key] = normalized
  }

  for (const key of Object.keys(rawCollections)) {
    if (!(key in COLLECTIONS)) warnings.push(`Unknown collection "${key}" was ignored.`)
  }

  for (const key of ['subjects', 'topics', 'missions', 'assignments', 'projects'] as const) {
    if (collections[key].length === 0) {
      warnings.push(`The backup contains no ${key}.`)
    }
  }

  const settings = normalizeRecord(parsed.data.settings, errors, 'settings')
  for (const required of ['timezone', 'locale', 'weekStartsOn', 'weeklyGoals']) {
    if (settings[required] === undefined) errors.push(`settings.${required} is required.`)
  }

  const perCollection = Object.fromEntries(
    knownKeys.map((key) => [key, collections[key].length]),
  ) as Record<string, number>
  const summary: BackupSummary = {
    totalDocuments: Object.values(perCollection).reduce((sum, count) => sum + count, 0),
    perCollection,
    hasSettings: Boolean(settings),
    exportedAt: parsed.data.exportedAt,
    workspaceMatches: parsed.data.workspaceId === WORKSPACE_ID,
  }
  if (!summary.workspaceMatches) {
    warnings.push(
      `This backup was exported from workspace "${parsed.data.workspaceId}", not "${WORKSPACE_ID}".`,
    )
  }

  const payload: BackupPayload = {
    app: parsed.data.app,
    version: parsed.data.version,
    exportedAt: parsed.data.exportedAt,
    workspaceId: parsed.data.workspaceId,
    settings,
    collections,
  }

  return { ok: errors.length === 0, errors, warnings, payload, summary }
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const [collections, settings] = await Promise.all([
    readAllCollectionsRaw(),
    readSettingsRaw(),
  ])
  if (!settings) throw new Error('Workspace settings are missing; nothing safe to export.')
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspaceId: WORKSPACE_ID,
    settings,
    collections: collections as Record<CollectionKey, RawRecord[]>,
  }
}

export async function downloadBackupJson(): Promise<void> {
  const payload = await createBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `lock-in-backup-${stamp}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function deleteAllWorkspaceDocuments(includeSettings = true): Promise<void> {
  const db = getDb()
  const keys = Object.keys(COLLECTIONS) as CollectionKey[]
  for (const key of keys) {
    const snapshot = await getDocs(collection(db, collectionPath(key)))
    for (let index = 0; index < snapshot.docs.length; index += 400) {
      const batch = writeBatch(db)
      snapshot.docs.slice(index, index + 400).forEach((entry) => batch.delete(entry.ref))
      await batch.commit()
    }
  }
  if (includeSettings) await deleteDoc(settingsRef(getDb()))
}

export async function importBackup(
  payload: BackupPayload,
  mode: 'merge' | 'replace',
): Promise<{ written: number }> {
  const validation = validateBackupPayload(payload)
  if (!validation.ok || !validation.payload) {
    throw new Error(validation.errors.join(' ') || 'The backup is invalid.')
  }
  const clean = validation.payload
  return trackedWrite(async () => {
    const db = getDb()
    if (mode === 'replace') {
      // Keep the settings document alive until its replacement is written.
      // Otherwise live subscribers would briefly interpret the workspace as
      // uninitialized and drop the user back into onboarding mid-import.
      await deleteAllWorkspaceDocuments(false)
    }
    let written = 0
    const keys = Object.keys(COLLECTIONS) as CollectionKey[]
    const operations: Array<{ key: CollectionKey; id: string; data: RawRecord }> = []
    for (const key of keys) {
      for (const record of clean.collections[key]) {
        const { id, ...data } = record
        if (typeof id !== 'string' || !id) continue
        operations.push({ key, id, data })
      }
    }
    for (let index = 0; index < operations.length; index += 400) {
      const batch = writeBatch(db)
      operations.slice(index, index + 400).forEach((operation) => {
        batch.set(
          documentRef(db, operation.key, operation.id),
          serializeDocument(operation.data) as Record<string, unknown>,
          { merge: mode === 'merge' },
        )
      })
      await batch.commit()
      written += Math.min(400, operations.length - index)
    }
    const settingsData = serializeDocument(clean.settings) as Record<string, unknown>
    await setDoc(
      settingsRef(db),
      {
        ...settingsData,
        updatedAt: serverTimestamp(),
      },
      { merge: mode === 'merge' },
    )
    return { written: written + 1 }
  })
}

export async function resetWorkspace(): Promise<void> {
  await trackedWrite(async () => {
    await deleteAllWorkspaceDocuments()
  })
}

export function summarizeSettings(settings: WorkspaceSettings | null): string {
  if (!settings) return 'No settings'
  return `${settings.workspaceName} · ${settings.timezone}`
}
