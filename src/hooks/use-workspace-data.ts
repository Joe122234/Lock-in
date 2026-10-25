import { useMemo } from 'react'
import type { DateKey, Subject, Topic } from '@/types/domain'
import { useWorkspace } from '@/providers/workspace-provider'
import {
  activeSubjects,
  buildDeadlines,
  buildQueue,
  projectProgress,
  subjectGoalProgress,
  weeklyMinutes,
} from '@/lib/workspace/selectors'
import {
  buildHeatmapWeeks,
  buildStreakDays,
  calculateStreakStats,
  collectRestDays,
} from '@/lib/streaks'
import { getSubject, getTopic } from '@/lib/workspace/selectors'

export function useWorkspaceData() {
  const workspace = useWorkspace()
  const { collections, settings, today } = workspace

  const derived = useMemo(() => {
    if (!settings) return null
    const subjects = activeSubjects(collections)
    const subjectById = new Map<string, Subject>(
      collections.subjects.map((subject) => [subject.id, subject]),
    )
    const topicById = new Map<string, Topic>(
      collections.topics.map((topic) => [topic.id, topic]),
    )
    const goals = subjectGoalProgress(collections, settings, today)
    const deadlines = buildDeadlines(collections, today, settings.reminders.dueSoonDays)
    const queue = buildQueue(collections, settings, today)
    const streakContext = {
      activityEvents: collections.activityEvents,
      settings,
      calendarEvents: collections.calendarEvents,
      checkIns: collections.checkIns,
      today,
    }
    const streakDays = buildStreakDays(streakContext)
    const streakStats = calculateStreakStats(streakContext)
    const heatmap = buildHeatmapWeeks(streakDays, settings.weekStartsOn, 18, today)
    const restDays = collectRestDays(
      collections.calendarEvents,
      collections.checkIns,
      settings,
    )
    const todayEvents = collections.calendarEvents
      .filter(
        (event) =>
          event.dateKey === today &&
          event.status !== 'canceled' &&
          (settings.calendar.showCompleted || event.status !== 'completed'),
      )
      .sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
        if (a.startTime) return -1
        if (b.startTime) return 1
        return a.title.localeCompare(b.title)
      })
    const projects = collections.projects
      .filter((project) => !project.archivedAt)
      .map((project) => ({
        project,
        progress: projectProgress(project, collections, settings, today),
      }))
      .sort((a, b) => {
        if (a.project.status === 'completed' && b.project.status !== 'completed') return 1
        if (b.project.status === 'completed' && a.project.status !== 'completed') return -1
        const aDate = a.project.targetFinishDate ?? a.project.dueDate ?? '9999-12-31'
        const bDate = b.project.targetFinishDate ?? b.project.dueDate ?? '9999-12-31'
        return aDate.localeCompare(bDate)
      })
    const openAssignments = collections.assignments.filter(
      (assignment) =>
        !assignment.archivedAt &&
        assignment.status !== 'completed' &&
        assignment.status !== 'submitted',
    )
    const openMissions = collections.missions.filter(
      (mission) =>
        !mission.archivedAt &&
        mission.status !== 'completed' &&
        mission.status !== 'skipped',
    )
    const openInbox = collections.inboxItems.filter((item) => !item.convertedAt)
    const openMistakes = collections.mistakes.filter((mistake) => mistake.status !== 'mastered')
    return {
      subjects,
      subjectById,
      topicById,
      goals,
      deadlines,
      queue,
      streakContext,
      streakDays,
      streakStats,
      heatmap,
      restDays,
      todayEvents,
      projects,
      openAssignments,
      openMissions,
      openInbox,
      openMistakes,
      minutesThisWeek: weeklyMinutes(collections, today, settings),
    }
  }, [collections, settings, today])

  return {
    ...workspace,
    derived,
    getSubject: (id: string | null) => getSubject(collections, id),
    getTopic: (id: string | null) => getTopic(collections, id),
    subjectColor: (id: string | null) =>
      id ? collections.subjects.find((subject) => subject.id === id)?.color ?? '#8b9488' : '#8b9488',
    subjectName: (id: string | null, fallback = 'General') =>
      id ? collections.subjects.find((subject) => subject.id === id)?.name ?? fallback : fallback,
    topicName: (id: string | null) =>
      id ? collections.topics.find((topic) => topic.id === id)?.name ?? null : null,
  }
}

export type WorkspaceData = ReturnType<typeof useWorkspaceData>

export function useSettings() {
  const { settings } = useWorkspace()
  if (!settings) throw new Error('Workspace settings are not ready yet.')
  return settings
}

export function useDateLocale() {
  const { settings } = useWorkspace()
  return {
    locale: settings?.locale ?? 'en-US',
    timezone: settings?.timezone ?? 'UTC',
    weekStartsOn: settings?.weekStartsOn ?? 1,
  }
}

export function useCheckIn(dateKey: DateKey) {
  const { collections } = useWorkspace()
  return collections.checkIns.find((checkIn) => checkIn.dateKey === dateKey) ?? null
}
