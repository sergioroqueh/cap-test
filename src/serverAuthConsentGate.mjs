// R38 server-only AUTH + CONSENT gate. Not imported by Vite UI, not deployed.
// All dependencies are injected so no Supabase requests occur until explicitly
// wired to a dedicated server with real credentials and an approved schema.
// This is not a substitute for JWT-verifying RLS on every DB operation.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validRevision = n => Number.isSafeInteger(n) && n > 0

/**
 * createAuthClient MUST instantiate a NEW Supabase Auth client for each request
 * (publishable key, no shared user session, persistSession: false).
 * Both getClaims(jwt) and getUser(jwt) must be called with the supplied JWT.
 * getClaims validates signature+expiry; getUser consults Auth for current user.
 *
 * checkActiveSession independently checks a server-authoritative store for the
 * verified sessionId. Do NOT infer session liveness from an unexpired JWT.
 * readConsent independently reads a persisted, revocable consent record under
 * the verified owner, NEVER from metadata, cookies or user-supplied JSON.
 * Both checks MUST fail closed when the backing service is unavailable.
 *
 * This gate is per-page; R36 pins consentRevision and sessionId into snapshots.
 * A real future backend MUST also enforce consent in the same DB transaction
 * that assembles the initial snapshot (no linearizability guarantee here).
 */
export function createServerAuthConsentGate({
  createAuthClient, checkActiveSession, readConsent, expectedIssuer,
  purpose = 'progress-sync', now = () => Date.now()
} = {}) {
  if (typeof createAuthClient !== 'function' ||
      typeof checkActiveSession !== 'function' ||
      typeof readConsent !== 'function' ||
      typeof now !== 'function' ||
      typeof expectedIssuer !== 'string' ||
      !/^https:\/\/[A-Za-z0-9.-]+\/auth\/v1$/.test(expectedIssuer) ||
      purpose !== 'progress-sync') throw Error('R38_INVALID_CONFIG')

  return async function verifyAccessToken(jwt) {
    // This method can be passed directly to R36.verifyAccessToken.
    // Do not log the token or the Auth provider's response.
    if (typeof jwt !== 'string' || jwt.length < 20 || jwt.length > 8192 ||
        !/^[A-Za-z0-9_.-]+$/.test(jwt)) return null
    try {
      const client = await createAuthClient()
      if (typeof client?.auth?.getClaims !== 'function' ||
          typeof client.auth.getUser !== 'function') return null
      const claimsResult = await client.auth.getClaims(jwt)
      if (claimsResult?.error) return null
      const c = claimsResult?.data?.claims
      const seconds = Math.floor(now() / 1000)
      if (!c || !uuid.test(c.sub) || !uuid.test(c.session_id) ||
          c.iss !== expectedIssuer ||
          !(c.aud === 'authenticated' ||
            Array.isArray(c.aud) && c.aud.includes('authenticated')) ||
          c.role !== 'authenticated' || c.is_anonymous !== false ||
          !Number.isSafeInteger(c.exp) || c.exp <= seconds ||
          (c.nbf !== undefined && (!Number.isSafeInteger(c.nbf) || c.nbf > seconds)))
        return null

      // getUser makes a fresh Supabase Auth network request. Still require
      // explicit session membership: signed-out JWTs may live until expiry.
      const userResult = await client.auth.getUser(jwt)
      if (userResult?.error || !userResult?.data?.user ||
          userResult.data.user.id !== c.sub ||
          userResult.data.user.is_anonymous !== false) return null

      const userId = c.sub.toLowerCase()
      const sessionId = c.session_id.toLowerCase()
      const active = await checkActiveSession({ userId, sessionId })
      if (active !== true) return null
      const consent = await readConsent({ userId, purpose })
      if (!consent || consent.userId !== userId ||
          consent.purpose !== purpose || consent.granted !== true ||
          !validRevision(consent.revision) || consent.revokedAt !== null)
        return null

      return {
        verified: true, userId, isAnonymous: false, consented: true,
        sessionId, consentRevision: consent.revision
      }
    } catch {
      return null
    }
  }
}
