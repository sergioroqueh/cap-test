// R38 targeted AUTH boundary check: *real RSA signatures* created locally,
// then passed through a SUPABASE-SHAPED Auth adapter. No Supabase requests.
// Unlike an unverified decode, altered signatures are cryptographically rejected.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { createServerAuthConsentGate } from '../src/serverAuthConsentGate.mjs'
import { createServerSnapshotProtocol } from '../src/serverSnapshotProtocol.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SA = '11111111-aaaa-4111-8111-111111111111'
const SB = '22222222-bbbb-4222-8222-222222222222'
const ISS = 'https://dev-rutacap.invalid/auth/v1'
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const now = 1795000000000
const signJwt = (sub, session_id, overrides = {}) => {
  const header = Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })).toString('base64url')
  const claims = { iss:ISS,sub,session_id,role:'authenticated',
    aud:'authenticated',is_anonymous:false,exp:Math.floor(now/1000)+3600,
    ...overrides }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const message = header + '.' + payload
  const signature = sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')
  return message + '.' + signature
}
const parseVerified = jwt => {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (header.alg !== 'RS256') return null
    const verified = verify('RSA-SHA256',
      Buffer.from(parts[0]+'.'+parts[1]), publicKey,
      Buffer.from(parts[2], 'base64url'))
    return verified ? JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) : null
  } catch { return null }
}
const event = (owner, n) => ({eventId:owner+'-e'+n,questionId:'q'+n,
  questionnaireId:'hist',deviceId:'local-r38',clock:n,occurredAt:now+n,
  kind:'answer',answer:'A',correct:true})
const signedA = signJwt(A,SA)
const signedB = signJwt(B,SB)
const consent = new Map([
  [A, {userId:A,purpose:'progress-sync',granted:true,revision:1,revokedAt:null}],
  [B, {userId:B,purpose:'progress-sync',granted:true,revision:1,revokedAt:null}]
])
const active = new Set([A+':'+SA, B+':'+SB])
const authGate = createServerAuthConsentGate({
  expectedIssuer:ISS, now:()=>now,
  createAuthClient:async()=>({auth:{
    getClaims:async jwt=>{
      const claims=parseVerified(jwt)
      return claims? {data:{claims},error:null} : {data:null,error:new Error('invalid signature')}
    },
    getUser:async jwt=>{
      const claims=parseVerified(jwt)
      return claims ? {data:{user:{id:claims.sub,is_anonymous:claims.is_anonymous}},error:null}
        : {data:null,error:new Error('invalid token')}
    }
  }}),
  checkActiveSession:async({userId,sessionId})=>active.has(userId+':'+sessionId),
  readConsent:async({userId})=>structuredClone(consent.get(userId) ?? null)
})
const protocol = createServerSnapshotProtocol({
  verifyAccessToken:authGate,
  takeConsistentSnapshot:async owner=>({
    events:[event(owner,1),event(owner,2)],sessions:[]
  })
})
const query = (jwt, params) =>
  protocol.handle(new Request('https://local.invalid/sync/v1/snapshot?'+params, {
    headers:{authorization:'Bearer '+jwt}
  }))

test('R38 signed JWT, real signature rejection, session and consent revision A/B', async()=>{
  assert.equal((await authGate(signedA)).userId,A)
  assert.equal((await authGate(signedB)).userId,B)

  const parts = signedA.split('.')
  const forgery = parts[0]+'.'+Buffer.from(JSON.stringify({
    ...parseVerified(signedA),sub:B
  })).toString('base64url')+'.'+parts[2]
  assert.equal(await authGate(forgery),null,'Forged subject accepted')
  assert.equal(await authGate(signJwt(A,SA,{exp:Math.floor(now/1000)-5})),null)
  assert.equal(await authGate(signJwt(A,SA,{iss:'https://evil.invalid/auth/v1'})),null)
  assert.equal(await authGate(signJwt(A,SA,{is_anonymous:true})),null)
  assert.equal(await authGate(signJwt(A,SA,{role:'service_role'})),null)

  const initial = await query(signedA,'resource=events&limit=1')
  assert.equal(initial.status,200)
  const page = await initial.json()
  assert.equal(page.userId,A)
  assert.equal(page.items[0].eventId,A+'-e1')
  assert.equal(page.done,false)
  const next = await query(signedA,'resource=events&limit=1&snapshotId='+page.snapshotId+'&cursor='+page.nextCursor)
  assert.equal(next.status,200)
  assert.equal((await next.json()).items[0].eventId,A+'-e2')

  const foreign = await query(signedB,'resource=events&limit=1&snapshotId='+page.snapshotId)
  assert.equal(foreign.status,410)
  consent.set(A,{userId:A,purpose:'progress-sync',granted:false,revision:2,revokedAt:'2026-11-18T22:00:00Z'})
  assert.equal((await query(signedA,'resource=events&limit=1&snapshotId='+page.snapshotId)).status,401)
  consent.set(A,{userId:A,purpose:'progress-sync',granted:true,revision:3,revokedAt:null})
  assert.equal((await query(signedA,'resource=events&limit=1&snapshotId='+page.snapshotId)).status,410,
    'Old consent revision must not revive an earlier snapshot')
  const refreshed = await query(signedA,'resource=events&limit=1')
  assert.equal(refreshed.status,200)
  active.delete(A+':'+SA)
  assert.equal((await query(signedA,'resource=events&limit=1')).status,401)
  assert.equal((await query(signedB,'resource=events&limit=1')).status,200)
  console.log('R38 PASS: RSA-signed JWT, tamper/expiry/issuer/guest denied, A/B, session revocation, consent revoke/regrant epoch; no cloud')
})

test('R38 revocation during snapshot creation fails closed', async()=>{
  const activeConsent = new Map([[A,{userId:A,purpose:'progress-sync',
    granted:true,revision:5,revokedAt:null}]])
  const gate = createServerAuthConsentGate({
    expectedIssuer:ISS,now:()=>now,
    createAuthClient:async()=>({auth:{
      getClaims:async jwt=>({data:{claims:parseVerified(jwt)}}),
      getUser:async jwt=>({data:{user:{id:parseVerified(jwt)?.sub,is_anonymous:false}}})
    }}),
    checkActiveSession:async()=>true,
    readConsent:async({userId})=>activeConsent.get(userId)
  })
  const p = createServerSnapshotProtocol({
    verifyAccessToken:gate,
    takeConsistentSnapshot:async()=>{
      activeConsent.get(A).granted=false
      activeConsent.get(A).revision++
      activeConsent.get(A).revokedAt='2026-11-18T22:00:00Z'
      return {events:[],sessions:[]}
    }
  })
  const r = await p.handle(new Request('https://local.invalid/sync/v1/snapshot?resource=events&limit=1', {
    headers:{authorization:'Bearer '+signedA}
  }))
  assert.equal(r.status,401)
  console.log('R38 PASS: in-flight consent revocation rejected before snapshot delivery')
})
