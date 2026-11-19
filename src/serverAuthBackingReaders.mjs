// R42 server-only backing readers. No PWA imports, credential storage or
// service_role/secret key. Disabled by default and fail-closed on every error.
// Caller MUST first verify JWT via R38 getClaims/getUser; PostgREST independently
// verifies the same bearer and runs RLS.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const validId = x => typeof x === 'string' && uuid.test(x)
const validToken = x => typeof x === 'string' && x.length >= 20 &&
  x.length <= 8192 && tokenShape.test(x)

export function createServerAuthBackingReaders({
  enabled = false, projectUrl, publishableKey,
  fetchImpl = globalThis.fetch, timeoutMs = 8000, maxResponseBytes = 8192
} = {}) {
  if (typeof enabled !== 'boolean' || typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000 ||
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1024 || maxResponseBytes > 32768)
    throw Error('R42_INVALID_CONFIG')

  if (!enabled) return {
    checkActiveSession: async () => false,
    readConsent: async () => null
  }

  let url
  try { url = new URL(projectUrl) } catch { throw Error('R42_INVALID_CONFIG') }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash ||
      url.pathname !== '/' || typeof publishableKey !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey))
    throw Error('R42_INVALID_CONFIG')
  const root = url.origin + '/rest/v1/'

  async function readJson(path, method, token) {
    if (!validToken(token)) return null
    try {
      const response = await fetchImpl(root + path, {
        method, headers: {
          apikey: publishableKey,
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          ...(method === 'POST' ? {'Content-Type':'application/json'} : {})
        },
        ...(method === 'POST' ? {body:'{}'} : {}),
        cache:'no-store',credentials:'omit',redirect:'error',
        signal:AbortSignal.timeout(timeoutMs)
      })
      if (!response || !response.ok || response.status !== 200 ||
          typeof response.text !== 'function') return null
      const raw = await response.text()
      if (typeof raw !== 'string' ||
          Buffer.byteLength(raw,'utf8') > maxResponseBytes) return null
      return JSON.parse(raw)
    } catch { return null }
  }

  async function checkActiveSession({userId,sessionId,accessToken} = {}) {
    if (!validId(userId) || !validId(sessionId) || !validToken(accessToken))
      return false
    // No user/session identifiers sent as RPC args; SQL derives them from JWT.
    const result = await readJson('rpc/rc_is_active_session_v1','POST',accessToken)
    return result === true
  }

  async function readConsent({userId,purpose,accessToken} = {}) {
    if (!validId(userId) || purpose !== 'progress-sync' ||
        !validToken(accessToken)) return null
    // No user_id filter: owner RLS must perform isolation and return at most 1.
    const path = 'rc_sync_consents?select=user_id,purpose,notice_version,granted,revision,revoked_at' +
      '&purpose=eq.progress-sync&limit=2'
    const rows = await readJson(path,'GET',accessToken)
    if (!Array.isArray(rows) || rows.length !== 1) return null
    const c = rows[0]
    if (!c || !validId(c.user_id) ||
        c.user_id.toLowerCase() !== userId.toLowerCase() ||
        c.purpose !== purpose || c.notice_version !== 'progress-sync-v1' ||
        typeof c.granted !== 'boolean' ||
        !Number.isSafeInteger(c.revision) || c.revision < 1 ||
        !(c.revoked_at === null || typeof c.revoked_at === 'string'))
      return null
    return {userId:c.user_id.toLowerCase(),purpose:c.purpose,
      granted:c.granted,revision:c.revision,revokedAt:c.revoked_at}
  }
  return {checkActiveSession,readConsent}
}
