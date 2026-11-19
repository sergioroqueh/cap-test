import test from 'node:test'
import assert from 'node:assert/strict'
import {createAccountSyncLease,SyncLeaseError} from '../src/remoteSyncContract.mjs'
const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const verified=id=>({verified:true,userId:id,isAnonymous:false,consented:true})
test('C31 cloud-disabled contract never invokes identity or request callback',async()=>{
 let hits=0
 const lease=createAccountSyncLease({getVerifiedIdentity:async()=>{hits++;return verified(A)}})
 await assert.rejects(lease.execute(async()=>{hits++;}),e=>e.code==='CLOUD_OFF')
 assert.equal(hits,0)
})
test('C31 unverified/guest/unconsented profile is rejected before transport',async()=>{
 for(const bad of [null,{...verified(A),verified:false},{...verified(A),isAnonymous:true},
   {...verified(A),consented:false},{...verified(A),userId:'invalid'}]){
  let called=0
  const lease=createAccountSyncLease({enabled:true,getVerifiedIdentity:async()=>bad})
  await assert.rejects(lease.execute(async()=>{called++}),e=>e.code==='IDENTITY_DENIED')
  assert.equal(called,0)
 }
})
test('C31 checks identity again after request and rejects account switch',async()=>{
 let current=verified(A),calls=0
 const lease=createAccountSyncLease({enabled:true,getVerifiedIdentity:async()=>current})
 await lease.execute(async({userId,signal})=>{
  assert.equal(userId,A);assert.equal(signal.aborted,false);calls++
 })
 current=verified(B)
 await assert.rejects(lease.execute(async()=>{calls++}),e=>e.code==='ACCOUNT_SWITCH')
 assert.equal(calls,1)
 assert.equal(lease.signal.aborted,true)
})
test('C31 logout during pending request aborts and discards response',async()=>{
 let release
 const deferred=new Promise(resolve=>{release=resolve})
 let seenSignal
 const lease=createAccountSyncLease({enabled:true,getVerifiedIdentity:async()=>verified(A)})
 const promise=lease.execute(async({signal})=>{seenSignal=signal;await deferred;return 'stale reply'})
 for(let n=0;n<20&&!seenSignal;n++)await Promise.resolve()
 assert.ok(seenSignal)
 lease.revoke();release()
 await assert.rejects(promise,e=>e.code==='CANCELLED')
 assert.equal(seenSignal.aborted,true)
})
test('C31 missing verifier fails closed',async()=>{
 const lease=createAccountSyncLease({enabled:true})
 await assert.rejects(lease.execute(async()=>{}),e=>e.code==='VERIFIER_MISSING')
})
