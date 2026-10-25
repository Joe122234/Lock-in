import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  Achievement,
  DateKey,
  WorkspaceCollections,
  WorkspaceSettings,
} from '@/types/domain'
import { isFirebaseConfigured } from '@/lib/firebase/client'
import { describeFirestoreError, syncMonitor } from '@/lib/firebase/sync'
import { subscribeCollection, subscribeSettings } from '@/lib/firebase/firestore'
import { upsertSettingsFields } from '@/lib/firebase/repositories/settings'
import { extendRecurrenceSeries } from '@/lib/firebase/repositories/calendarEvents'
import { persistMissingAchievements } from '@/lib/firebase/repositories/achievements'
import { deriveAchievements } from '@/lib/streaks/achievements'
import { normalizeSettings } from '@/lib/workspace/selectors'
import { COLLECTION_KEYS, EMPTY_COLLECTIONS } from '@/lib/workspace/empty'
import { todayKey } from '@/lib/dates'
import { WorkspaceContext, type WorkspaceContextValue } from './workspace-context'

function useToday(timezone: string | undefined): DateKey {
  const getToday = useCallback(
    () => todayKey(timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'),
    [timezone],
  )
  const [today, setToday] = useState<DateKey>(getToday)

  useEffect(() => {
    setToday(getToday())
    const interval = window.setInterval(() => {
      setToday((current) => {
        const next = getToday()
        return next === current ? current : next
      })
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [getToday])

  return today
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [collections, setCollections] = useState<WorkspaceCollections>(EMPTY_COLLECTIONS)
  const [settingsSettled, setSettingsSettled] = useState(false)
  const [settledCollections, setSettledCollections] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const today = useToday(settings?.timezone)
  const sync = useSyncExternalStore(
    syncMonitor.subscribe,
    syncMonitor.getSnapshot,
    syncMonitor.getSnapshot,
  )
  const recurrenceRan = useRef(false)
  const achievementRun = useRef<string | null>(null)

  const markCollectionSettled = useCallback((key: string) => {
    setSettledCollections((current) => {
      if (current.has(key)) return current
      const next = new Set(current)
      next.add(key)
      return next
    })
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false)
      setSettingsSettled(true)
      setError('Firebase is not configured for this build.')
      return
    }

    syncMonitor.setOnline(navigator.onLine)
    const handleOnline = () => syncMonitor.setOnline(true)
    const handleOffline = () => syncMonitor.setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    let cancelled = false
    let settingsSettledLocal = false
    const settled = new Set<string>()

    const finishIfReady = () => {
      if (cancelled) return
      if (settingsSettledLocal && settled.size >= COLLECTION_KEYS.length) {
        setLoading(false)
      }
    }

    const recordSettled = (key: string) => {
      settled.add(key)
      markCollectionSettled(key)
      finishIfReady()
    }

    const handleError = (err: unknown) => {
      if (cancelled) return
      const message = describeFirestoreError(err)
      setError(message)
      if (
        message.toLowerCase().includes('denied') ||
        String((err as { code?: unknown })?.code ?? '').includes('permission-denied')
      ) {
        setPermissionDenied(true)
      }
    }

    const unsubSettings = subscribeSettings(
      (raw) => {
        if (cancelled) return
        setSettings(raw ? normalizeSettings(raw) : null)
        settingsSettledLocal = true
        setSettingsSettled(true)
        finishIfReady()
      },
      (err) => {
        handleError(err)
        settingsSettledLocal = true
        setSettingsSettled(true)
        markCollectionSettled('__settings')
        finishIfReady()
      },
    )

    const unsubscribes = COLLECTION_KEYS.map((key) =>
      subscribeCollection<unknown>(
        key,
        (items) => {
          if (cancelled) return
          setCollections((current) => ({ ...current, [key]: items as never }))
          recordSettled(key)
        },
        (err) => {
          handleError(err)
          recordSettled(key)
        },
      ),
    )

    return () => {
      cancelled = true
      unsubSettings()
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [markCollectionSettled])

  useEffect(() => {
    if (loading || !settings || !settledCollections.has('recurrenceSeries')) return
    if (recurrenceRan.current) return
    recurrenceRan.current = true
    const activeSeries = collections.recurrenceSeries.filter(
      (series) => series.active && series.ownerType === 'calendarEvent',
    )
    if (activeSeries.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const series of activeSeries) {
        if (cancelled) return
        try {
          await extendRecurrenceSeries(series, today, settings.weekStartsOn)
        } catch (err) {
          console.warn('Could not extend a recurring series.', err)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loading, settings, collections.recurrenceSeries, settledCollections, today])

  useEffect(() => {
    if (loading || !settings || !settledCollections.has('activityEvents')) return
    if (!settledCollections.has('achievements')) return
    const signature = `${collections.activityEvents.length}:${collections.activityEvents
      .map((event) => `${event.id}${event.reversedAt ? 'r' : ''}`)
      .join(',')}:${collections.achievements.length}`
    if (achievementRun.current === signature) return
    achievementRun.current = signature
    const derived = deriveAchievements({
      activityEvents: collections.activityEvents,
      settings,
      today,
    })
    const storedIds = new Set(collections.achievements.map((achievement) => achievement.id))
    const missing = derived
      .filter((item) => !storedIds.has(item.id))
      .map<Achievement>((item) => ({
        ...item,
        createdAt: item.earnedAt,
        updatedAt: item.earnedAt,
      }))
    if (missing.length === 0) return
    void persistMissingAchievements(missing).catch((err) => {
      console.warn('Could not save derived achievements.', err)
    })
  }, [
    loading,
    settings,
    today,
    collections.activityEvents,
    collections.achievements,
    settledCollections,
  ])

  const updateSettings = useCallback(async (patch: Partial<WorkspaceSettings>) => {
    setSettings((current) => (current ? normalizeSettings({ ...current, ...patch }) : current))
    try {
      await upsertSettingsFields(patch)
    } catch (err) {
      syncMonitor.fail(describeFirestoreError(err))
      throw err
    }
  }, [])

  const reload = useCallback(() => {
    window.location.reload()
  }, [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      settings,
      collections,
      today,
      loading,
      settingsSettled,
      error,
      permissionDenied,
      configured: isFirebaseConfigured,
      sync,
      updateSettings,
      reload,
    }),
    [
      settings,
      collections,
      today,
      loading,
      settingsSettled,
      error,
      permissionDenied,
      sync,
      updateSettings,
      reload,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
