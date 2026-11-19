// R41 focused contract, no connected Supabase, no SQL changes, no cloud.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServerSnapshotProtocol } from '../src/serverSnapshotProtocol.mjs'
import { createServerSnapshotRpcReader } from '../src/serverSnapshotRpcReader.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const tokenA = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.signatureAforR41'
const tokenB = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJiIn0.signatureBforR41'
const projectUrl = 'https://r41-fixture.supabase.co'
const publishableKey = 'sb_publishable_r41TESTKEYONLY'
const event = {
  eventId:'r41-event-1', questionId:'r41-q1', questionnaireId:'hist',
  deviceId:'test', clock:1, occurredAt:1000, kind:'answer',
  answer:'A', correct:true
}
const session = {
  clientId:'r41-session-1', type:'study', startedAt:1,
  completedAt:2, answered:1,correct:1,incorrect:0,
  answers:[{questionId:'r41-q1',selected:'A',correctAnswer:'A',correct:true}]
}
const snapshot = (owner=A) => ({schemaVersion:1,userId:owner,
  events:[event],sessions:[session]})
const request = (token, resource='events') =>
  new Request('https://isolated.invalid/sync/v1/snapshot?resource='+resource+'&limit=10',
    {headers:{authorization:'Bearer '+token}})

test('R41 user-scoped RPC uses verified R38 context and rejects stale/foreign data', async () => {
  let calls = []
  let consentRevision = 1
  let mode = 'ok'
  const mockFetch = async (url, options) => {
    calls.push({url,options})
    if (mode === 'fail-http') return new Response('denied',{status:401})
    if (mode === 'null') return new Response('null',{status:200})
    if (mode === 'garbage') return new Response('not-json',{status:200})
    if (mode === 'foreign') return Response.json(snapshot(B))
    if (mode === 'oversized') return Response.json({...snapshot(),x:'z'.repeat(4000)})
    const args = JSON.parse(options.body)
    if (args.p_expected_consent_revision !== consentRevision ||
        args.p_expected_session_id !== SA)
      return new Response('null',{status:200})
    return Response.json(snapshot())
  }
  const disabled = createServerSnapshotRpcReader({fetchImpl:mockFetch})
  await assert.rejects(disabled(A,{accessToken:tokenA,sessionId:SA,consentRevision:1}),
    /R41_CLOUD_DISABLED/)
  assert.equal(calls.length,0,'disabled reader touched the network')

  assert.throws(() => createServerSnapshotRpcReader({
    enabled:true,projectUrl,publishableKey:'sb_secret_not_allowed',fetchImpl:mockFetch
  }),/R41_INVALID_CONFIG/)
  assert.throws(() => createServerSnapshotRpcReader({
    enabled:true,projectUrl:'http://r41-fixture.supabase.co',publishableKey,fetchImpl:mockFetch
  }),/R41_INVALID_CONFIG/)

  const reader = createServerSnapshotRpcReader({
    enabled:true,projectUrl,publishableKey,fetchImpl:mockFetch,maxResponseBytes:2000
  })
  let verified = true
  const gate = async jwt => {
    if (!verified || jwt !== tokenA) return null
    return {verified:true,userId:A,isAnonymous:false,consented:true,
      sessionId:SA,consentRevision}
  }
  const p = createServerSnapshotProtocol({
    verifyAccessToken:gate,takeConsistentSnapshot:reader
  })
  const first = await p.handle(request(tokenA))
  assert.equal(first.status,200)
  const firstBody = await first.json()
  assert.deepEqual(firstBody.items,[event])
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,projectUrl+'/rest/v1/rpc/rc_read_consistent_snapshot_v2')
  assert.equal(calls[0].options.method,'POST')
  assert.equal(calls[0].options.headers.apikey,publishableKey)
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+tokenA)
  assert.deepEqual(JSON.parse(calls[0].options.body),
    {p_expected_consent_revision:1,p_expected_session_id:SA})
  assert.equal(JSON.stringify(calls[0].options.body).includes(A),false,
    'userId cannot be asserted in RPC arguments')
  assert.equal((await p.handle(request(tokenA,'sessions'))).status,200)

  const usedBefore = calls.length
  assert.equal((await p.handle(request(tokenB))).status,401)
  assert.equal(calls.length,usedBefore,'rejected JWT was forwarded to RPC')

  verified = false
  assert.equal((await p.handle(request(tokenA))).status,401)
  assert.equal(calls.length,usedBefore)
  verified = true

  for (const nextMode of ['fail-http','null','garbage','foreign','oversized']) {
    mode = nextMode
    assert.equal((await p.handle(request(tokenA))).status,503,nextMode)
  }
  mode = 'ok'
  consentRevision = 2
  const oldId = firstBody.snapshotId
  const stale = await p.handle(new Request(
    'https://isolated.invalid/sync/v1/snapshot?resource=events&limit=10&snapshotId='+oldId,
    {headers:{authorization:'Bearer '+tokenA}}))
  assert.equal(stale.status,410,'old consent revision resumed the snapshot')
  assert.equal((await p.handle(request(tokenA))).status,200,'new revision reads again')
  assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer '+tokenA))
  console.log('R41 PASS: fail-closed scoped RPC, session/revision and no network while disabled')
})
