import type { QuestionProgress, StudySessionRecord } from './types'
import { cloudConfigured, supabase } from './supabase'
import { localDbName } from './localScope'

const DB_VERSION = 2
const PROGRESS = 'progress'
const SESSIONS = 'sessions'
const JOURNAL = 'progressEvents'
const META = 'syncMeta'

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(localDbName(), DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROGRESS)) {
        const store = db.createObjectStore(PROGRESS, { keyPath: 'questionId' })
        store.createIndex('questionnaireId', 'questionnaireId', { unique: false })
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const store = db.createObjectStore(SESSIONS, { keyPath: 'id', autoIncrement: true })
        store.createIndex('completedAt', 'completedAt', { unique: false })
      }
      const sessions = request.transaction!.objectStore(SESSIONS)
      if (!sessions.indexNames.contains('clientId')) sessions.createIndex('clientId', 'clientId', { unique: false })
      if (!db.objectStoreNames.contains(JOURNAL)) db.createObjectStore(JOURNAL, { keyPath: 'eventId' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function localProgress(): Promise<QuestionProgress[]> {
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readonly')
  const rows = await requestAsPromise(tx.objectStore(PROGRESS).getAll())
  db.close()
  return rows
}

// C30: one atomic readwrite backfill, stable forever after first successful commit.
export async function ensureLegacySessionIds(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('No se guardaron los identificadores'))
    tx.onerror = () => reject(tx.error || new Error('Error de IndexedDB'))
  })
  try {
    const store = tx.objectStore(SESSIONS)
    const rows = await requestAsPromise(store.getAll()) as StudySessionRecord[]
    for (const row of rows) if (!row.clientId) store.put({ ...row, clientId: crypto.randomUUID() })
    await done
  } catch (err) {
    try { tx.abort() } catch { /* already completed/aborted */ }
    await done.catch(() => {})
    throw err
  } finally { db.close() }
}
async function localSessions(limit = 5000): Promise<StudySessionRecord[]> {
  await ensureLegacySessionIds()
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readonly')
  try {
    const rows = await requestAsPromise(tx.objectStore(SESSIONS).getAll()) as StudySessionRecord[]
    return rows.sort((a, b) => b.completedAt - a.completedAt).slice(0, limit)
  } finally { db.close() }
}

// The previous direct write is intentionally not used: all quiz answers/favorites
// must flow through src/localJournal.ts to commit progress + event in one transaction.
async function putLocalProgress(row: QuestionProgress): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readwrite')
  tx.objectStore(PROGRESS).put(row)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function addLocalSession(row: StudySessionRecord): Promise<number> {
  if (!row.clientId) throw new Error('Falta el identificador estable de sesión')
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('No se guardó la sesión'))
    tx.onerror = () => reject(tx.error || new Error('Error de IndexedDB'))
  })
  try {
    const store = tx.objectStore(SESSIONS)
    const previous = await requestAsPromise(store.index('clientId').get(row.clientId)) as StudySessionRecord | undefined
    if (previous) {
      if (previous.type !== row.type || previous.startedAt !== row.startedAt ||
          JSON.stringify(previous.answers) !== JSON.stringify(row.answers))
        throw new Error('El identificador pertenece a otra sesión: no se sobrescribe')
      await done
      return Number(previous.id)
    }
    const savedId = await requestAsPromise(store.add(row))
    await done
    return Number(savedId)
  } catch (err) {
    try { tx.abort() } catch { /* already completed/aborted */ }
    await done.catch(() => {})
    throw err
  } finally { db.close() }
}

