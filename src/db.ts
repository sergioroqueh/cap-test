import type { QuestionProgress, StudySessionRecord } from './types'
import { cloudConfigured, supabase } from './supabase'

const DB_NAME = 'cap-test-2026'
const DB_VERSION = 1
const PROGRESS = 'progress'
const SESSIONS = 'sessions'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
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
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
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

async function localSessions(limit = 5000): Promise<StudySessionRecord[]> {
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readonly')
  const rows = await requestAsPromise(tx.objectStore(SESSIONS).getAll())
  db.close()
  return rows.sort((a, b) => b.completedAt - a.completedAt).slice(0, limit)
}

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
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readwrite')
  const id = await requestAsPromise(tx.objectStore(SESSIONS).add(row))
  db.close()
  return Number(id)
}

async function clearLocalData(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([PROGRESS, SESSIONS], 'readwrite')
  tx.objectStore(PROGRESS).clear()
  tx.objectStore(SESSIONS).clear()
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
  if (!supabase) return 'empty'
  const userId = await currentUserId()
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

  return 'empty'
}

export async function getAllProgress(): Promise<QuestionProgress[]> {
  return localProgress()
}

export async function putProgress(row: QuestionProgress): Promise<void> {
  const stamped = { ...row, updatedAt: Date.now() }
  await putLocalProgress(stamped)
  try {
    await upsertCloudProgress([stamped])
  } catch (error) {
    console.error('No se pudo sincronizar el progreso con la nube.', error)
  }
}

export async function putManyProgress(rows: QuestionProgress[]): Promise<void> {
  const stamped = rows.map((row) => ({ ...row, updatedAt: row.updatedAt || Date.now() }))
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readwrite')
  const store = tx.objectStore(PROGRESS)
  stamped.forEach((row) => store.put(row))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  await upsertCloudProgress(stamped)
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

export async function exportDatabase() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    progress: await localProgress(),
    sessions: await localSessions(5000)
  }
}

export async function importProgress(rows: QuestionProgress[]) {
  await putManyProgress(rows)
}

export async function pushLocalSnapshotToCloud() {
  const [progress, sessions] = await Promise.all([localProgress(), localSessions()])
  await Promise.all([upsertCloudProgress(progress), upsertCloudSessions(sessions)])
}

export async function clearLocalCache() {
  await clearLocalData()
}

export async function clearAllData(): Promise<void> {
  await clearLocalData()
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) return
  const [{ error: p }, { error: s }] = await Promise.all([
    supabase.from('question_progress').delete().eq('user_id', userId),
    supabase.from('study_sessions').delete().eq('user_id', userId)
  ])
  if (p) throw p
  if (s) throw s
}
