// R36: one new integration boundary test, real HTTP + R34 client + R36 protocol.
// It intentionally uses no Supabase project, SQL, credentials, or service_role.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createRemoteSnapshotReader } from '../src/remoteSnapshotReader.mjs'
import { createServerSnapshotProtocol } from '../src/serverSnapshotProtocol.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const event = (name, clock) => ({
  eventId: name, questionId: 'r36-q' + clock,
  questionnaireId: 'hist', deviceId: 'device-local',
  clock, occurredAt: 1795000000000 + clock,
  kind: 'answer', answer: 'A', correct: true
})
const session = {
  clientId: 'r36-session', type: 'exam', label: 'CAP',
  startedAt: 100, completedAt: 200, total: 1,
  answered: 1, correct: 1, incorrect: 0, score: 100,
  answers: [{questionId:'r36-q1',questionnaireId:'hist',
    selected:'A',correctAnswer:'A',correct:true}]
}
async function listen(protocol) {
  const server = createServer(async (req, res) => {
    try {
      const request = new Request('http://127.0.0.1' + req.url, {
        method: req.method, headers: req.headers
      })
      const answer = await protocol.handle(request)
      res.writeHead(answer.status, Object.fromEntries(answer.headers.entries()))
      res.end(await answer.text())
    } catch (error) {
      res.writeHead(500).end('INTERNAL_ERROR')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    origin: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))
  }
}

test('R36 real HTTP contract: pinned complete owner snapshot across both resources', async () => {
  const data = new Map([
    [A, {events:[event('a-1',1),event('a-2',2)],sessions:[session]}],
    [B, {events:[],sessions:[]}]
  ])
  let consistentReads = 0
  let consent = true
  const protocol = createServerSnapshotProtocol({
    verifyAccessToken: async token => {
      const userId = token === 'local-token-A' ? A :
        token === 'local-token-B' ? B : null
      return {verified:!!userId,userId,isAnonymous:false,consented:consent}
    },
    // This is a deliberately frozen, single-call repository interface.
    // Only real PostgreSQL could later guarantee transaction isolation.
    takeConsistentSnapshot: async owner => {
      consistentReads++
      return structuredClone(data.get(owner))
    }
  })
  const http = await listen(protocol)
  try {
    let changed = false
    let pinnedId = null
    const client = createRemoteSnapshotReader({
      enabled: true, endpoint: http.origin, pageSize: 1,
      verifyIdentity: async () => ({
        verified:true,userId:A,isAnonymous:false,consented:true,
        accessToken:'local-token-A'
      }),
      fetchImpl: async (url, options) => {
        const response = await fetch(url, options)
        const parsed = new URL(url)
        if (!changed && parsed.searchParams.get('resource') === 'events' &&
            !parsed.searchParams.has('snapshotId')) {
          pinnedId = (await response.clone().json()).snapshotId
          data.get(A).events.push(event('a-3',3))
          changed = true
        }
        return response
      }
    })
    const initial = await client.pull(A)
    assert.equal(initial.snapshotId, pinnedId)
    assert.deepEqual(initial.events.map(row => row.eventId), ['a-1','a-2'])
    assert.equal(initial.sessions.length, 1)
    assert.equal(consistentReads, 1, 'All pages must share one frozen read')
    const next = await client.pull(A)
    assert.deepEqual(next.events.map(row => row.eventId), ['a-1','a-2','a-3'])
    assert.equal(consistentReads, 2, 'A new pull must see a new snapshot')
    const foreign = await fetch(http.origin + '/sync/v1/snapshot?resource=events&limit=1&snapshotId=' + pinnedId,
      {headers:{authorization:'Bearer local-token-B'}})
    assert.equal(foreign.status, 410, 'B must not use A snapshot')
    const b = createRemoteSnapshotReader({ enabled:true,endpoint:http.origin,
      verifyIdentity:async()=>({verified:true,userId:B,isAnonymous:false,
        consented:true,accessToken:'local-token-B'}) })
    const resultB = await b.pull(B)
    assert.equal(resultB.events.length + resultB.sessions.length, 0)
    const anonymous = await fetch(http.origin + '/sync/v1/snapshot?resource=events&limit=1')
    assert.equal(anonymous.status, 401)
    const invalid = await fetch(http.origin + '/sync/v1/snapshot?resource=events&limit=1&cursor=3',
      {headers:{authorization:'Bearer local-token-A'}})
    assert.equal(invalid.status, 400)
    consent = false
    await assert.rejects(client.pull(A), e => e.code === 'HTTP_FAILURE')
    console.log('R36 PASS: HTTP R34↔R36, pinned data, next-version growth, A/B, guest, revoked consent; 0 cloud calls')
  } finally { await http.close() }
})

test('R36 an expired snapshot is unavailable and requires a new read', async () => {
  let now = 1000
  const protocol = createServerSnapshotProtocol({
    clock: () => now, ttlMs: 1000,
    verifyAccessToken: async () => ({
      verified: true, userId: A, isAnonymous: false, consented: true
    }),
    takeConsistentSnapshot: async () => ({events:[],sessions:[]})
  })
  const http = await listen(protocol)
  try {
    const path = '/sync/v1/snapshot?resource=events&limit=1'
    const headers = {authorization: 'Bearer local-token-A'}
    const first = await fetch(http.origin + path, {headers})
    assert.equal(first.status, 200)
    const {snapshotId} = await first.json()
    now = 2000
    const stale = await fetch(http.origin + path + '&snapshotId=' + snapshotId, {headers})
    assert.equal(stale.status, 410)
    console.log('R36 PASS: snapshot TTL revocation')
  } finally { await http.close() }
})
