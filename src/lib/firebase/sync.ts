export type SyncPhase = 'idle' | 'loading' | 'saving' | 'synced' | 'offline' | 'error'

export interface SyncSnapshot {
  phase: SyncPhase
  online: boolean
  lastSyncedAt: Date | null
  errorMessage: string | null
}

type Listener = () => void

class SyncMonitor {
  private state: SyncSnapshot = {
    phase: 'idle',
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSyncedAt: null,
    errorMessage: null,
  }

  private listeners = new Set<Listener>()
  private activeReads = 0
  private activeWrites = 0

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SyncSnapshot => this.state

  private emit(patch: Partial<SyncSnapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  private derivePhase() {
    if (this.state.phase === 'error') return
    if (!this.state.online) {
      this.emit({ phase: 'offline' })
      return
    }
    if (this.activeWrites > 0) {
      this.emit({ phase: 'saving' })
      return
    }
    if (this.activeReads > 0 && !this.state.lastSyncedAt) {
      this.emit({ phase: 'loading' })
      return
    }
    if (this.state.lastSyncedAt) {
      this.emit({ phase: 'synced' })
    }
  }

  setOnline = (online: boolean) => {
    this.emit({ online, phase: online ? 'loading' : 'offline' })
    if (online) this.derivePhase()
  }

  markSynced = (date = new Date()) => {
    this.emit({ lastSyncedAt: date, errorMessage: null })
    if (this.state.phase === 'error') this.emit({ phase: 'synced' })
    this.derivePhase()
  }

  beginRead = () => {
    this.activeReads += 1
    if (this.state.phase === 'idle') this.emit({ phase: 'loading' })
  }

  endRead = () => {
    this.activeReads = Math.max(0, this.activeReads - 1)
    this.derivePhase()
  }

  beginWrite = () => {
    this.activeWrites += 1
    this.emit({ phase: 'saving', errorMessage: null })
  }

  endWrite = () => {
    this.activeWrites = Math.max(0, this.activeWrites - 1)
    this.derivePhase()
  }

  fail = (message: string) => {
    this.emit({ phase: 'error', errorMessage: message })
  }

  clearError = () => {
    this.emit({ errorMessage: null })
    this.derivePhase()
  }
}

export const syncMonitor = new SyncMonitor()

export function describeFirestoreError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code)
    if (code.includes('permission-denied')) {
      return 'Firestore denied access. Publish the workspace rules described in the README.'
    }
    if (code.includes('unavailable')) {
      return 'Firestore is unreachable right now. Your edits will sync when the connection returns.'
    }
    if (code.includes('failed-precondition')) {
      return 'Firestore needs an index for this query. Check the browser console and firestore.indexes.json.'
    }
    if (code.includes('resource-exhausted')) {
      return 'Firestore quota reached. Try again later.'
    }
    if (code.includes('unauthenticated')) {
      return 'Firestore rejected the request. Confirm the API key and security rules.'
    }
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong while talking to Firestore.'
}

export async function trackedWrite<T>(operation: () => Promise<T>): Promise<T> {
  syncMonitor.beginWrite()
  try {
    return await operation()
  } catch (error) {
    syncMonitor.fail(describeFirestoreError(error))
    throw error
  } finally {
    syncMonitor.endWrite()
  }
}
