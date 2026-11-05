import type { AnswerKey, Question } from './types'

export type CapCategory = 'mercancias' | 'viajeros'
export interface CapExamMeta {
  id: string
  date: string
  category: CapCategory
  model: string
  sourcePageStart: number
  sourcePageEnd: number
  templateFile: string | null
  status: string
  count: number
  expectedCount: number
  readyCount: number
  originalSheetAnswersCount?: number
  scoringEligibleCount?: number
  disputedCount?: number
  hasOriginalAnswerSheet?: boolean
  path: string
}
export interface CapExamIndex {
  version: string
  totalExamModels: number
  totalImportedQuestions: number
  categoryCounts: Partial<Record<CapCategory, number>>
  exams: CapExamMeta[]
}
export interface CapQuestion extends Question {
  progressId: string
  examId: string
  category: CapCategory
  examFrequency: number
  examFrequencyDenominator: number
  answerStatus: string
  reviewRequired: boolean
  sourcePage: number
}
interface CapRawQuestion extends Omit<CapQuestion, 'correctAnswer' | 'progressId'> {
  correctAnswer: AnswerKey | null
  canonicalQuestionId: string | null
}
const BASE = import.meta.env.BASE_URL
let cachedIndex: CapExamIndex | null = null
const cache = new Map<string, CapQuestion[]>()
let frequencyCache: Record<string, { count: number; denominator: number; category: CapCategory }> | null = null

export async function loadCapIndex(): Promise<CapExamIndex> {
  if (cachedIndex) return cachedIndex
  const res = await fetch(BASE + 'data/exams/index.json')
  if (!res.ok) throw new Error('No se ha podido cargar el catálogo de exámenes CAP.')
  cachedIndex = await res.json() as CapExamIndex
  return cachedIndex
}

export async function loadCapQuestions(meta: CapExamMeta): Promise<CapQuestion[]> {
  const existing = cache.get(meta.id)
  if (existing) return existing
  const res = await fetch(BASE + meta.path)
  if (!res.ok) throw new Error('No se pudo cargar el examen ' + meta.id)
  const raw: CapRawQuestion[] = await res.json()
  // Complete historical exams show all 100 original questions, including
  // contested items. A disputed printed solution is NEVER a graded answer.
  const ready = raw.filter(q => meta.hasOriginalAnswerSheet
    ? !!q.originalSheetAnswer
    : !!q.correctAnswer
  ).map(q => ({
    ...q,
    correctAnswer: (q.correctAnswer || q.originalSheetAnswer) as AnswerKey,
    scoringEligible: q.correctAnswer !== null,
    id: 'cap:' + meta.id + ':' + q.number,
    progressId: q.canonicalQuestionId || q.id,
    examId: meta.id
  }))
  cache.set(meta.id, ready)
  return ready
}

export interface CapSheetReviewQuestion {
  number: number
  question: string
  options: Record<AnswerKey, string>
  sourcePage: number
  answerStatus: string
  correctAnswer: AnswerKey | null
  bankAnswer: AnswerKey | null
  originalSheetAnswer: AnswerKey | null
  originalSheetQuestionNumber: number | null
  originalSheetSourceFile: string | null
  mappedSheetAnswer: AnswerKey | null
  mappedSheetQuestionNumber: number | null
  answerDispute: {bankAnswer: AnswerKey; pdfAnswer: AnswerKey; reason: string} | null
  scoringEligible: boolean
}

/** Returns every question, including three documented conflicts, for audit by exam. */
export async function loadCapSheetReview(meta: CapExamMeta): Promise<CapSheetReviewQuestion[]> {
  if (!meta.hasOriginalAnswerSheet) return []
  const res = await fetch(BASE + meta.path)
  if (!res.ok) throw new Error('No se pudo cargar la plantilla original.')
  const rows: CapRawQuestion[] = await res.json()
  return rows.map(q => ({
    number: q.number, question: q.question, options: q.options,
    sourcePage: q.sourcePage, answerStatus: q.answerStatus,
    correctAnswer: q.correctAnswer,
    bankAnswer: q.bankAnswer || null,
    originalSheetAnswer: q.originalSheetAnswer || null,
    originalSheetQuestionNumber: q.originalSheetQuestionNumber || null,
    originalSheetSourceFile: q.originalSheetSourceFile || null,
    mappedSheetAnswer: q.mappedSheetAnswer || null,
    mappedSheetQuestionNumber: q.mappedSheetQuestionNumber || null,
    answerDispute: q.answerDispute || null,
    scoringEligible: q.correctAnswer !== null,
  }))
}

export interface CapPendingQuestion {
  number: number
  question: string
  options: Record<AnswerKey, string>
  sourcePage: number
  answerStatus: string
}

export async function loadCapPendingQuestions(meta: CapExamMeta): Promise<CapPendingQuestion[]> {
  const res = await fetch(BASE + meta.path)
  if (!res.ok) throw new Error('No se pudieron cargar las preguntas pendientes.')
  const rows: CapRawQuestion[] = await res.json()
  return rows.filter(q => q.correctAnswer === null).map(q => ({
    number:q.number,question:q.question,options:q.options,
    sourcePage:q.sourcePage,answerStatus:q.answerStatus
  }))
}

export async function loadCapByIds(ids: string[]): Promise<Map<string, CapQuestion>> {
  const index = await loadCapIndex()
  const examIds = [...new Set(ids.map(id => /^cap:([^:]+):\d+$/.exec(id)?.[1]).filter((s): s is string => !!s))]
  const metas = index.exams.filter(e => examIds.includes(e.id))
  const batches = await Promise.all(metas.map(loadCapQuestions))
  return new Map(batches.flat().map(q => [q.id, q]))
}

export async function loadAllCapQuestions(category: CapCategory): Promise<CapQuestion[]> {
  const index = await loadCapIndex()
  const metas = index.exams.filter(e => e.category === category && e.hasOriginalAnswerSheet && e.readyCount > 0)
  return (await Promise.all(metas.map(loadCapQuestions))).flat().filter(q => q.scoringEligible !== false)
}

export async function loadBankExamFrequency(): Promise<Record<string, { count: number; denominator: number; category: CapCategory }>> {
  if (frequencyCache) return frequencyCache
  const res = await fetch(BASE + 'data/exams/frequency_by_bank.json')
  if (!res.ok) return {}
  frequencyCache = await res.json() as Record<string, { count: number; denominator: number; category: CapCategory }>
  return frequencyCache
}