async function clearLocalData(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([PROGRESS, SESSIONS, JOURNAL, META], 'readwrite')
  tx.objectStore(PROGRESS).clear()
  tx.objectStore(SESSIONS).clear()
  tx.objectStore(JOURNAL).clear()
  tx.objectStore(META).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function replaceLocalData(progress: QuestionProgress[], sessions: StudySessionRecord[]) {
  const db = await openDb()
  const tx = db.transaction([PROGRESS, SESSIONS], 'readwrite')
  const progressStore = tx.objectStore(PROGRESS)
  const sessionStore = tx.objectStore(SESSIONS)
  progressStore.clear()
  sessionStore.clear()
  progress.forEach((row) => progressStore.put(row))
  sessions.forEach(({ id: _id, ...row }) => sessionStore.add(row))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function currentUserId(): Promise<string | null> {
  if (!cloudConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

async function upsertCloudProgress(rows: QuestionProgress[]) {
  if (!supabase || !rows.length) return
  const userId = await currentUserId()
  if (!userId) return
  const payload = rows.map((row) => ({
    user_id: userId,
    question_id: row.questionId,
    data: row,
    updated_at: new Date(row.updatedAt || Date.now()).toISOString()
  }))
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('question_progress').upsert(payload.slice(i, i + 500))
    if (error) throw error
  }
}

async function upsertCloudSessions(rows: StudySessionRecord[]) {
  if (!supabase || !rows.length) return
  const userId = await currentUserId()
  if (!userId) return
  const normalized = rows.map((row) => {
    const clientId = row.clientId || `legacy-${row.completedAt}-${row.startedAt}-${row.label}`
    const data = { ...row, clientId }
    delete data.id
    return {
      user_id: userId,
      client_id: clientId,
      completed_at: row.completedAt,
      data,
      updated_at: new Date(row.completedAt).toISOString()
    }
  })
  for (let i = 0; i < normalized.length; i += 250) {
    const { error } = await supabase.from('study_sessions').upsert(normalized.slice(i, i + 250))
    if (error) throw error
  }
}

export async function synchronizeAccount(): Promise<'cloud' | 'migrated' | 'empty'> {
  if (!cloudConfigured || !supabase) return 'empty'
  throw new Error('La sincronización heredada C15/C28 está bloqueada: requiere adaptador y migración aprobados.')
  /*const userId = await currentUserId()
  if (!userId) return 'empty'

  const [{ data: cloudProgress, error: progressError }, { data: cloudSessions, error: sessionsError }] =
    await Promise.all([
      supabase.from('question_progress').select('data').eq('user_id', userId),
      supabase.from('study_sessions').select('data').eq('user_id', userId).order('completed_at', { ascending: false })
    ])

  if (progressError) throw progressError
  if (sessionsError) throw sessionsError

  const remoteProgress = (cloudProgress || []).map((row: any) => row.data as QuestionProgress)
  const remoteSessions = (cloudSessions || []).map((row: any) => row.data as StudySessionRecord)

  if (remoteProgress.length || remoteSessions.length) {
    await replaceLocalData(remoteProgress, remoteSessions)
    return 'cloud'
  }

  const [existingProgress, existingSessions] = await Promise.all([localProgress(), localSessions()])
  if (existingProgress.length || existingSessions.length) {
    const stampedProgress = existingProgress.map((row) => ({
      ...row,
      updatedAt: row.updatedAt || row.lastAnsweredAt || Date.now()
    }))
    const stampedSessions = existingSessions.map((row) => ({
      ...row,
      clientId: row.clientId || crypto.randomUUID()
    }))
    await Promise.all([upsertCloudProgress(stampedProgress), upsertCloudSessions(stampedSessions)])
    await replaceLocalData(stampedProgress, stampedSessions)
    return 'migrated'
  }

  return 'empty'*/
}

export async function getAllProgress(): Promise<QuestionProgress[]> {
  return localProgress()
}

// Legacy aggregate import only. Quiz must use atomic journal-backed operations.
export async function putProgress(row: QuestionProgress): Promise<void> {
  await putManyProgress([row])
}

export async function putManyProgress(rows: QuestionProgress[]): Promise<void> {
  // A restored aggregate is an opaque legacy baseline, not reconstructed answers.
  const stamped = rows.map((row) => ({ ...row, updatedAt: row.updatedAt || Date.now() }))
  const db = await openDb()
  const tx = db.transaction([PROGRESS, META], 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('Importación cancelada'))
    tx.onerror = () => reject(tx.error || new Error('Error de IndexedDB'))
  })
  try {
    const progress = tx.objectStore(PROGRESS), meta = tx.objectStore(META)
    for (const row of stamped) {
      if (!row.questionId || !row.questionnaireId || !Number.isSafeInteger(row.attempts) ||
          row.attempts < 0 || row.correct + row.incorrect !== row.attempts)
        throw new Error('La copia contiene un registro de progreso inválido')
      const tracked = await requestAsPromise(meta.get('origin:' + row.questionId))
      const existing = await requestAsPromise(progress.get(row.questionId)) as QuestionProgress | undefined
      if (tracked && JSON.stringify(existing) !== JSON.stringify(row))
        throw new Error('No se puede sobrescribir progreso con operaciones registradas; conserva ambas copias.')
      if (!tracked) progress.put(row)
    }
    await done
  } catch (err) {
    try { tx.abort() } catch { /* already completed/aborted */ }
    await done.catch(() => {})
    throw err
  } finally { db.close() }
}

export async function addSession(row: StudySessionRecord): Promise<number> {
  const stamped: StudySessionRecord = { ...row, clientId: row.clientId || crypto.randomUUID() }
  const id = await addLocalSession(stamped)
  try {
    await upsertCloudSessions([stamped])
  } catch (error) {
    console.error('No se pudo sincronizar la sesión con la nube.', error)
  }
  return id
}

export async function getRecentSessions(limit = 20): Promise<StudySessionRecord[]> {
  return localSessions(limit)
}

async function getJournalSnapshotForBackup(): Promise<unknown[]> {
  const db = await openDb()
  try { return await requestAsPromise(db.transaction(JOURNAL, 'readonly').objectStore(JOURNAL).getAll()) }
  finally { db.close() }
}

export async function exportDatabase() {
  return {
    version: 3,
    journal: await getJournalSnapshotForBackup(),
    exportedAt: new Date().toISOString(),
    progress: await localProgress(),
    sessions: await localSessions(Number.MAX_SAFE_INTEGER)
  }
}

export async function importProgress(rows: QuestionProgress[]) {
  await putManyProgress(rows)
}

export async function pushLocalSnapshotToCloud() {
  if (!cloudConfigured) return
  const [progress, sessions] = await Promise.all([localProgress(), localSessions()])
  await Promise.all([upsertCloudProgress(progress), upsertCloudSessions(sessions)])
}

export async function clearLocalCache() {
  await clearLocalData()
}

export async function clearAllData(): Promise<void> {
  await clearLocalData()
  if (!cloudConfigured || !supabase) return
  const userId = await currentUserId()
  if (!userId) return
  const [{ error: p }, { error: s }] = await Promise.all([
    supabase.from('question_progress').delete().eq('user_id', userId),
    supabase.from('study_sessions').delete().eq('user_id', userId)
  ])
  if (p) throw p
  if (s) throw s
}
