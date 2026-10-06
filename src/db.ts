import type { QuestionProgress, StudySessionRecord } from './types'

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

export async function getAllProgress(): Promise<QuestionProgress[]> {
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readonly')
  const rows = await requestAsPromise(tx.objectStore(PROGRESS).getAll())
  db.close()
  return rows
}

export async function putProgress(row: QuestionProgress): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readwrite')
  tx.objectStore(PROGRESS).put(row)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function putManyProgress(rows: QuestionProgress[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(PROGRESS, 'readwrite')
  const store = tx.objectStore(PROGRESS)
  rows.forEach((row) => store.put(row))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function addSession(row: StudySessionRecord): Promise<number> {
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readwrite')
  const id = await requestAsPromise(tx.objectStore(SESSIONS).add(row))
  db.close()
  return Number(id)
}

export async function getRecentSessions(limit = 20): Promise<StudySessionRecord[]> {
  const db = await openDb()
  const tx = db.transaction(SESSIONS, 'readonly')
  const rows = await requestAsPromise(tx.objectStore(SESSIONS).getAll())
  db.close()
  return rows.sort((a, b) => b.completedAt - a.completedAt).slice(0, limit)
}

export async function exportDatabase() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await getAllProgress(),
    sessions: await getRecentSessions(5000)
  }
}

export async function importProgress(rows: QuestionProgress[]) {
  await putManyProgress(rows)
}

export async function clearAllData(): Promise<void> {
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
