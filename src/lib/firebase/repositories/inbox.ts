import {
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { InboxItem } from '@/types/domain'
import { getDb } from '@/lib/firebase/client'
import { collectionRef, documentRef } from '@/lib/firebase/paths'
import { serializeDocument } from '@/lib/firebase/firestore'
import { trackedWrite } from '@/lib/firebase/sync'

export async function createInboxItem(title: string, notes = ''): Promise<string> {
  const db = getDb()
  const ref = doc(collectionRef(db, 'inboxItems'))
  const item: Omit<InboxItem, 'id'> = {
    title: title.trim(),
    notes,
    convertedAt: null,
    convertedEntityType: null,
    convertedEntityId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await trackedWrite(async () => {
    await setDoc(ref, {
      ...(serializeDocument(item) as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function markInboxConverted(
  inboxId: string,
  entityType: NonNullable<InboxItem['convertedEntityType']>,
  entityId: string,
): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    const ref = documentRef(db, 'inboxItems', inboxId)
    await setDoc(
      ref,
      {
        convertedAt: serverTimestamp(),
        convertedEntityType: entityType,
        convertedEntityId: entityId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export async function updateInboxItem(inboxId: string, title: string, notes: string): Promise<void> {
  const db = getDb()
  await trackedWrite(async () => {
    await setDoc(
      documentRef(db, 'inboxItems', inboxId),
      { title: title.trim(), notes, updatedAt: serverTimestamp() },
      { merge: true },
    )
  })
}

export async function deleteInboxItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = getDb()
  await trackedWrite(async () => {
    const batch = writeBatch(db)
    ids.forEach((id) => {
      batch.delete(documentRef(db, 'inboxItems', id))
    })
    await batch.commit()
  })
}
