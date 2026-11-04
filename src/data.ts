import { loadCapByIds } from './capExams'
import type { BankIndex, Question, QuestionnaireMeta } from './types'

const BASE = import.meta.env.BASE_URL
let indexCache: BankIndex | null = null
const questionnaireCache = new Map<string, Question[]>()

export async function loadBankIndex(): Promise<BankIndex> {
  if (indexCache) return indexCache
  const res = await fetch(`${BASE}data/index.json`)
  if (!res.ok) throw new Error('No se pudo cargar el índice de preguntas.')
  const parsed = (await res.json()) as BankIndex
  indexCache = parsed
  return parsed
}

export async function loadQuestionnaire(meta: QuestionnaireMeta): Promise<Question[]> {
  if (questionnaireCache.has(meta.id)) return questionnaireCache.get(meta.id)!
  const res = await fetch(`${BASE}${meta.path}`)
  if (!res.ok) throw new Error(`No se pudo cargar ${meta.title}.`)
  const rows: Question[] = await res.json()
  questionnaireCache.set(meta.id, rows)
  return rows
}

export async function loadQuestionnaireByCode(code: string): Promise<Question[]> {
  const index = await loadBankIndex()
  const meta = index.questionnaires.find((q) => q.id === code || q.questionnaireId === code)
  if (!meta) return []
  return loadQuestionnaire(meta)
}

export async function loadAllQuestions(onProgress?: (done: number, total: number) => void): Promise<Question[]> {
  const index = await loadBankIndex()
  const all: Question[] = []
  let done = 0
  const batchSize = 5
  for (let i = 0; i < index.questionnaires.length; i += batchSize) {
    const batch = index.questionnaires.slice(i, i + batchSize)
    const data = await Promise.all(batch.map(loadQuestionnaire))
    data.forEach((rows) => all.push(...rows))
    done += batch.length
    onProgress?.(done, index.questionnaires.length)
  }
  return all
}

export function getCachedQuestion(questionId: string): Question | undefined {
  for (const rows of questionnaireCache.values()) {
    const q = rows.find((item) => item.id === questionId)
    if (q) return q
  }
  return undefined
}

export async function resolveQuestions(ids: string[]): Promise<Question[]> {
  const capIds = ids.filter(id => id.startsWith('cap:'))
  const regularIds = ids.filter(id => !id.startsWith('cap:'))
  const found = new Map<string, Question>()
  const cap = capIds.length ? await loadCapByIds(capIds) : new Map()
  cap.forEach((question, id) => found.set(id, question))
  const wanted = new Set(regularIds)
  for (const rows of questionnaireCache.values()) {
    rows.forEach(q => {
      if (wanted.has(q.id)) found.set(q.id, q)
    })
  }
  if (regularIds.length && regularIds.some(id => !found.has(id))) {
    const all = await loadAllQuestions()
    all.forEach(q => {
      if (wanted.has(q.id)) found.set(q.id, q)
    })
  }
  return ids.map(id => found.get(id)).filter(Boolean) as Question[]
}
