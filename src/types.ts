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
  /** For original CAP questions, the progress is shared by canonical question id. */
  progressId?: string
  examId?: string
  examFrequency?: number
  examFrequencyDenominator?: number
  answerStatus?: string
  reviewRequired?: boolean
  /** Raw letter printed at this question number, even if historically wrong. */
  originalSheetAnswer?: AnswerKey | null
  originalSheetQuestionNumber?: number | null
  originalSheetSourceFile?: string | null
  originalSheetSha256?: string | null
  /** PDF letter after an explicitly recorded numbering alignment. */
  mappedSheetAnswer?: AnswerKey | null
  mappedSheetQuestionNumber?: number | null
  /** The historic exam can display this question but must not score it. */
  scoringEligible?: boolean
  answerDispute?: {bankAnswer: AnswerKey; pdfAnswer: AnswerKey; reason: string} | null
  bankAnswer?: AnswerKey | null
  templateAnswer?: AnswerKey | null
  transcriptionReview?: boolean
  sourceMethod?: string
  sourcePage?: number
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
  scoringEligible?: boolean
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
  /** CAP net points, +1 correct / -0.5 incorrect / 0 blank. */
  netPoints?: number
  gradedTotal?: number
  blank?: number
  excluded?: number
  passed?: boolean | null
  capScoring?: boolean
  timed?: boolean
  durationMinutes?: number
  finishedReason?: 'manual' | 'timeout'
  elapsedSeconds?: number
  answers: SessionAnswer[]
}

export type StudySource = 'questionnaire' | 'random' | 'unseen' | 'errors' | 'smart' | 'favorites' | 'cap-original' | 'cap-random' | 'cap-mixed' | 'cap-top100' | 'cap-errors' | 'cap-favorites' | 'cap-review'

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
  /** A CAP real exam uses persisted wall clock and cannot be paused. */
  timed?: boolean
  durationMinutes?: number
  /** Questions flagged for later review, not graded differently. */
  markedIds?: string[]
}
