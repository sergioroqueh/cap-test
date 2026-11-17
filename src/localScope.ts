// Scoped local storage: separate commercial guest, verified accounts and preview.
const PREVIEW = import.meta.env.VITE_CAP_PREVIEW === 'true'
let ownerId: string | null = null
export function setLocalOwner(id: string | null): void {
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Identificador de cuenta no válido')
  ownerId = id
}
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
