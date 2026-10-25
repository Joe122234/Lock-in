import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from './client'
import {
  COLLECTIONS,
  collectionPath,
  collectionRef,
  documentRef,
  settingsRef,
  type CollectionKey,
} from './paths'
import { syncMonitor, trackedWrite } from './sync'

export function serializeDocument<T>(value: T): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) {
    return value.map((item) => serializeDocument(item)).filter((item) => item !== undefined)
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue
      const serialized = serializeDocument(entry)
      if (serialized !== undefined) result[key] = serialized
    }
    return result
  }
  return value
}

function deserializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate()
  if (Array.isArray(value)) return value.map(deserializeValue)
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        deserializeValue(entry),
      ]),
    )
  }
  return value
}

export function readDocument<T>(snapshot: QueryDocumentSnapshot | DocumentSnapshot): T {
  const data = snapshot.data({ serverTimestamps: 'estimate' })
  return {
    ...(data ? (deserializeValue(data) as Record<string, unknown>) : {}),
    id: snapshot.id,
  } as T
}

export interface WriteContext {
  createdAt: Date | null
  updatedAt: Date | null
}

export async function createDocument<T>(
  key: CollectionKey,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & Partial<WriteContext>,
  explicitId?: string,
): Promise<string> {
  const db = getDb()
  const ref = explicitId ? documentRef(db, key, explicitId) : doc(collectionRef(db, key))
  return trackedWrite(async () => {
    const payload = serializeDocument(data) as Record<string, unknown>
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  })
}

export async function updateDocument<T extends object>(
  key: CollectionKey,
  id: string,
  patch: Partial<T>,
): Promise<void> {
  const db = getDb()
  return trackedWrite(async () => {
    const payload = serializeDocument(patch) as Record<string, unknown>
    await updateDoc(documentRef(db, key, id), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function overwriteDocument<T extends object>(
  key: CollectionKey,
  id: string,
  data: T,
): Promise<void> {
  const db = getDb()
  return trackedWrite(async () => {
    await setDoc(documentRef(db, key, id), serializeDocument(data) as DocumentData)
  })
}

export function subscribeCollection<T>(
  key: CollectionKey,
  onData: (items: T[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getDb()
  syncMonitor.beginRead()
  let active = true
  const unsubscribe = onSnapshot(
    collectionRef(db, key),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active) return
      const items = snapshot.docs.map((entry) => readDocument<T>(entry))
      onData(items)
      if (!snapshot.metadata.fromCache) {
        syncMonitor.markSynced()
      }
    },
    (error) => {
      if (!active) return
      syncMonitor.fail(error.message)
      onError(error)
    },
  )
  syncMonitor.endRead()
  return () => {
    active = false
    unsubscribe()
  }
}

export function subscribeSettings(
  onData: (settings: Record<string, unknown> | null) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getDb()
  syncMonitor.beginRead()
  let active = true
  const unsubscribe = onSnapshot(
    settingsRef(db),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active) return
      onData(
        snapshot.exists()
          ? (deserializeValue(snapshot.data({ serverTimestamps: 'estimate' })) as Record<
              string,
              unknown
            >)
          : null,
      )
      if (!snapshot.metadata.fromCache) syncMonitor.markSynced()
    },
    (error) => {
      if (!active) return
      syncMonitor.fail(error.message)
      onError(error)
    },
  )
  syncMonitor.endRead()
  return () => {
    active = false
    unsubscribe()
  }
}

export async function readAllCollectionsRaw(): Promise<Record<string, Array<Record<string, unknown>>>> {
  const db = getDb()
  const result: Record<string, Array<Record<string, unknown>>> = {}
  await Promise.all(
    Object.entries(COLLECTIONS).map(async ([key, _collectionName]) => {
      const snapshot = await getDocs(collection(db, collectionPath(key as CollectionKey)))
      result[key] = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...(deserializeValue(entry.data()) as Record<string, unknown>),
      }))
    }),
  )
  return result
}

export async function readSettingsRaw(): Promise<Record<string, unknown> | null> {
  const db: Firestore = getDb()
  const snapshot = await getDoc(settingsRef(db))
  if (!snapshot.exists()) return null
  return deserializeValue(snapshot.data()) as Record<string, unknown>
}
