import { serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import type { Achievement } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { documentRef } from '@/lib/firebase/paths'
import { serializeDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export async function persistMissingAchievements(items: Achievement[]): Promise<void> {
  if (items.length === 0) return
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    items.forEach((achievement) => {
      const { id, ...data } = achievement
      batch.set(
        documentRef(db, 'achievements', id),
        {
          ...(serializeDocument(data) as Record<string, unknown>),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      )
    })
    await batch.commit()
  })
}

export async function ensureAchievement(achievement: Achievement): Promise<void> {
  const { id, ...data } = achievement
  await trackedWrite(async () => {
    await setDoc(
      documentRef(getDb(), 'achievements', id),
      {
        ...(serializeDocument(data) as Record<string, unknown>),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}
