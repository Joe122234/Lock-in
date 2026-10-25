import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.projectId,
  firebaseConfig.appId,
] as const

export const isFirebaseConfigured = requiredConfig.every((value) => Boolean(value))

export const firebaseProjectId = firebaseConfig.projectId
export const firebaseApiKey = firebaseConfig.apiKey
export const useFirebaseEmulator =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && isFirebaseConfigured

let app: FirebaseApp | null = null
let db: Firestore | null = null

function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Add the VITE_FIREBASE_* values to your local environment and reload the app.',
    )
  }
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

/**
 * Firestore's durable IndexedDB cache keeps edits available while offline and
 * shares pending writes across tabs. If a browser cannot initialize persistence,
 * fall back to a safe in-memory cache instead of leaving the app broken.
 */
export function getDb(): Firestore {
  if (!db) {
    const firebaseApp = getFirebaseApp()
    try {
      db = initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ignoreUndefinedProperties: true,
      })
    } catch (error) {
      console.warn('Persistent Firestore cache unavailable; using memory cache.', error)
      db = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
      })
    }
    if (useFirebaseEmulator) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
    }
  }
  return db
}
