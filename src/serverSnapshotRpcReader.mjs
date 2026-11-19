// R41 SERVER ONLY: a disabled-by-default, user JWT-scoped RPC adapter.
// This module does NOT import the PWA's Supabase client, read env values,
// create cloud clients, or connect to any service until explicitly enabled
// and invoked by a trusted server. No service_role/secret keys, ever.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bearer = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const fail = () => { throw Error('R41_SNAPSHOT_UNAVAILABLE') }

/**
 * This transport MUST be used only after R38.verifyAccessToken has checked
 * signed JWT, active session and persisted consent for the SAME request.
 * R36 forwards the original JWT, sessionId and consentRevision into this RPC.
 * PostgreSQL / PostgREST must verify that JWT again and R39's SECURITY INVOKER
 * function independently checks its signed user, session and consent revision.
 *
 * The HTTP response is a single, consistent SQL statement, not two requests.
 * No owner id appears in URL or RPC arguments. On an error or NULL response,
 * fail closed: never turn an inaccessible snapshot into an empty one.
 *
 * Config is supplied by a future dedicated server, not imported from .env
 * at module evaluation. enabled defaults to false; do not enable until a
 * separately approved backend rollout. fetchImpl supports isolated tests.
 */
export function createServerSnapshotRpcReader({
  enabled = false,
  projectUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  maxResponseBytes = 16_000_000
} = {}) {
  if (typeof enabled !== 'boolean' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000 ||
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1024 || maxResponseBytes > 20_000_000 ||
      typeof fetchImpl !== 'function') throw Error('R41_INVALID_CONFIG')

  // Inactive by default, and no configuration or external requests required.
  if (!enabled) return async function takeConsistentSnapshot() {
    throw Error('R41_CLOUD_DISABLED')
  }

  let url
  try { url = new URL(projectUrl) } catch { throw Error('R41_INVALID_CONFIG') }
  if (url.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '') ||
      typeof publishableKey !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey))
    throw Error('R41_INVALID_CONFIG')

  const endpoint = url.origin + '/rest/v1/rpc/rc_read_consistent_snapshot_v2'

  return async function takeConsistentSnapshot(userId, scope = {}) {
    const token = scope?.accessToken
    const sessionId = scope?.sessionId
    const revision = scope?.consentRevision
    if (typeof userId !== 'string' || !uuid.test(userId) ||
        typeof sessionId !== 'string' || !uuid.test(sessionId) ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        typeof token !== 'string' || token.length < 20 || token.length > 8192 ||
        !bearer.test(token)) return fail()

    // JWT is passed exclusively in Authorization. Never decode a JWT to
    // decide ownership; R38 gate + PostgREST signature checks own this.
    // Publishing key is required only for project routing, not RLS bypass.
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({
          p_expected_consent_revision: revision,
          p_expected_session_id: sessionId.toLowerCase()
        }),
        cache: 'no-store',
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (!response || response.ok !== true || response.status !== 200 ||
          typeof response.text !== 'function') return fail()
      const raw = await response.text()
      if (typeof raw !== 'string' ||
          Buffer.byteLength(raw, 'utf8') > maxResponseBytes) return fail()
      const payload = JSON.parse(raw)
      if (!payload || Array.isArray(payload) || typeof payload !== 'object' ||
          payload.schemaVersion !== 1 ||
          payload.userId !== userId.toLowerCase() ||
          !Array.isArray(payload.events) ||
          !Array.isArray(payload.sessions) ||
          payload.events.length > 5000 || payload.sessions.length > 5000 ||
          payload.events.some(e => !e || typeof e !== 'object' || Array.isArray(e)) ||
          payload.sessions.some(s => !s || typeof s !== 'object' || Array.isArray(s)))
        return fail()
      return {events: payload.events, sessions: payload.sessions}
    } catch {
      // A network failure, expired/invalid JWT, RLS refusal, missing consent,
      // malformed JSON, size overflow or missing function all fail closed.
      return fail()
    }
  }
}
