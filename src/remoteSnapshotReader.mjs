// R34 preparatory, READ-ONLY contract. Not imported by the app.
// No live endpoint, Supabase dependency, data writes or implicit opt-in.
// The future server MUST authenticate bearer JWT independently, enforce owner RLS,
// and materialize a consistent two-resource snapshot behind snapshotId.
import { createAccountSyncLease, SyncLeaseError } from './remoteSyncContract.mjs'
import { unionRecords, replayProgress } from './syncCore.mjs'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
const fail = (code, message) => { throw new SyncLeaseError(code, message) }

function originOf(value) {
  let url
  try { url = new URL(value) } catch { fail('ENDPOINT_INVALID', 'Sync endpoint URL is invalid') }
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    fail('ENDPOINT_INVALID', 'Endpoint must be an HTTPS origin (or local loopback HTTP)')
  return url.origin
}

/**
 * verifyIdentity MUST independently revalidate auth with the identity provider
 * on every invocation, not merely decode cached JWT or trust user_metadata.
 * It returns {verified:true,isAnonymous:false,consented:true,userId,accessToken}.
 * This client check is defense in depth; only server JWT verification + RLS authorize.
 *
 * Protocol GET /sync/v1/snapshot?resource=events|sessions&limit=N
 *   &snapshotId=<opaque> (after first page)&cursor=<opaque> (after each page).
 * Response: {schemaVersion:1,userId,resource,snapshotId,items,done,
 *            nextCursor:null|string,totalRows:integer}.
 * Server must pin BOTH resources to one immutable, transactionally consistent
 * snapshotId, enforce TTL and return no partial/filtered owner snapshot.
 */
export function createRemoteSnapshotReader({ enabled = false, endpoint,
  verifyIdentity, fetchImpl = globalThis.fetch, pageSize = 100,
  maxPages = 3000, maxRows = 200000 } = {}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 5000 ||
      !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 200000)
    fail('CONFIG_INVALID', 'Sync reader bounds are invalid')
  // Fail closed; even badly configured live URLs cannot be contacted by default.
  const origin = enabled ? originOf(endpoint) : null
  if (enabled && (typeof verifyIdentity !== 'function' || typeof fetchImpl !== 'function'))
    fail('CONFIG_INVALID', 'Identity verification and fetch are required')
  const lease = createAccountSyncLease({ enabled, getVerifiedIdentity: verifyIdentity })

  async function readPage(resource, cursor, pinnedSnapshot, expectedUserId) {
    return lease.execute(async ({ userId, signal }) => {
      if (userId !== expectedUserId) fail('ACCOUNT_SWITCH', 'Requested owner differs from verified owner')
      // A fresh verified token is obtained per page. The lease checks again AFTER
      // the fetch and discards any response after logout, switch or revoked consent.
      const identity = await verifyIdentity()
      if (!identity?.verified || identity.isAnonymous !== false || identity.consented !== true ||
          identity.userId !== userId || !uuid.test(identity.userId) ||
          typeof identity.accessToken !== 'string' || !identity.accessToken.trim())
        fail('IDENTITY_DENIED', 'Unverified, unconsented or changed identity')
      if (signal.aborted) fail('CANCELLED', 'Owner changed before the request')
      const url = new URL('/sync/v1/snapshot', origin)
      url.searchParams.set('resource', resource)
      url.searchParams.set('limit', String(pageSize))
      if (pinnedSnapshot) url.searchParams.set('snapshotId', pinnedSnapshot)
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await fetchImpl(url.toString(), {
        method: 'GET', signal, cache: 'no-store', redirect: 'error',
        headers: { Authorization: `Bearer ${identity.accessToken}`,
          Accept: 'application/json', 'Cache-Control': 'no-store' }
      })
      if (!response?.ok) fail('HTTP_FAILURE', 'Snapshot endpoint rejected request')
      const body = await response.text()
      if (body.length > 3_000_000) fail('PAGE_TOO_LARGE', 'Remote snapshot page exceeds cap')
      let page
      try { page = JSON.parse(body) } catch { fail('PAGE_INVALID', 'Invalid snapshot JSON') }
      if (!page || page.schemaVersion !== 1 || page.userId !== userId ||
          page.resource !== resource || !opaque(page.snapshotId) ||
          (pinnedSnapshot && page.snapshotId !== pinnedSnapshot) ||
          !Array.isArray(page.items) || page.items.length > pageSize ||
          typeof page.done !== 'boolean' ||
          !Number.isSafeInteger(page.totalRows) || page.totalRows < 0 ||
          page.totalRows > maxRows ||
          (page.done ? page.nextCursor !== null : !opaque(page.nextCursor)))
        fail('PAGE_INVALID', 'Invalid, partial or cross-account snapshot page')
      return page
    })
  }

  async function pull(expectedUserId) {
    if (!enabled) fail('CLOUD_OFF', 'Remote sync reader is disabled')
    if (typeof expectedUserId !== 'string' || !uuid.test(expectedUserId))
      fail('OWNER_INVALID', 'A verified account UUID is required')
    let snapshotId = null
    let pagesRead = 0
    const result = { events: [], sessions: [] }
    for (const resource of ['events', 'sessions']) {
      let cursor = null
      let expectedTotal = null
      const cursors = new Set()
      while (true) {
        if (++pagesRead > maxPages) fail('PAGE_LIMIT', 'Snapshot page count exceeds cap')
        const page = await readPage(resource, cursor, snapshotId, expectedUserId)
        if (snapshotId === null) snapshotId = page.snapshotId
        if (page.totalRows !== (expectedTotal ?? page.totalRows))
          fail('COUNT_MISMATCH', 'Snapshot total changed between pages')
        expectedTotal = page.totalRows
        result[resource].push(...page.items)
        if (result[resource].length > maxRows || result[resource].length > expectedTotal)
          fail('COUNT_MISMATCH', 'Snapshot has more rows than declared')
        if (page.done) break
        if (page.nextCursor === cursor || cursors.has(page.nextCursor))
          fail('CURSOR_LOOP', 'Snapshot pagination repeats a cursor')
        cursors.add(page.nextCursor)
        cursor = page.nextCursor
      }
      if (result[resource].length !== expectedTotal)
        fail('INCOMPLETE_SNAPSHOT', 'Snapshot ended before all rows were transferred')
    }
    const validated = unionRecords({ events: [], sessions: [] }, result)
    if (validated.events.length !== result.events.length ||
        validated.sessions.length !== result.sessions.length)
      fail('DUPLICATED_PAGE', 'Server repeated a record across pages')
    replayProgress(validated.events) // refuse overlapping historical baselines
    return { ...validated, snapshotId } // Only a verified, complete snapshot is returned.
  }

  return { pull, revoke: lease.revoke, get signal() { return lease.signal } }
}
