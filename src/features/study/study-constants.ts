import type { MissionType, PracticeRecord, TopicStage } from '@/types/domain'

export const TOPIC_STAGE_LABELS: Record<TopicStage, string> = {
  notStarted: 'Not started',
  learning: 'Learning',
  review: 'Review',
  confident: 'Confident',
}

export const TOPIC_STAGE_ORDER: TopicStage[] = [
  'notStarted',
  'learning',
  'review',
  'confident',
]

export const TOPIC_STAGE_TONE: Record<TopicStage, 'neutral' | 'info' | 'warning' | 'success'> = {
  notStarted: 'neutral',
  learning: 'info',
  review: 'warning',
  confident: 'success',
}

export const MISSION_TYPE_OPTIONS: MissionType[] = [
  'learn',
  'activeRecall',
  'practice',
  'review',
  'mockExam',
  'other',
]

export const PRACTICE_TYPE_LABELS: Record<PracticeRecord['recordType'], string> = {
  fullTest: 'Full test',
  section: 'Section',
  questions: 'Question set',
}

export const PRACTICE_SECTION_LABELS: Record<PracticeRecord['section'], string> = {
  math: 'Math',
  readingWriting: 'Reading & Writing',
  mixed: 'Mixed',
}

export const MISTAKE_STATUS_LABELS = {
  open: 'Open',
  reviewed: 'Reviewed',
  mastered: 'Mastered',
} as const
