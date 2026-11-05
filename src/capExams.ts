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
  editorialDecision?: CapEditorialDecision
}
interface CapRawQuestion extends Omit<CapQuestion, 'correctAnswer' | 'progressId'> {
  correctAnswer: AnswerKey | null
  canonicalQuestionId: string | null
  textCorrection?: {round?:string;method:string;reviewStatus:string;originalQuestion:string;originalOptions:Record<AnswerKey,string>;sourceOfficialPdf?:string;sourceOriginalExam?:string}
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
  reviewFlags: CapEditorialFlag[]
  reviewPriority: string
  textReviewRequired: boolean
  r22Case: CapR22Case | null
  r23Case: CapR23Case | null
  r24Case: CapR23Case | null
  editorialDecision: CapEditorialDecision | null
  r22TextCorrection: CapRawQuestion['textCorrection'] | null
}

/** Returns every question, including three documented conflicts, for audit by exam. */
export async function loadCapSheetReview(meta: CapExamMeta): Promise<CapSheetReviewQuestion[]> {
  const [res, triage, casebook, casebookR23, casebookR24] = await Promise.all([fetch(BASE + meta.path), loadCapEditorialTriage(), loadCapR22Casebook(), loadCapR23Casebook(), loadCapR24Casebook()])
  if (!res.ok) throw new Error('No se pudo cargar la convocatoria.')
  const rows: CapRawQuestion[] = await res.json()
  const sourceFlags = new Map((triage.questions[meta.id] || []).map(x => [x.number, x]))
  const r22Cases = new Map(casebook.cases.map(x => [x.examId + ':' + x.number, x]))
  const r23Cases = new Map(casebookR23.cases.map(x => [x.examId + ':' + x.number, x]))
  const r24Cases = new Map(casebookR24.cases.map(x => [x.examId + ':' + x.number, x]))
  if (rows.length !== 100 || sourceFlags.size !== 100)
    throw new Error('Auditoría incompleta: esta convocatoria necesita 100 preguntas.')
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
    reviewFlags: sourceFlags.get(q.number)?.flags || [],
    reviewPriority: sourceFlags.get(q.number)?.priority || 'P4',
    textReviewRequired: sourceFlags.get(q.number)?.textReviewRequired || false,
    r22Case: r22Cases.get(meta.id + ':' + q.number) || null,
    r23Case: r23Cases.get(meta.id + ':' + q.number) || null,
    r24Case: r24Cases.get(meta.id + ':' + q.number) || null,
    editorialDecision: q.editorialDecision || null,
    r22TextCorrection: q.textCorrection || null,
  }))
}

export interface CapEditorialDecision {
  round: string
  status: string
  reviewCompleted: boolean
  officialCorrectionConfirmed: boolean
  editorialAnswer: AnswerKey | null
  originalSheetAnswer: AnswerKey
  bankAnswer: AnswerKey
  scoringPolicy: 'NO_PUNTUA'
  decision: string
  reason: string
  scope: string
  sources: string[]
}

export interface CapR22Case {
  examId: string
  number: number
  status: string
  explanation: string
  source: string
}
export interface CapR22Casebook {
  totalRows: number
  manualCaseCount: number
  correctAnswerChangeCount: number
  cases: CapR22Case[]
}
let r22Cache: CapR22Casebook | null = null
export async function loadCapR22Casebook(): Promise<CapR22Casebook> {
  if (r22Cache) return r22Cache
  const res = await fetch(BASE + 'data/exams/editorial_casebook_r22.json')
  if (!res.ok) throw new Error('No se ha podido cargar el expediente editorial R22.')
  const payload = await res.json() as CapR22Casebook
  if (payload.totalRows !== 306 || payload.manualCaseCount !== 33 ||
      payload.correctAnswerChangeCount !== 0)
    throw new Error('El expediente R22 no coincide con la versión actual del banco.')
  r22Cache = payload
  return payload
}

