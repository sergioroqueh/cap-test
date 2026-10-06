export type AnswerKey = 'A' | 'B' | 'C' | 'D'

export interface Question {
  id: string
  code: string
  number: number
  section: string
  questionnaireId: string
  question: string
  options: Record<AnswerKey, string>
  correctAnswer: AnswerKey
  norm: string
  reference: string
}

export interface QuestionnaireMeta {
  id: string
  section: string
  questionnaireId: string
  title: string
  count: number
  path: string
}

export interface BankIndex {
  version: string
  totalQuestions: number
  totalQuestionnaires: number
  questionnaires: QuestionnaireMeta[]
}

export interface QuestionProgress {
  questionId: string
  questionnaireId: string
  attempts: number
  correct: number
  incorrect: number
  streak: number
  lastAnsweredAt: number
  lastAnswer?: AnswerKey
  lastCorrect?: boolean
  favorite: boolean
  updatedAt?: number
}

export interface SessionAnswer {
  questionId: string
  questionnaireId: string
  selected?: AnswerKey
  correctAnswer: AnswerKey
  correct: boolean
}

export interface StudySessionRecord {
  id?: number
  clientId?: string
  type: 'study' | 'exam'
  label: string
  startedAt: number
  completedAt: number
  total: number
  answered: number
  correct: number
  incorrect: number
  score: number
  answers: SessionAnswer[]
}

export type StudySource = 'questionnaire' | 'random' | 'unseen' | 'errors' | 'smart' | 'favorites'

export interface ActiveSession {
  type: 'study' | 'exam'
  source: StudySource
  label: string
  questionIds: string[]
  questionnaireId?: string
  currentIndex: number
  selectedAnswers: Record<string, AnswerKey>
  checkedIds: string[]
  startedAt: number
}
