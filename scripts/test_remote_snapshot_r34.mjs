import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createRemoteSnapshotReader } from '../src/remoteSnapshotReader.mjs'

// These are local HTTP integration checks, not Supabase/RLS verification.
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const identities = {
  'local-A-token': A,
  'local-B-token': B
}
const event = (n) => ({ eventId: `event-${n}`, questionId: `q${n}`,
  questionnaireId: 'CAP', deviceId: 'device-local', clock: n,
  occurredAt: 1795000000000 + n, kind: 'answer', answer: 'A', correct: true })
const session = { clientId: 'client-local-1', type: 'exam', startedAt: 1795000000000,
  completedAt: 1795001200000, answered: 1, correct: 1, answers: [] }
async function localServer({ badOwner = false, incomplete = false, onRequest } = {}) {
  const requests = []
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const owner = identities[(req.headers.authorization || '').replace(/^Bearer /, '')]
    requests.push({ owner, resource: url.searchParams.get('resource') })
    onRequest?.(requests.length)
    if (!owner || url.pathname !== '/sync/v1/snapshot') {
      res.writeHead(403).end(); return
    }
    const resource = url.searchParams.get('resource')
    const limit = Number(url.searchParams.get('limit'))
    const data = owner === A ? { events: [event(1), event(2)], sessions: [session] } :
      { events: [], sessions: [] }
    const rows = data[resource]
    if (!rows || !Number.isSafeInteger(limit) || limit < 1) {
      res.writeHead(400).end(); return
    }
    const index = Number(url.searchParams.get('cursor') || 0)
    const items = rows.slice(index, index + limit)
    const done = index + limit >= rows.length
    const payload = { schemaVersion: 1, userId: badOwner ? B : owner,
      resource, snapshotId: `snapshot-${owner.slice(0, 8)}`, items, done,
      nextCursor: done ? null : String(index + limit),
      totalRows: incomplete && resource === 'events' ? rows.length + 1 : rows.length }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { endpoint: `http://127.0.0.1:${server.address().port}/`, requests,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
const identity = userId => async () => ({ verified: true, userId,
  isAnonymous: false, consented: true,
  accessToken: userId === A ? 'local-A-token' : 'local-B-token' })

test('R34 gate OFF performs no identity verification and no HTTP requests', async () => {
  let calls = 0
  const reader = createRemoteSnapshotReader({ verifyIdentity: async () => { calls++ } })
  await assert.rejects(reader.pull(A), e => e.code === 'CLOUD_OFF')
  assert.equal(calls, 0)
})

test('R34 loopback HTTP: pages are complete, per-user and isolated A/B', async () => {
  const server = await localServer()
  try {
    const a = createRemoteSnapshotReader({ enabled: true, endpoint: server.endpoint,
      verifyIdentity: identity(A), pageSize: 1 })
    const b = createRemoteSnapshotReader({ enabled: true, endpoint: server.endpoint,
      verifyIdentity: identity(B), pageSize: 1 })
    const resultA = await a.pull(A)
    assert.deepEqual(resultA.events.map(x => x.eventId), ['event-1', 'event-2'])
    assert.equal(resultA.sessions.length, 1)
    const resultB = await b.pull(B)
    assert.equal(resultB.events.length + resultB.sessions.length, 0)
    assert.equal(server.requests.filter(r => r.owner === A).length, 3)
    assert.equal(server.requests.filter(r => r.owner === B).length, 2)
    await assert.rejects(a.pull(B), e => e.code === 'ACCOUNT_SWITCH')
  } finally { await server.close() }
})

test('R34 rejects incomplete pagination and cross-account page', async () => {
  for (const fault of [{ incomplete: true }, { badOwner: true }]) {
    const server = await localServer(fault)
    try {
      const reader = createRemoteSnapshotReader({ enabled: true, endpoint: server.endpoint,
        verifyIdentity: identity(A), pageSize: 1 })
      await assert.rejects(reader.pull(A), e =>
        ['INCOMPLETE_SNAPSHOT', 'PAGE_INVALID'].includes(e.code))
    } finally { await server.close() }
  }
})

test('R34 revocation of consent between HTTP pages blocks the next page', async () => {
  let consent = true
  const server = await localServer({ onRequest: n => { if (n === 1) consent = false } })
  try {
    const reader = createRemoteSnapshotReader({ enabled: true, endpoint: server.endpoint,
      verifyIdentity: async () => ({ ...(await identity(A)()), consented: consent }),
      pageSize: 1 })
    await assert.rejects(reader.pull(A), e => e.code === 'IDENTITY_DENIED')
    assert.equal(server.requests.length, 1)
  } finally { await server.close() }
})
