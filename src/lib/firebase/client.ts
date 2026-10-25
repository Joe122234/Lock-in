import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

// Firebase web configuration is public by design; Firestore rules are the
// actual security boundary. These defaults let the app run with no local
// environment setup. Any VITE_FIREBASE_* value still overrides them.
const defaultFirebaseConfig = {
  apiKey: 'AIzaSyApRAVF2rJUpOfVy506IKdsFhbcfjXZvME',
  authDomain: 'lock-in-ap.firebaseapp.com',
  projectId: 'lock-in-ap',
  storageBucket: 'lock-in-ap.firebasestorage.app',
  messagingSenderId: '622954100506',
  appId: '1:622954100506:web:b1ef7408071eef834a1ea3',
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || defaultFirebaseConfig.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || defaultFirebaseConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ||
    defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || defaultFirebaseConfig.appId,
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
      'Firebase is not configured. Check src/lib/firebase/client.ts or the optional VITE_FIREBASE_* environment overrides.',
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
