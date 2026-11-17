import type { AnswerKey, QuestionProgress, StudySessionRecord } from './types'
import { openDb, requestAsPromise } from './db'

// C30: ONLY local IndexedDB. No Supabase client, no cloud calls, no UI networking.
// Every mutation uses one readwrite transaction across progress + events + metadata.
const P = 'progress', J = 'progressEvents', M = 'syncMeta', S = 'sessions'
type JournalKind = 'answer' | 'favorite' | 'legacy-baseline'
export type JournalEvent = {
  eventId: string; deviceId: string; clock: number; occurredAt: number
  questionId: string; questionnaireId: string; kind: JournalKind
  baselineId?: string
  answer?: AnswerKey; correct?: boolean; favorite?: boolean
  progress?: QuestionProgress
}
export type AnswerOperation = {
  eventId: string; questionId: string; questionnaireId: string
  answer: AnswerKey; correct: boolean
}
export type FavoriteOperation = {
  eventId: string; questionId: string; questionnaireId: string
}
type State = { deviceId: string; clock: number }
const answers: AnswerKey[] = ['A', 'B', 'C', 'D']
const txResult = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onabort = () => reject(tx.error || new Error('Se canceló la transacción local'))
  tx.onerror = () => reject(tx.error || new Error('Fallo de IndexedDB'))
})
const fresh = (row: Pick<AnswerOperation, 'questionId' | 'questionnaireId'>): QuestionProgress => ({
  questionId: row.questionId, questionnaireId: row.questionnaireId,
  attempts: 0, correct: 0, incorrect: 0, streak: 0,
  lastAnsweredAt: 0, favorite: false
})
async function state(tx: IDBTransaction): Promise<State> {
  const meta = tx.objectStore(M)
  const device = await requestAsPromise(meta.get('deviceId')) as {key: string, value: string} | undefined
  const logical = await requestAsPromise(meta.get('clock')) as {key: string, value: number} | undefined
  const deviceId = device?.value || crypto.randomUUID()
  if (!device) meta.put({key: 'deviceId', value: deviceId})
  if (!Number.isSafeInteger(logical?.value ?? 0) || (logical?.value ?? 0) < 0)
    throw Error('Reloj lógico local dañado')
  return {deviceId, clock: logical?.value ?? 0}
}
function advance(counter: State): number {
  if (counter.clock >= Number.MAX_SAFE_INTEGER) throw Error('Reloj lógico agotado')
  return ++counter.clock
}
function valid(op: AnswerOperation | FavoriteOperation): void {
  if (!op.eventId || !op.questionId || !op.questionnaireId ||
      op.eventId.length > 200 || op.questionId.length > 200 || op.questionnaireId.length > 200)
    throw Error('Identificador de operación o pregunta inválido')
  if ('answer' in op && (!answers.includes(op.answer) || typeof op.correct !== 'boolean'))
    throw Error('La operación contiene una respuesta inválida')
}
async function apply(tx: IDBTransaction, counter: State, op: AnswerOperation | FavoriteOperation): Promise<void> {
  valid(op)
  const journal = tx.objectStore(J), progress = tx.objectStore(P), meta = tx.objectStore(M)
  const previous = await requestAsPromise(journal.get(op.eventId)) as JournalEvent | undefined
  if (previous) {
    if (previous.questionId !== op.questionId || previous.questionnaireId !== op.questionnaireId ||
        previous.kind !== ('answer' in op ? 'answer':'favorite') ||
        ('answer' in op && (previous.answer !== op.answer || previous.correct !== op.correct)))
      throw Error('Colisión de operación: identidad reutilizada con datos distintos')
    return // Already committed in the same database, never increment a second time.
  }
  const existing = await requestAsPromise(progress.get(op.questionId)) as QuestionProgress | undefined
  // A canonical CAP question appears in multiple exams. Keep the first
  // persisted questionnaireId for that questionId, matching legacy db.ts.
  const canonicalQuestionnaireId = existing?.questionnaireId || op.questionnaireId
  const originKey = 'origin:' + op.questionId
  const origin = await requestAsPromise(meta.get(originKey)) as {key: string, baselineId: string | null} | undefined
  let baselineId = origin?.baselineId ?? null
  if (!origin) {
    if (existing) {
      if (!Number.isSafeInteger(existing.attempts) || existing.attempts < 0 ||
          existing.correct + existing.incorrect !== existing.attempts ||
          !Number.isSafeInteger(existing.streak) || typeof existing.favorite !== 'boolean')
        throw Error('Progreso heredado inconsistente; no se puede inventar su historial')
      baselineId = crypto.randomUUID()
      journal.add({
        eventId: baselineId, deviceId: counter.deviceId, clock: advance(counter),
        occurredAt: Date.now(), questionId: existing.questionId,
        questionnaireId: existing.questionnaireId, kind: 'legacy-baseline',
        progress: existing
      } satisfies JournalEvent)
    }
    meta.put({key: originKey, baselineId})
  }
  const now = Date.now()
  const isAnswer = 'answer' in op
  const answerOp = isAnswer ? op : null
  journal.add({
    eventId: op.eventId, deviceId: counter.deviceId, clock: advance(counter),
    occurredAt: now, questionId: op.questionId, questionnaireId: canonicalQuestionnaireId,
    kind: isAnswer ? 'answer' : 'favorite',
    ...(baselineId ? {baselineId} : {}),
    ...(answerOp ? {answer: answerOp.answer, correct: answerOp.correct} :
      {favorite: !(existing?.favorite ?? false)})
  } satisfies JournalEvent)
  const before = existing || fresh(op)
  const next: QuestionProgress = answerOp
    ? {...before, attempts: before.attempts + 1,
       correct: before.correct + Number(answerOp.correct),
       incorrect: before.incorrect + Number(!answerOp.correct),
       streak: answerOp.correct ? before.streak + 1 : 0,
       lastAnsweredAt: now, lastAnswer: answerOp.answer, lastCorrect: answerOp.correct,
       updatedAt: now}
    : {...before, favorite: !before.favorite, updatedAt: now}
  progress.put(next)
}
async function transaction<T>(
  stores: string[], job: (tx: IDBTransaction, counter: State) => Promise<T>
): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(stores, 'readwrite')
  const done = txResult(tx)
  try {
    const counter = await state(tx)
    const result = await job(tx, counter)
    tx.objectStore(M).put({key: 'clock', value: counter.clock})
    await done
    return result
  } catch (error) {
    try { tx.abort() } catch { /* transaction already aborted */ }
    await done.catch(() => {})
    throw error
  } finally { db.close() }
}
export async function recordStudyAnswer(operation: AnswerOperation): Promise<void> {
  await transaction([P,J,M], async (tx, counter) => { await apply(tx, counter, operation) })
}
export async function recordFavorite(operation: FavoriteOperation): Promise<void> {
  await transaction([P,J,M], async (tx, counter) => { await apply(tx, counter, operation) })
}
export async function completeExam(
  operations: AnswerOperation[], record: StudySessionRecord
): Promise<StudySessionRecord> {
  if (!record.clientId || !Array.isArray(record.answers))
    throw Error('La entrega necesita un identificador estable y respuestas completas')
  const stableClientId = record.clientId
  return transaction([P,J,M,S], async (tx, counter) => {
    const store = tx.objectStore(S)
    const saved = await requestAsPromise(store.index('clientId').get(stableClientId)) as StudySessionRecord | undefined
    if (saved) {
      if (saved.type !== 'exam' || saved.startedAt !== record.startedAt ||
          JSON.stringify(saved.answers) !== JSON.stringify(record.answers))
        throw Error('La clave de sesión ya pertenece a otro examen')
      return saved // Entire grade + answers were committed atomically: no replay.
    }
    for (const op of operations) await apply(tx, counter, op)
    const savedRecord = {...record}
    const id = await requestAsPromise(store.add(savedRecord))
    return {...savedRecord, id: Number(id)}
  })
}
export async function readJournal(): Promise<JournalEvent[]> {
  const db = await openDb()
  try {
    return await requestAsPromise(db.transaction(J, 'readonly').objectStore(J).getAll()) as JournalEvent[]
  } finally { db.close() }
}
