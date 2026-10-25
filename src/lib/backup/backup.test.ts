import { describe, expect, it } from 'vitest'
import type { CollectionKey } from '@/lib/firebase/paths'
import { WORKSPACE_ID } from '@/lib/firebase/paths'
import {
  BACKUP_APP,
  BACKUP_VERSION,
  validateBackupPayload,
  type BackupPayload,
} from './index'

type RawRecord = Record<string, unknown>

function emptyCollections(): Record<CollectionKey, RawRecord[]> {
  return {
    subjects: [],
    topics: [],
    missions: [],
    assignments: [],
    projects: [],
    milestones: [],
    calendarEvents: [],
    recurrenceSeries: [],
    activityEvents: [],
    checkIns: [],
    weeklyReviews: [],
    practiceRecords: [],
    mistakes: [],
    inboxItems: [],
    achievements: [],
  }
}

function payload(patch: Partial<BackupPayload> = {}): BackupPayload {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: '2026-01-12T12:00:00.000Z',
    workspaceId: WORKSPACE_ID,
    settings: {
      timezone: 'America/New_York',
      locale: 'en-US',
      weekStartsOn: 1,
      weeklyGoals: { sat: 3 },
      createdAt: '2026-01-01T12:00:00.000Z',
      reminders: {
        inAppEnabled: true,
        dueSoonDays: 3,
        browserNotifications: false,
        dailyNudgeEnabled: true,
        dailyNudgeTime: '18:00',
      },
    },
    collections: emptyCollections(),
    ...patch,
  }
}

describe('backup envelope validation', () => {
  it('rejects values that are not a LOCK IN backup', () => {
    for (const input of [null, 'backup', 42, {}, { app: 'OTHER', version: 1 }]) {
      const result = validateBackupPayload(input)
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.payload).toBeNull()
    }
  })

  it('rejects a different backup version', () => {
    const result = validateBackupPayload(payload({ version: 2 }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('Unsupported backup version 2')
  })

  it('requires the core settings fields', () => {
    const result = validateBackupPayload(payload({ settings: { timezone: 'UTC' } }))
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'settings.locale is required.',
        'settings.weekStartsOn is required.',
        'settings.weeklyGoals is required.',
      ]),
    )
  })

  it('warns about missing collections but accepts the rest of a valid backup', () => {
    const collections = emptyCollections()
    delete (collections as Partial<Record<CollectionKey, RawRecord[]>>).topics
    const result = validateBackupPayload(payload({ collections }))
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toContain('Backup has no "topics" collection')
    expect(result.summary?.perCollection.topics).toBe(0)
  })

  it('warns about a different workspace and unknown collections', () => {
    const collections = {
      ...emptyCollections(),
      mystery: [{ id: 'mystery-1' }],
    } as unknown as Record<CollectionKey, RawRecord[]>
    const result = validateBackupPayload(
      payload({ collections, workspaceId: 'someone-else' }),
    )
    expect(result.ok).toBe(true)
    expect(result.summary?.workspaceMatches).toBe(false)
    expect(result.warnings.join(' ')).toContain('someone-else')
    expect(result.warnings.join(' ')).toContain('Unknown collection "mystery"')
  })
})

describe('backup record normalization', () => {
  it('normalizes timestamps, date keys, and local times', () => {
    const collections = emptyCollections()
    collections.subjects = [
      {
        id: 'sat',
        name: 'SAT',
        type: 'sat',
        examDate: '2026-03-14',
        createdAt: '2026-01-01T12:00:00.000Z',
        archivedAt: null,
        updatedAt: new Date('2026-01-02T12:00:00.000Z'),
      },
    ]
    collections.calendarEvents = [
      {
        id: 'event-1',
        title: 'Study block',
        dateKey: '2026-01-05',
        startTime: '16:30',
        endTime: null,
        createdAt: '2026-01-01T12:00:00.000Z',
      },
    ]
    const result = validateBackupPayload(payload({ collections }))
    expect(result.ok).toBe(true)
    expect(result.summary?.totalDocuments).toBe(2)
    expect(result.summary?.perCollection.subjects).toBe(1)
    expect(result.payload?.collections.subjects[0]?.createdAt).toBeInstanceOf(Date)
    expect(result.payload?.collections.calendarEvents[0]?.createdAt).toBeInstanceOf(Date)
    expect(result.payload?.collections.calendarEvents[0]?.dateKey).toBe('2026-01-05')
    expect(result.payload?.collections.calendarEvents[0]?.startTime).toBe('16:30')
    expect(result.payload?.settings.createdAt).toBeInstanceOf(Date)
  })

  it('rejects unsafe ids, invalid dates, invalid times, and malformed collection entries', () => {
    const collections = emptyCollections()
    collections.subjects = [
      { id: 'bad/id', name: 'Unsafe' },
      { id: '   ', name: 'Blank' },
      { name: 'Missing id' },
      { id: 'bad-date', examDate: '2026-02-30' },
      { id: 'bad-timestamp', createdAt: 'yesterday' },
    ]
    collections.calendarEvents = [
      { id: 'bad-time', dateKey: '2026-01-05', startTime: '25:00' },
    ]
    collections.topics = [
      { id: 'bad-topic', parentId: 'topic-1', createdAt: 'not-a-date' },
      'not-an-object' as unknown as RawRecord,
    ]
    const result = validateBackupPayload(payload({ collections }))
    const text = result.errors.join('\n')
    expect(result.ok).toBe(false)
    expect(text).toContain('unsafe document id')
    expect(text).toContain('missing a document id')
    expect(text).toContain('invalid YYYY-MM-DD date for examDate')
    expect(text).toContain('invalid timestamp for createdAt')
    expect(text).toContain('invalid local time for startTime')
    expect(text).toContain('collections.topics[1] is not an object')
    expect(result.payload).not.toBeNull()
  })

  it('reports a non-array collection instead of silently dropping it', () => {
    const collections = {
      ...emptyCollections(),
      missions: { unexpected: true },
    } as unknown as Record<CollectionKey, RawRecord[]>
    const result = validateBackupPayload(payload({ collections }))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('collections.missions must be an array.')
    expect(result.summary?.perCollection.missions).toBe(0)
  })

  it('counts a realistic backup accurately', () => {
    const collections = emptyCollections()
    collections.subjects = [{ id: 'sat' }, { id: 'ap-world' }]
    collections.topics = [{ id: 'topic-1' }, { id: 'topic-2' }, { id: 'topic-3' }]
    collections.missions = [{ id: 'mission-1' }]
    const result = validateBackupPayload(payload({ collections }))
    expect(result.ok).toBe(true)
    expect(result.summary).toMatchObject({
      totalDocuments: 6,
      hasSettings: true,
      exportedAt: '2026-01-12T12:00:00.000Z',
      workspaceMatches: true,
    })
    expect(result.summary?.perCollection).toMatchObject({
      subjects: 2,
      topics: 3,
      missions: 1,
      assignments: 0,
    })
  })
})
