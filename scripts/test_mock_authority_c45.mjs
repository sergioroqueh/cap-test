// C45 synthetic cross-device authority, adverse browser and reconnect tests.
// Private keys exist exclusively in c45_mock_authority.mjs on the Node side.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {generateKeyPairSync,randomUUID} from 'node:crypto'
import {chromium,webkit} from 'playwright'
import {createC45MockAuthority} from './c45_mock_authority.mjs'

const resources=new Map([
 ['/c41_browser_journal.mjs',readFileSync(new URL('./c41_browser_journal.mjs',import.meta.url))],
 ['/c45_browser_authority.mjs',readFileSync(new URL('./c45_browser_authority.mjs',import.meta.url))]
])
const DIGEST_A='a'.repeat(64),DIGEST_B='b'.repeat(64)
const namespace=()=>randomUUID().replaceAll('-','')
let server,base
test.before(async()=>{
 server=createServer((req,res)=>{
  if(resources.has(req.url)){
   res.writeHead(200,{'content-type':'text/javascript;charset=utf-8','cache-control':'no-store'})
   res.end(resources.get(req.url))
  }else if(req.url==='/'){
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'})
   res.end('<!doctype html><meta charset="utf-8"><title>C45 mock-only</title>')
  }else {res.writeHead(404);res.end()}
 })
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
 base='http://127.0.0.1:'+server.address().port
})
test.after(async()=>new Promise(ok=>server.close(ok)))

async function openDevice(context,authority,{ownerId='owner-a',deviceId=randomUUID(),
 ns=namespace(),credentials=null,rootPublicJwk=authority.rootPublicJwk}={}){
 const identity=credentials||authority.registerDevice(ownerId,deviceId)
 const page=await context.newPage()
 await page.exposeFunction('c45Rpc',req=>authority.handle(req))
 await page.goto(base)
 await page.evaluate(async({ns,rootPublicJwk,identity})=>{
  const m=await import('/c45_browser_authority.mjs')
  window.identity=identity
  window.c45Namespace=ns
  window.pauseBridge=false
  window.replayBridge=false
  window.poisonBridge=null
  window.lastBridge=null
  window.gate=m.createC45Gate({...identity,namespace:ns,rootPublicJwk,
   rpc:async req=>{
    if(window.pauseBridge)await new Promise(resolve=>window.releaseBridge=resolve)
    const real=await window.c45Rpc(req)
    if(window.replayBridge&&window.lastBridge)return window.lastBridge
    window.lastBridge=structuredClone(real)
    if(window.poisonBridge){
     const corrupted=structuredClone(real)
     if(window.poisonBridge==='policy')corrupted.policy.revokedDevices=['attacker-device']
     if(window.poisonBridge==='time')corrupted.receipt.serverTime=999999
     if(window.poisonBridge==='device')corrupted.receipt.deviceId='attacker-device'
     if(window.poisonBridge==='signature')corrupted.receiptSignature='A'.repeat(86)
     return corrupted
    }
    return real
   }})
 },{ns,rootPublicJwk,identity})
 return {page,identity,ns}
}
const run=(p,method,args,options)=>p.evaluate(async({method,args,options})=>
 window.gate[method](args,options),{method,args,options})
const refresh=p=>p.evaluate(()=>window.gate.refresh())
const transfer=(p,jti,digest=DIGEST_A,options={})=>
 p.evaluate(({jti,digest,options})=>window.gate.transfer({jti,digest},options),
  {jti,digest,options})
const code=async(p,method,expected,args={},options={})=>{
 const actual=await p.evaluate(async({method,args,options})=>{
  try{
   if(method==='refresh')await window.gate.refresh(options)
   if(method==='transfer')await window.gate.transfer(args,options)
   return 'UNEXPECTED'
  }catch(e){return e.code||e.message}
 },{method,args,options})
 assert.equal(actual,expected)
}
async function closeDevice(d){
 if(d.page.isClosed())return
 await d.page.evaluate(()=>window.gate.close())
 await d.page.close()
}

