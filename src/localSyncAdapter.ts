import { exportFullBackup, restoreFullBackup } from './backupRecovery'
import { ensureLegacySessionIds } from './db'
import { localBackupOwner, localOwnerGeneration } from './localScope'
import { unionRecords, replayProgress } from './syncCore.mjs'
import type { JournalEvent } from './localJournal'
import type { QuestionProgress, StudySessionRecord } from './types'

// R35: local IndexedDB adapter for the C29 contracts. NOT imported by App.
// Never performs HTTP, accesses Supabase or switches cloudConfigured.
// Importing data here is ONLY allowed after a future server has verified JWT,
// RLS, snapshot provenance and an explicit user consent. The local checks are
// defense in depth, not authorization of a remote server.
export type LocalSyncRecords = {
  events: JournalEvent[]
  sessions: StudySessionRecord[]
}
type Identity = {
  verified: boolean
  isAnonymous: boolean
  consented: boolean
  userId: string
}
type Options = {
  enabled?: boolean
  expectedUserId: string
  getVerifiedIdentity: () => Promise<Identity>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]))
  }
  return value
}
async function checksum(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}

export function createLocalSyncAdapter({
  enabled = false, expectedUserId, getVerifiedIdentity
}: Options) {
  const generation = localOwnerGeneration()
  if (!uuid.test(expectedUserId) || expectedUserId !== expectedUserId.toLowerCase())
    throw Error('R35: UUID de cuenta no válido')
  async function checkOwner() {
    if (!enabled) throw Error('R35: sincronización local preparatoria desactivada')
    if (generation !== localOwnerGeneration()) throw Error('R35: el perfil cambió')
    const owner = localBackupOwner()
    if (owner.kind !== 'user' || owner.userId !== expectedUserId)
      throw Error('R35: perfil invitado, preview o de otra cuenta')
    if (typeof getVerifiedIdentity !== 'function')
      throw Error('R35: se necesita verificación real de identidad')
    const identity = await getVerifiedIdentity()
    if (generation !== localOwnerGeneration() ||
        !identity?.verified || identity.isAnonymous !== false ||
        identity.consented !== true || identity.userId !== expectedUserId ||
        localBackupOwner().kind !== 'user' ||
        !('userId' in localBackupOwner()) ||
        (localBackupOwner() as { userId: string }).userId !== expectedUserId)
      throw Error('R35: consentimiento revocado o identidad diferente')
  }
  async function readBackup() {
    await checkOwner()
    const backup = await exportFullBackup()
    await checkOwner()
    if (backup.owner?.kind !== 'user' ||
        backup.owner.userId !== expectedUserId ||
        !Array.isArray(backup.journal))
      throw Error('R35: copia local no pertenece al perfil verificado')
    const replay = new Set(replayProgress(backup.journal).map(row => row.questionId))
    const untracked = backup.progress.filter(row => !replay.has(row.questionId))
    if (untracked.length)
      throw Error('R35: progreso histórico sin diario; requiere baseline manual antes de sincronizar')
    return backup
  }
  return {
    // Backfill writes ONLY stable clientId into the active local owner store,
    // idempotently via C30 transaction. No network operation.
    async ensureSessionIds(_idFactory?: () => string): Promise<void> {
      await checkOwner()
      await ensureLegacySessionIds()
      await checkOwner()
    },
    // A coherent backup is read from ONE IndexedDB readonly transaction.
    async snapshot(): Promise<LocalSyncRecords> {
      const backup = await readBackup()
      return { events: backup.journal!, sessions: backup.sessions }
    },
    // Restore through the existing C31 atomic merge, never clear or overwrite
    // sessions. Legacy counters are never reconstructed as guessed answers.
    async merge(remote: LocalSyncRecords): Promise<void> {
      const local = await readBackup()
      if (!remote || !Array.isArray(remote.events) || !Array.isArray(remote.sessions))
        throw Error('R35: paquete remoto incompleto')
      if (remote.sessions.some(row => row && row.id !== undefined))
        throw Error('R35: los IDs numéricos son exclusivamente locales')
      const incoming = unionRecords({ events: [], sessions: [] }, remote)
      const combined = unionRecords({
        events: local.journal!, sessions: local.sessions
      }, incoming)
      replayProgress(combined.events) // Block provenance and baseline conflicts.
      const unsigned = {
        version: 3,
        exportedAt: new Date().toISOString(),
        owner: { kind: 'user' as const, userId: expectedUserId },
        progress: replayProgress(incoming.events) as QuestionProgress[],
        sessions: incoming.sessions,
        journal: incoming.events
      }
      const ownedBackup = { ...unsigned, checksum: await checksum(unsigned) }
      await checkOwner()
      await restoreFullBackup(ownedBackup)
      await checkOwner() // Never deliver a successful result to an old owner.
    }
  }
}
