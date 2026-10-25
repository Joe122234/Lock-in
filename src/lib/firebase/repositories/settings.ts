import { runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { Subject, Topic, WorkspaceSettings } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { documentRef, settingsRef } from '@/lib/firebase/paths'
import { serializeDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'
import { createSeedSubjects, createSeedTopics } from '@/lib/constants'

export interface InitializeWorkspaceOptions {
  seed: boolean
  subjects?: Subject[]
  topics?: Topic[]
}

/**
 * Atomically creates the first workspace settings document and the starter
 * taxonomy. A second call is a no-op, so StrictMode, reloads, or retries can
 * never duplicate seed records.
 */
export async function initializeWorkspace(
  settings: WorkspaceSettings,
  options: InitializeWorkspaceOptions = { seed: true },
): Promise<{ created: boolean }> {
  const db = getDb()
  return trackedWrite(() =>
    runTransaction(db, async (transaction) => {
      const settingsSnapshot = await transaction.get(settingsRef(db))
      if (settingsSnapshot.exists()) return { created: false }

      const now = new Date()
      const finalSettings: WorkspaceSettings = {
        ...settings,
        onboardingCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      const payload = serializeDocument(finalSettings) as Record<string, unknown>
      transaction.set(settingsRef(db), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      if (options.seed) {
        const subjects =
          options.subjects ??
          createSeedSubjects(now).map((subject) => ({
            ...subject,
            weeklyTarget: settings.weeklyGoals[subject.id] ?? subject.weeklyTarget,
          }))
        const topics = options.topics ?? createSeedTopics(now)
        subjects.forEach((subject) => {
          const { id, ...data } = subject
          transaction.set(documentRef(db, 'subjects', id), {
            ...(serializeDocument(data) as Record<string, unknown>),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        })
        topics.forEach((topic) => {
          const { id, ...data } = topic
          transaction.set(documentRef(db, 'topics', id), {
            ...(serializeDocument(data) as Record<string, unknown>),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        })
      }
      return { created: true }
    }),
  )
}

export async function saveWorkspaceSettings(
  settings: WorkspaceSettings,
  subjects: Subject[],
): Promise<void> {
  const db = getDb()
  const updatable: Partial<WorkspaceSettings> = { ...settings }
  delete updatable.createdAt
  delete updatable.updatedAt
  const payload = serializeDocument(updatable) as Record<string, unknown>
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.set(
      settingsRef(db),
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    for (const subject of subjects) {
      const target = settings.weeklyGoals[subject.id]
      if (typeof target === 'number' && subject.weeklyTarget !== target) {
        batch.update(documentRef(db, 'subjects', subject.id), {
          weeklyTarget: target,
          updatedAt: serverTimestamp(),
        })
      }
    }
    await batch.commit()
  })
}

export async function upsertSettingsFields(
  patch: Partial<WorkspaceSettings>,
): Promise<void> {
  const db = getDb()
  const serializable: Partial<WorkspaceSettings> = { ...patch }
  delete serializable.createdAt
  delete serializable.updatedAt
  const payload = serializeDocument(serializable) as Record<string, unknown>
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    batch.set(settingsRef(db), { ...payload, updatedAt: serverTimestamp() }, { merge: true })
    await batch.commit()
  })
}

/**
 * Seeds the starter subject/topic taxonomy for a workspace whose settings
 * document exists but which has no subjects yet (for example, an interrupted
 * first setup). Deterministic seed ids make this safe to retry.
 */
export async function seedTaxonomy(subjects: Subject[], topics: Topic[]): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    subjects.forEach((subject) => {
      const { id, ...data } = subject
      batch.set(
        documentRef(db, 'subjects', id),
        {
          ...(serializeDocument(data) as Record<string, unknown>),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })
    topics.forEach((topic) => {
      const { id, ...data } = topic
      batch.set(
        documentRef(db, 'topics', id),
        {
          ...(serializeDocument(data) as Record<string, unknown>),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })
    await batch.commit()
  })
}