test('C45 Node authority rejects unauthenticated request, owner spoof and reused challenge',()=>{
 const a=createC45MockAuthority()
 const c=a.registerDevice('owner-a','dev-one')
 const q={...c,action:'refresh',challenge:'00000000-0000-4000-8000-000000000000'}
 assert.equal(a.handle({...q,credential:'bad'}).code,'AUTH_REQUIRED')
 assert.equal(a.handle({...q,ownerId:'owner-b'}).code,'OWNER_MISMATCH')
 assert.equal(a.handle(q).ok,true)
 assert.equal(a.handle(q).code,'CHALLENGE_REPLAY')
 assert.equal(a.inspect().challengeCount,1)
})
test('C45 Node global nonce is owner-scoped and rejects cross-device collision',()=>{
 const a=createC45MockAuthority()
 const x=a.registerDevice('owner-a','dev-x')
 const y=a.registerDevice('owner-a','dev-y')
 const z=a.registerDevice('owner-b','dev-z')
 const r=(identity,challenge,digest=DIGEST_A)=>a.handle({...identity,
  action:'transfer',revision:1,epoch:1,jti:'shared',digest,challenge})
 const cx='00000000-0000-4000-8000-000000000001'
 const cy='00000000-0000-4000-8000-000000000002'
 const cz='00000000-0000-4000-8000-000000000003'
 assert.equal(r(x,cx).receipt.status,'accepted')
 assert.equal(r(y,cy).code,'GLOBAL_REPLAY_REJECTED')
 assert.equal(r(z,cz).receipt.status,'accepted')
 assert.equal(a.inspect().nonceCount,2)
})
test('C45 Node fails closed at capacity; epoch revocation and monotonic time',()=>{
 const a=createC45MockAuthority({maxNonces:2})
 const c=a.registerDevice('owner-a','dev-c')
 const accept=(jti,i)=>a.handle({...c,action:'transfer',revision:1,epoch:1,
  jti,digest:DIGEST_A,challenge:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')})
 assert.equal(accept('one',1).ok,true)
 assert.equal(accept('two',2).ok,true)
 assert.equal(accept('three',3).code,'GLOBAL_LEDGER_FULL')
 assert.equal(a.inspect().nonceCount,2)
 assert.throws(()=>a.advance(-1),{code:'CLOCK_INVALID'})
 a.updatePolicy({rotateEpoch:true})
 assert.equal(accept('old-epoch',4).code,'POLICY_STALE')
})
test('C45 Node expired policy forbids fresh credentials and transfers',()=>{
 const a=createC45MockAuthority({policyTtl:600,leaseMs:200})
 const c=a.registerDevice('owner-a','dev-c')
 a.advance(600)
 assert.equal(a.handle({...c,action:'refresh',
  challenge:'00000000-0000-4000-8000-000000000006'}).code,'POLICY_EXPIRED')
 a.updatePolicy({extend:true})
 assert.equal(a.handle({...c,action:'refresh',
  challenge:'00000000-0000-4000-8000-000000000007'}).ok,true)
})

for(const [engine,launcher] of [['Chromium',chromium],['WebKit-Linux',webkit]]){
 test('C45 '+engine+' browser mock authority',{timeout:180000},async t=>{
  const browser=await launcher.launch({headless:true})
  t.after(()=>browser.close())
  const context=await browser.newContext({serviceWorkers:'block'})
  t.after(()=>context.close())
  await context.route('**/*',route=>
   route.request().url().startsWith(base+'/')?route.continue():route.abort())

  await t.test('online refresh and transfer; retry is server-idempotent',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   await code(d.page,'transfer','ONLINE_REFRESH_REQUIRED',{jti:'t',digest:DIGEST_A})
   const fresh=await refresh(d.page)
   assert.equal(fresh.revision,1)
   assert.equal((await transfer(d.page,'t')).status,'accepted')
   assert.equal((await transfer(d.page,'t')).status,'idempotent')
   assert.equal(a.inspect().nonceCount,1)
   await closeDevice(d)
  })

  await t.test('two devices same owner race shared jti: one winner, other rejected',async()=>{
   const a=createC45MockAuthority()
   const x=await openDevice(context,a),y=await openDevice(context,a)
   await refresh(x.page);await refresh(y.page)
   const results=await Promise.all([x,y].map(d=>d.page.evaluate(async()=>{
    try{return (await window.gate.transfer({jti:'race',digest:'a'.repeat(64)})).status}
    catch(e){return e.code}
   })))
   assert.equal(results.filter(x=>x==='accepted').length,1)
   assert.equal(results.filter(x=>x==='GLOBAL_REPLAY_REJECTED').length,1)
   assert.equal(a.inspect().nonceCount,1)
   await closeDevice(x);await closeDevice(y)
  })

  await t.test('revision and epoch rotation blocks stale device until refresh',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   await refresh(d.page)
   a.updatePolicy({rotateEpoch:true})
   await code(d.page,'transfer','POLICY_STALE',{jti:'old',digest:DIGEST_A})
   assert.equal((await refresh(d.page)).epoch,2)
   assert.equal((await transfer(d.page,'new')).epoch,2)
   await closeDevice(d)
  })

  await t.test('device revocation blocks reconnection; offline is untrusted read-only',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   await refresh(d.page)
   await d.page.evaluate(()=>window.gate.setOnline(false))
   const offline=await d.page.evaluate(()=>window.gate.readOffline())
   assert.deepEqual(offline,{mode:'read-only',trustedForTransfer:false,
    serverVerified:false,hasCachedData:true,reason:'FRESH_AUTHORITY_REQUIRED'})
   await code(d.page,'transfer','OFFLINE_NO_AUTHORITY',{jti:'offline',digest:DIGEST_A})
   a.updatePolicy({revokeDevice:d.identity.deviceId,rotateEpoch:true})
   await d.page.evaluate(()=>window.gate.setOnline(true))
   await code(d.page,'refresh','DEVICE_REVOKED')
   assert.equal(a.inspect().nonceCount,0)
   await closeDevice(d)
  })

  await t.test('root substitution is rejected, not supplied by cached policy',async()=>{
   const a=createC45MockAuthority()
   const intruder=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
   const d=await openDevice(context,a,{rootPublicJwk:intruder.publicKey.export({format:'jwk'})})
   await code(d.page,'refresh','BAD_SIGNATURE')
   await closeDevice(d)
  })

  await t.test('forged policy, time, identity and signature cannot verify',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   for(const [poison,expected] of [['policy','POLICY_DIGEST_MISMATCH'],
    ['time','RECEIPT_INVALID'],['device','RECEIPT_INVALID'],
    ['signature','BAD_SIGNATURE']]){
    await d.page.evaluate(p=>{window.poisonBridge=p},poison)
    await code(d.page,'refresh',expected)
   }
   await d.page.evaluate(()=>{window.poisonBridge=null})
   assert.equal((await refresh(d.page)).status,'fresh')
   await closeDevice(d)
  })

  await t.test('replaying a previously valid authority response fails fresh challenge',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   await refresh(d.page)
   await d.page.evaluate(()=>{window.replayBridge=true})
   await code(d.page,'refresh','RECEIPT_INVALID')
   await d.page.evaluate(()=>{window.replayBridge=false})
   assert.equal((await refresh(d.page)).status,'fresh')
   await closeDevice(d)
  })

  await t.test('browser clock falsification does not govern server epoch or timestamps',async()=>{
   const a=createC45MockAuthority()
   const d=await openDevice(context,a)
   await d.page.evaluate(()=>{Date.now=()=>-100000000})
   assert.equal((await refresh(d.page)).serverTime,1000)
   a.advance(700)
   assert.equal((await transfer(d.page,'clock')).serverTime,1700)
   a.updatePolicy({rotateEpoch:true})
   await code(d.page,'transfer','POLICY_STALE',{jti:'time-old',digest:DIGEST_A})
   assert.equal((await refresh(d.page)).serverTime,1700)
   await closeDevice(d)
  })

  await t.test('signed local cache rolled back: reopen requires online attestation',async()=>{
   const a=createC45MockAuthority(),ns=namespace()
   const d=await openDevice(context,a,{ns})
   await refresh(d.page)
   const earlier=await d.page.evaluate(async()=>{
    const db=await new Promise(ok=>{
     const q=indexedDB.open('rutacap-c45-fixture-'+window.c45Namespace+'-'+window.identity.deviceId,1)
     q.onsuccess=()=>ok(q.result)
    })
    const row=await new Promise(ok=>{
     const q=db.transaction('attestations').objectStore('attestations').get('last')
     q.onsuccess=()=>ok(q.result)
    })
    db.close();return row
   })
   a.updatePolicy({rotateEpoch:true})
   await refresh(d.page)
   await d.page.evaluate(async old=>{
    const db=await new Promise(ok=>{
     const q=indexedDB.open('rutacap-c45-fixture-'+window.c45Namespace+'-'+window.identity.deviceId,1)
     q.onsuccess=()=>ok(q.result)
    })
    await new Promise(ok=>{
     const tx=db.transaction('attestations','readwrite')
     tx.objectStore('attestations').put(old);tx.oncomplete=ok
    })
    db.close()
   },earlier)
   await closeDevice(d)
   const reopened=await openDevice(context,a,{ns,credentials:d.identity,deviceId:d.identity.deviceId})
   assert.equal((await reopened.page.evaluate(()=>window.gate.readOffline())).trustedForTransfer,false)
   await code(reopened.page,'transfer','ONLINE_REFRESH_REQUIRED',{jti:'reopened',digest:DIGEST_A})
   assert.equal((await refresh(reopened.page)).epoch,2)
   assert.equal((await transfer(reopened.page,'reopened')).epoch,2)
   await closeDevice(reopened)
  })

  await t.test('paused transfer after epoch rotation fails closed on server',async()=>{
   const a=createC45MockAuthority(),d=await openDevice(context,a)
   await refresh(d.page)
   await d.page.evaluate(()=>{
    window.pauseBridge=true
    window.pending=window.gate.transfer({jti:'paused',digest:'a'.repeat(64)})
      .then(x=>x.status,e=>e.code)
   })
   await d.page.waitForFunction(()=>typeof window.releaseBridge==='function')
   a.updatePolicy({rotateEpoch:true})
   await d.page.evaluate(()=>window.releaseBridge())
   assert.equal(await d.page.evaluate(()=>window.pending),'POLICY_STALE')
   assert.equal(a.inspect().nonceCount,0)
   await closeDevice(d)
  })

  await t.test('client IDB abort causes no trusted response; server retry idempotent',async()=>{
   const a=createC45MockAuthority(),d=await openDevice(context,a)
   await refresh(d.page)
   await code(d.page,'transfer','INJECTED_ABORT',{jti:'abort',digest:DIGEST_A},
    {abortBeforeCommit:true})
   assert.equal(a.inspect().nonceCount,1)
   assert.equal((await transfer(d.page,'abort')).status,'idempotent')
   await closeDevice(d)
  })

  await t.test('authority refusal and server ledger saturation cannot be bypassed locally',async()=>{
   const a=createC45MockAuthority({maxNonces:2}),d=await openDevice(context,a)
   await refresh(d.page)
   await transfer(d.page,'one');await transfer(d.page,'two')
   await code(d.page,'transfer','GLOBAL_LEDGER_FULL',{jti:'three',digest:DIGEST_A})
   await d.page.evaluate(()=>window.gate.setOnline(false))
   await code(d.page,'transfer','OFFLINE_NO_AUTHORITY',{jti:'three',digest:DIGEST_A})
   assert.equal(a.inspect().nonceCount,2)
   await closeDevice(d)
  })
 })
}
