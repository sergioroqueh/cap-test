import { exportFullBackup } from './backupRecovery'
import { localBackupOwner, localOwnerGeneration } from './localScope'
import { replayProgress } from './syncCore.mjs'

// R34: READ-ONLY preflight. Not imported by App. No network or implicit consent.
// The v3 backup exporter checks journal consistency and calculates SHA-256;
// this corruption checksum is NOT a cryptographic proof of ownership.
export async function inspectCloudUploadPreflight(expectedUserId: string) {
  const owner = localBackupOwner()
  const generation = localOwnerGeneration()
  if (owner.kind !== 'user' || owner.userId !== expectedUserId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedUserId))
    throw Error('La preparación cloud exige el perfil verificado correcto; invitado/preview no válido.')
  const backup = await exportFullBackup()
  if (generation !== localOwnerGeneration() || backup.owner?.kind !== 'user' ||
      backup.owner.userId !== expectedUserId || !Array.isArray(backup.journal))
    throw Error('El perfil cambió o la copia v3 está incompleta. Se cancela la preparación.')
  // Legacy aggregates lacking journal provenance must never upload automatically.
  const replayed = new Set(replayProgress(backup.journal).map(row => row.questionId))
  const legacyUntracked = backup.progress.filter(row => !replayed.has(row.questionId))
  return {
    status: legacyUntracked.length ? 'manual-baseline-required' as const : 'ready-for-review' as const,
    ownerId: expectedUserId,
    questions: backup.progress.length,
    events: backup.journal.length,
    sessions: backup.sessions.length,
    legacyQuestions: legacyUntracked.length,
    localBackupSha256: backup.checksum
  }
}
