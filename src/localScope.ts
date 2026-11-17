// Scoped local storage: separate commercial guest, verified accounts and preview.
const PREVIEW = import.meta.env.VITE_CAP_PREVIEW === 'true'
let ownerId: string | null = null
let ownerGeneration = 0
export function setLocalOwner(id: string | null): void {
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Identificador de cuenta no válido')
  if (ownerId !== id) ownerGeneration++
  ownerId = id
}
export type BackupOwner = { kind: 'guest' | 'preview' } | {kind: 'user'; userId: string}
export function localBackupOwner(): BackupOwner {
  return PREVIEW ? {kind:'preview'} : ownerId ? {kind:'user',userId:ownerId.toLowerCase()} : {kind:'guest'}
}
export function localOwnerGeneration(): number { return ownerGeneration }

function scope(): string { return ownerId ? 'user-' + ownerId : 'guest' }
export function localDbName(): string {
  return PREVIEW ? 'cap-test-preview-local-2026' : 'rutacap-dev-' + scope() + '-v1'
}
export function activeKey(): string {
  return PREVIEW ? 'cap-test-beta-active-v1' : 'rutacap-active-' + scope() + '-v1'
}
export function lastKey(): string {
  return PREVIEW ? 'cap-test-beta-last-v1' : 'rutacap-last-' + scope() + '-v1'
}
export function regionKey(): string {
  return PREVIEW ? 'cap-test-pro-preview-region-v1' : 'rutacap-region-' + scope() + '-v1'
}