export interface CapR23Case {
  examId: string
  number: number
  status: string
  priority: string
  reason: string
  sourceUrl: string
  evidenceType: string
  unverifiedTextExtractionLetter?: AnswerKey
  visuallyVerifiedOriginalSheetLetter?: AnswerKey
}
export interface CapR23Casebook {
  totalQuestionRows: number
  manualEvidenceCases: number
  sourceKeyChanges: number
  cases: CapR23Case[]
}
let r23Cache: CapR23Casebook | null = null
export async function loadCapR23Casebook(): Promise<CapR23Casebook> {
  if (r23Cache) return r23Cache
  const res = await fetch(BASE + 'data/exams/editorial_casebook_r23.json')
  if (!res.ok) throw new Error('No se ha podido cargar el expediente R23.')
  const payload = await res.json() as CapR23Casebook
  if (payload.totalQuestionRows !== 1000 || payload.manualEvidenceCases !== 17 ||
      payload.sourceKeyChanges !== 0)
    throw new Error('El expediente R23 no corresponde a esta versión de los exámenes.')
  r23Cache = payload
  return payload
}

export interface CapR24Casebook {
  totalQuestionRows: number
  caseCount: number
  originalSheetLetters: number
  sourceKeyChanges: number
  cases: CapR23Case[]
}
let r24Cache: CapR24Casebook | null = null
export async function loadCapR24Casebook(): Promise<CapR24Casebook> {
  if (r24Cache) return r24Cache
  const res = await fetch(BASE + 'data/exams/editorial_casebook_r24.json')
  if (!res.ok) throw new Error('No se ha podido cargar el expediente editorial R24.')
  const payload = await res.json() as CapR24Casebook
  if (payload.totalQuestionRows !== 1000 || payload.caseCount !== 18 ||
      payload.originalSheetLetters !== 1000 || payload.sourceKeyChanges !== 0)
    throw new Error('La auditoría R24 no coincide con los originales de las plantillas.')
  r24Cache = payload
  return payload
}

export interface CapEditorialFlag {
  code: string
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  description: string
  evidence: string
  sourceStatus: string
}
export interface CapEditorialTriageQuestion {
  number: number
  priority: string
  flags: CapEditorialFlag[]
  textReviewRequired: boolean
  editoriallyReviewed: boolean
}
export interface CapEditorialTriage {
  schemaVersion: number
  totalExams: number
  totalQuestions: number
  scoredBeforeAfter: number
  flagCounts: Record<string, number>
  exams: {examId:string;P0:number;P1:number;P2:number;P3:number;P4:number;pendingVisualTranscription:number}[]
  questions: Record<string, CapEditorialTriageQuestion[]>
}
let editorialTriageCache: CapEditorialTriage | null = null
export async function loadCapEditorialTriage(): Promise<CapEditorialTriage> {
  if (editorialTriageCache) return editorialTriageCache
  const res = await fetch(BASE + 'data/exams/editorial_triage_r21.json')
  if (!res.ok) throw new Error('No se ha podido cargar la revisión editorial por convocatoria.')
  const payload = await res.json() as CapEditorialTriage
  if (payload.totalExams !== 26 || payload.totalQuestions !== 2600 || payload.scoredBeforeAfter !== 2417)
    throw new Error('La auditoría editorial no coincide con la versión de las preguntas.')
  editorialTriageCache = payload
  return payload
}

export interface CapPendingQuestion {
  number: number
  question: string
  options: Record<AnswerKey, string>
  sourcePage: number
  answerStatus: string
  editorialDecision: CapEditorialDecision | null
}

export async function loadCapPendingQuestions(meta: CapExamMeta): Promise<CapPendingQuestion[]> {
  const res = await fetch(BASE + meta.path)
  if (!res.ok) throw new Error('No se pudieron cargar las preguntas pendientes.')
  const rows: CapRawQuestion[] = await res.json()
  return rows.filter(q => q.correctAnswer === null).map(q => ({
    number:q.number,question:q.question,options:q.options,
    sourcePage:q.sourcePage,answerStatus:q.answerStatus,
    editorialDecision:q.editorialDecision || null
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
