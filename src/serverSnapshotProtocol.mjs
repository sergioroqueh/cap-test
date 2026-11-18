// R36 server-side READ ONLY protocol. Unwired: do not deploy or import in App.
// The caller MUST supply independently verified auth and one coherent transaction
// reading BOTH resources. This module intentionally has no Supabase credentials.
import { unionRecords, replayProgress } from './syncCore.mjs'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const opaque = /^[A-Za-z0-9_-]{1,200}$/
const common = { 'cache-control': 'no-store', vary: 'Authorization',
  'content-type': 'application/json; charset=utf-8' }
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: common })
const deny = () => respond(401, { error: 'UNAUTHORIZED' })
const bad = () => respond(400, { error: 'INVALID_REQUEST' })

/**
 * An isolated routing component, NOT a production implementation.
 *
 * verifyAccessToken(bearer): server-side JWT/user AND active consent verification.
 *   Return {verified:true, userId:<uuid>, isAnonymous:false, consented:true}.
 *   Never decode an unverified token, trust user_metadata or accept userId from URL.
 * takeConsistentSnapshot(userId): read BOTH events and sessions in one consistent
 *   database transaction with owner RLS. This requirement is the responsibility
 *   of the future PostgreSQL adapter; this module cannot guarantee DB isolation.
 *
 * Caller owns HTTP routing, TLS, security headers, rate limiting and observability.
 * No database mutation, service_role, deployment, real project or cloud wiring.
 */
export function createServerSnapshotProtocol({
  verifyAccessToken, takeConsistentSnapshot,
  clock = () => Date.now(), randomId = () => crypto.randomUUID().replaceAll('-', ''),
  ttlMs = 120000, maxSnapshots = 12, maxRows = 200000, maxBytes = 16_000_000
} = {}) {
  if (typeof verifyAccessToken !== 'function' ||
      typeof takeConsistentSnapshot !== 'function' ||
      typeof clock !== 'function' || typeof randomId !== 'function' ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 600000 ||
      !Number.isSafeInteger(maxSnapshots) || maxSnapshots < 1 || maxSnapshots > 32 ||
      !Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 200000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 32_000_000)
    throw Error('R36_INVALID_CONFIG')

  const snapshots = new Map()
  const prune = () => {
    const now = clock()
    for (const [key, value] of snapshots) if (value.expiresAt <= now) snapshots.delete(key)
  }

  async function handle(request) {
    if (request?.method !== 'GET')
      return respond(405, { error: 'METHOD_NOT_ALLOWED' })
    let url
    try { url = new URL(request.url) } catch { return bad() }
    if (url.pathname !== '/sync/v1/snapshot') return respond(404, { error: 'NOT_FOUND' })
    const query = url.searchParams
    if ([...query.keys()].some(key => !['resource', 'limit', 'cursor', 'snapshotId'].includes(key)) ||
        ['resource', 'limit', 'cursor', 'snapshotId'].some(key => query.getAll(key).length > 1))
      return bad()
    const resource = query.get('resource')
    const limitValue = query.get('limit')
    const limit = Number(limitValue)
    if (!['events', 'sessions'].includes(resource) ||
        !/^[1-9][0-9]{0,2}$/.test(limitValue || '') ||
        !Number.isSafeInteger(limit) || limit > 500)
      return bad()
    const snapshotId = query.get('snapshotId')
    const cursor = query.get('cursor')
    if ((snapshotId !== null && !opaque.test(snapshotId)) ||
        (cursor !== null && !/^(0|[1-9][0-9]{0,8})$/.test(cursor)) ||
        (cursor !== null && snapshotId === null))
      return bad()

    // Authorization is checked for EVERY page, including cached snapshot reads.
    const match = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(request.headers.get('authorization') || '')
    if (!match) return deny()
    let identity
    try { identity = await verifyAccessToken(match[1]) } catch { return deny() }
    if (!identity?.verified || identity.isAnonymous !== false ||
        identity.consented !== true || !uuid.test(identity.userId))
      return deny()
    const userId = identity.userId.toLowerCase()
    prune()

    let snap
    if (snapshotId !== null) {
      snap = snapshots.get(snapshotId)
      // Reveal neither existence nor ownership of a foreign snapshot.
      if (!snap || snap.owner !== userId) return respond(410, { error: 'SNAPSHOT_UNAVAILABLE' })
    } else {
      if (snapshots.size >= maxSnapshots)
        return respond(429, { error: 'SNAPSHOT_LIMIT' })
      let records
      try {
        records = await takeConsistentSnapshot(userId)
        if (!records || !Array.isArray(records.events) || !Array.isArray(records.sessions) ||
            records.events.length > maxRows || records.sessions.length > maxRows)
          throw Error('R36_INCOMPLETE_SOURCE')
        const normalized = unionRecords({ events: [], sessions: [] }, records)
        if (normalized.events.length !== records.events.length ||
            normalized.sessions.length !== records.sessions.length)
          throw Error('R36_DUPLICATED_SOURCE_ROWS')
        replayProgress(normalized.events)
        if (JSON.stringify(normalized).length > maxBytes) throw Error('R36_SOURCE_TOO_LARGE')
        records = normalized
      } catch {
        // No incomplete or inconsistent snapshot is returned to the client.
        return respond(503, { error: 'SNAPSHOT_UNAVAILABLE' })
      }
      let id
      try { id = randomId() } catch { return respond(503, { error: 'SNAPSHOT_UNAVAILABLE' }) }
      if (typeof id !== 'string' || !opaque.test(id) || snapshots.has(id))
        return respond(503, { error: 'SNAPSHOT_UNAVAILABLE' })
      snap = { owner: userId, expiresAt: clock() + ttlMs,
        events: records.events, sessions: records.sessions }
      snapshots.set(id, snap)
      snap = { ...snap, id }
    }

    const id = snap.id || snapshotId
    // A previously authorized request may finish after the TTL. Fail closed.
    if (snap.expiresAt <= clock()) {
      snapshots.delete(id)
      return respond(410, { error: 'SNAPSHOT_UNAVAILABLE' })
    }
    const rows = snap[resource]
    const position = cursor === null ? 0 : Number(cursor)
    if (!Number.isSafeInteger(position) || position < 0 || position >= rows.length && position !== 0)
      return bad()
    // R34 rejects any page >3MB. Bound serialization BEFORE responding.
    // This also caps memory/response size independently from requested limit.
    let end = position, bytes = 0
    while (end < rows.length && end - position < limit) {
      const itemBytes = JSON.stringify(rows[end]).length
      if (itemBytes > 2_500_000) return respond(503, { error: 'SNAPSHOT_UNAVAILABLE' })
      if (end > position && bytes + itemBytes > 2_500_000) break
      bytes += itemBytes
      end++
    }
    const done = end >= rows.length
    return respond(200, {
      schemaVersion: 1, userId, resource, snapshotId: id,
      items: rows.slice(position, end), totalRows: rows.length,
      done, nextCursor: done ? null : String(end)
    })
  }

  return { handle }
}
