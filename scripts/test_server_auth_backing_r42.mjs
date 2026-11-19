// R42 targeted offline auth backing check. No credentials or real fetch calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServerAuthBackingReaders } from '../src/serverAuthBackingReaders.mjs'
import { createServerAuthConsentGate } from '../src/serverAuthConsentGate.mjs'

const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const projectUrl='https://r42-fixture.supabase.co'
const publishableKey='sb_publishable_R42MOCKONLY'
const issuer=projectUrl+'/auth/v1'
const now=1795000000000
const tokenA='eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJBIn0.r42signatureA'
const tokenB='eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJCIn0.r42signatureB'

test('R42 disabled reader never contacts network and rejects secret keys',async()=>{
  let touched=0
  const fake=async()=>{touched++;throw Error('must not contact')}
  const disabled=createServerAuthBackingReaders({fetchImpl:fake})
  assert.equal(await disabled.checkActiveSession({userId:A,sessionId:SA,accessToken:tokenA}),false)
  assert.equal(await disabled.readConsent({userId:A,purpose:'progress-sync',accessToken:tokenA}),null)
  assert.equal(touched,0)
  assert.throws(()=>createServerAuthBackingReaders({
    enabled:true,projectUrl,publishableKey:'sb_secret_forbidden',fetchImpl:fake
  }),/R42_INVALID_CONFIG/)
  assert.throws(()=>createServerAuthBackingReaders({
    enabled:true,projectUrl:'http://r42-fixture.supabase.co',publishableKey,fetchImpl:fake
  }),/R42_INVALID_CONFIG/)
})

test('R42 server-side bearer RPC and RLS consent fail closed',async()=>{
  const calls=[]
  let active=true,granted=true,revision=1,revokedAt=null,mode=''
  const fetchImpl=async (input,opts)=>{
    const url=new URL(input)
    calls.push({url,opts})
    if(mode==='down') return new Response('unavailable',{status:503})
    if(mode==='invalid') return new Response('not json',{status:200})
    if(mode==='big') return Response.json({padding:'x'.repeat(10000)})
    if(url.pathname.endsWith('/rc_is_active_session_v1')){
      assert.equal(opts.method,'POST')
      assert.equal(opts.body,'{}')
      return Response.json(active)
    }
    if(url.pathname.endsWith('/rc_sync_consents')){
      assert.equal(opts.method,'GET')
      assert.equal(url.searchParams.get('purpose'),'eq.progress-sync')
      assert.equal(url.searchParams.has('user_id'),false)
      return Response.json([{
        user_id:mode==='foreign'?B:A, purpose:'progress-sync',
        notice_version:'progress-sync-v1',granted,revision,revoked_at:revokedAt
      }])
    }
    throw Error('unexpected RPC')
  }
  const readers=createServerAuthBackingReaders({
    enabled:true,projectUrl,publishableKey,fetchImpl
  })
  const makeClaims=jwt=>({
    iss:issuer,sub:jwt===tokenA?A:B,session_id:jwt===tokenA?SA:SB,
    role:'authenticated',aud:'authenticated',is_anonymous:false,
    exp:Math.floor(now/1000)+3600
  })
  const gate=createServerAuthConsentGate({
    expectedIssuer:issuer,now:()=>now,
    createAuthClient:async()=>({auth:{
      // JWT signature verification is separately covered by R38 RSA tests.
      getClaims:async jwt=>[tokenA,tokenB].includes(jwt)
        ?{data:{claims:makeClaims(jwt)}}:{error:new Error('bad signature')},
      getUser:async jwt=>[tokenA,tokenB].includes(jwt)
        ?{data:{user:{id:makeClaims(jwt).sub,is_anonymous:false}}}
        :{error:new Error('invalid')}
    }}),
    ...readers
  })
  const first=await gate(tokenA)
  assert.equal(first?.userId,A)
  assert.equal(first?.sessionId,SA)
  assert.equal(first?.consentRevision,1)
  assert.equal(calls.length,2)
  assert.ok(calls.every(c=>c.opts.headers.Authorization==='Bearer '+tokenA))
  assert.ok(calls.every(c=>c.opts.headers.apikey===publishableKey))
  const before=calls.length
  assert.equal(await gate('nonsense'),null)
  assert.equal(calls.length,before,'unauthorized token reached REST')

  assert.equal(await gate(tokenB),null,'B accepted A consent')
  mode='foreign'
  assert.equal(await gate(tokenA),null,'A accepted foreign consent')
  mode=''
  active=false
  assert.equal(await gate(tokenA),null,'revoked session accepted')
  active=true
  granted=false;revision=2;revokedAt='2026-11-19T08:00:00Z'
  assert.equal(await gate(tokenA),null,'revoked consent accepted')
  granted=true;revision=3;revokedAt=null
  assert.equal((await gate(tokenA))?.consentRevision,3)
  for(const failure of ['down','invalid','big']){
    mode=failure
    assert.equal(await gate(tokenA),null,failure+' not fail closed')
  }
  console.log('R42 PASS: session+consent boundaries and disabled default, all mocked')
})
