import { createContext } from 'react'
import type { WorkspaceCollections, WorkspaceSettings } from '@/types/domain'
import type { SyncSnapshot } from '@/lib/firebase/sync'

export interface WorkspaceContextValue {
  settings: WorkspaceSettings | null
  collections: WorkspaceCollections
  today: string
  loading: boolean
  settingsSettled: boolean
  error: string | null
  permissionDenied: boolean
  configured: boolean
  sync: SyncSnapshot
  updateSettings: (patch: Partial<WorkspaceSettings>) => Promise<void>
  reload: () => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
