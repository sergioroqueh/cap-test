// C42: real Chromium and WebKit-Linux test of browser public key + cross-tab journal.
// ECDSA private keys generated ONLY in Node runner. Browser receives public JWK.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {chromium,webkit} from 'playwright'
import {canonical,sha256} from './c39_snapshot_transfer.mjs'

const sources=new Map([
  ['/c41_browser_journal.mjs',readFileSync(new URL('./c41_browser_journal.mjs',import.meta.url))],
  ['/c42_browser_security.mjs',readFileSync(new URL('./c42_browser_security.mjs',import.meta.url))]
])
const keypair=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const otherKeys=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const PUBLIC=keypair.publicKey.export({format:'jwk'})
const FOREIGN_PUBLIC=otherKeys.publicKey.export({format:'jwk'})
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
const EVENTS=[{eventId:'e1',answer:'A'},{eventId:'e2',answer:'B'}]
const SESSIONS=[{clientId:'s1',answered:2}]
const CLOCK=1000,EXPIRY=100000
const PREFIX='RUTACAP-C42-MANIFEST-P256-V1\0'
const id=()=>randomUUID().replaceAll('-','').slice(0,28)
function signed(ownerId=A,options={}){
  const snapshotId=options.snapshotId||'c42-snapshot'
  const checkpoint='c42-checkpoint'
  const rows=[...EVENTS.map((item,i)=>({stream:'events',ordinal:i+1,item})),
    ...SESSIONS.map((item,i)=>({stream:'sessions',ordinal:i+1,item}))]
  const m={ownerId,snapshotId,checkpoint,counts:{events:2,sessions:1},
    digest:sha256({ownerId,snapshotId,checkpoint,rows}),expiresAt:options.expiresAt??EXPIRY}
  const body={version:1,issuer:'rutacap-c42-fixture',audience:'rutacap-c42-offline',
    kid:'ci-p256-1',issuedAt:options.issuedAt??CLOCK,expiresAt:options.expiresAt??EXPIRY,manifest:m}
  const sig=sign('sha256',Buffer.from(PREFIX+canonical(body),'utf8'),
    {key:keypair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
  return {...body,signature:sig}
}
let server,base
test.before(async()=>{
  server=createServer((req,res)=>{
    if(sources.has(req.url)){
      res.writeHead(200,{'content-type':'text/javascript;charset=utf-8','cache-control':'no-store'})
      res.end(sources.get(req.url))
    }else if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'})
      res.end('<!doctype html><meta charset="utf-8"><title>C42 local fixture</title>')
    }else{res.writeHead(404);res.end()}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  base='http://127.0.0.1:'+server.address().port
})
test.after(async()=>new Promise(resolve=>server.close(resolve)))

async function setup(page,{namespace=id(),ownerId=A,sessionId='session-A',envelope=signed(ownerId),
  maxBytes=100000,clock=CLOCK}={}){
  await page.goto(base+'/')
  await page.evaluate(async args=>{
    const [journalModule,securityModule]=await Promise.all([
      import('/c41_browser_journal.mjs'),import('/c42_browser_security.mjs')])
    window.fixtureClock=args.clock
    window.j=journalModule.createC41Journal({namespace:args.namespace,
      clock:()=>window.fixtureClock,leaseMs:1000,maxBytes:args.maxBytes})
    window.c=securityModule.createC42Coordinator({journal:window.j,namespace:args.namespace,
      ownerId:args.ownerId,sessionId:args.sessionId,now:()=>window.fixtureClock})
    window.verify=securityModule.verifyC42Envelope
    window.classify=securityModule.classifyC42StorageFailure
    window.env=args.envelope
    window.trusted={[args.envelope.kid]:args.publicKey}
  },{namespace,ownerId,sessionId,envelope,clock,maxBytes,publicKey:PUBLIC})
}
const evaluate=(p,f,arg)=>p.evaluate(f,arg)
async function close(p){if(!p.isClosed()){await p.evaluate(async()=>{try{await window.c.close()}catch{}});await p.close()}}
const auth=page=>evaluate(page,()=>window.c.authorize({
  envelope:window.env,trustedPublicKeys:window.trusted}))
const start=page=>evaluate(page,()=>window.c.acquire())

for(const [engine,type] of [['Chromium',chromium],['WebKit-Linux',webkit]]){
  test('C42 '+engine+' asymmetric verification and cross-tab safety',{timeout:150000},async t=>{
    const browser=await type.launch({headless:true})
    t.after(()=>browser.close())
    const context=await browser.newContext({serviceWorkers:'block'})
    t.after(()=>context.close())
    // Browser fixture is self-contained. Deny any outbound request.
    await context.route('**/*',route=>{
      if(route.request().url().startsWith(base+'/'))return route.continue()
      return route.abort()
    })

    await t.test('ECDSA P-256 WebCrypto validates Node signature with PUBLIC JWK only',async()=>{
      const p=await context.newPage();await setup(p)
      const r=await auth(p)
      assert.equal(r.ownerId,A)
      assert.equal(r.digest,signed().manifest.digest)
      const privateInBrowser=await evaluate(p,()=>Object.values(window.trusted).some(k=>'d' in k))
      assert.equal(privateInBrowser,false)
      await close(p)
    })

    await t.test('tampering, wrong issuer/audience/owner/kid, invalid key and expiry fail closed',async()=>{
      const p=await context.newPage();await setup(p)
      const codes=await evaluate(p,async({otherPublic,b})=>{
        const env=window.env,trusted=window.trusted
        const options={trustedPublicKeys:trusted,expectedOwner:env.manifest.ownerId,now:()=>1000}
        const variants=[
          {...env,signature:'A'+env.signature.slice(1)},
          {...env,manifest:{...env.manifest,checkpoint:'tampered'}},
          {...env,issuer:'attacker'},
          {...env,audience:'wrong-app'},
          {...env,kid:'unknown'},
          {...env,version:2},
          {...env,expiresAt:999},
          {...env,issuedAt:1001}
        ]
        const codes=[]
        for(const candidate of variants){
          try{await window.verify({envelope:candidate,...options});codes.push('UNEXPECTED')}
          catch(e){codes.push(e.code)}
        }
        for(const config of [
          {envelope:env,expectedOwner:b,trustedPublicKeys:trusted,now:()=>1000},
          {envelope:env,expectedOwner:env.manifest.ownerId,trustedPublicKeys:{[env.kid]:otherPublic},now:()=>1000},
          {envelope:env,expectedOwner:env.manifest.ownerId,trustedPublicKeys:{[env.kid]:{...trusted[env.kid],d:'forged'}},now:()=>1000}
        ]){
          try{await window.verify(config);codes.push('UNEXPECTED')}catch(e){codes.push(e.code)}
        }
        return codes
      },{otherPublic:FOREIGN_PUBLIC,b:B})
      assert.deepEqual(codes,[
        'SIGNATURE_INVALID','SIGNATURE_INVALID','MANIFEST_CLAIMS_INVALID','MANIFEST_CLAIMS_INVALID',
        'UNTRUSTED_KEY','MANIFEST_CLAIMS_INVALID','MANIFEST_CLAIMS_INVALID','MANIFEST_CLAIMS_INVALID',
        'MANIFEST_CLAIMS_INVALID','SIGNATURE_INVALID','UNTRUSTED_KEY'])
      await close(p)
    })

    await t.test('verified envelope permits atomic journal pages and digest finish',async()=>{
      const p=await context.newPage();await setup(p)
      await auth(p)
      const result=await evaluate(p,async({events,sessions})=>{
        const a=await window.c.acquire()
        await window.c.append({stream:'events',offset:0,items:events})
        await window.c.append({stream:'sessions',offset:0,items:sessions})
        const done=await window.c.finish()
        const job=await window.j.read({ownerId:window.env.manifest.ownerId,
          sessionId:'session-A',manifest:window.env.manifest})
        return {a,done,rows:job.rows}
      },{events:EVENTS,sessions:SESSIONS})
      assert.equal(result.done.digest,signed().manifest.digest)
      assert.deepEqual(result.rows,{events:EVENTS,sessions:SESSIONS})
      await close(p)
    })

    await t.test('simultaneous tab acquire: one succeeds, one receives LEASE_HELD',async()=>{
      const namespace=id(),first=await context.newPage(),second=await context.newPage()
      await setup(first,{namespace});await setup(second,{namespace})
      await Promise.all([auth(first),auth(second)])
      const outcomes=await Promise.all([first,second].map(async p=>{
        try{await start(p);return 'acquired'}catch(e){return e.code}
      }))
      assert.deepEqual(outcomes.sort(),['LEASE_HELD','acquired'])
      await close(first);await close(second)
    })

    await t.test('BroadcastChannel logout revokes paused page in other tab and purges job',async()=>{
      const namespace=id(),writer=await context.newPage(),logoutTab=await context.newPage()
      await setup(writer,{namespace});await setup(logoutTab,{namespace})
      await Promise.all([auth(writer),auth(logoutTab)])
      await start(writer)
      // Promise kept pending inside writer until release from Playwright.
      await evaluate(writer,()=>{window.delayed=new Promise(resolve=>window.releaseDelayed=resolve)
        window.pending=window.c.append({stream:'events',offset:0,items:[{eventId:'e1',answer:'A'}],
          waitForPage:()=>window.delayed}).then(()=>'UNEXPECTED',e=>e.code)})
      await evaluate(logoutTab,()=>window.c.logout())
      await writer.waitForFunction(()=>window.c.isRevoked())
      await evaluate(writer,()=>window.releaseDelayed())
      const state=await evaluate(writer,async()=>{
        const outcome=await window.pending
        let read
        try{await window.j.read({ownerId:window.env.manifest.ownerId,sessionId:'session-A',
          manifest:window.env.manifest});read='UNEXPECTED'}catch(e){read=e.code}
        return {outcome,read}
      })
      assert.deepEqual(state,{outcome:'ACCOUNT_REVOKED',read:'RESUME_MISMATCH'})
      await close(writer);await close(logoutTab)
    })

    await t.test('broadcast for owner A does not revoke owner B, even same channel',async()=>{
      const namespace=id(),pa=await context.newPage(),pb=await context.newPage()
      await setup(pa,{namespace,ownerId:A,sessionId:'session-A'})
      await setup(pb,{namespace,ownerId:B,sessionId:'session-B',envelope:signed(B)})
      await Promise.all([auth(pa),auth(pb)])
      await Promise.all([start(pa),start(pb)])
      await evaluate(pa,()=>window.c.logout())
      const outcome=await evaluate(pb,async()=>{
        await window.c.append({stream:'events',offset:0,items:[{eventId:'e1',answer:'A'}]})
        return {revoked:window.c.isRevoked(),stored:(await window.j.read({
          ownerId:window.env.manifest.ownerId,sessionId:'session-B',
          manifest:window.env.manifest})).rows.events.length}
      })
      assert.deepEqual(outcome,{revoked:false,stored:1})
      await close(pa);await close(pb)
    })

    await t.test('fencing rejects stale writer after lease takeover even with valid signed manifest',async()=>{
      const namespace=id(),first=await context.newPage(),second=await context.newPage()
      await setup(first,{namespace});await setup(second,{namespace})
      await Promise.all([auth(first),auth(second)])
      const firstLease=await start(first)
      await evaluate(second,()=>{window.fixtureClock=2500})
      const takeover=await start(second)
      assert.ok(takeover.fencing>firstLease.fencing)
      const old=await evaluate(first,async()=>{
        try{await window.c.append({stream:'events',offset:0,items:[{eventId:'e1',answer:'A'}]})
          return 'UNEXPECTED'}catch(e){return e.code}
      })
      assert.equal(old,'LEASE_INVALID')
      await close(first);await close(second)
    })

    await t.test('native IndexedDB abort rolls back prior write in same transaction',async()=>{
      const p=await context.newPage();await setup(p);await auth(p);await start(p)
      const record=await evaluate(p,async()=>{
        const db=await new Promise((resolve,reject)=>{
          const req=indexedDB.open(window.j.name,2)
          req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
        })
        try{
          const before=await window.j.read({ownerId:window.env.manifest.ownerId,
            sessionId:'session-A',manifest:window.env.manifest})
          const aborted=await new Promise((resolve,reject)=>{
            const tx=db.transaction(['jobs'],'readwrite')
            tx.objectStore('jobs').put({...before,revision:999})
            tx.onabort=()=>resolve(true)
            tx.oncomplete=()=>reject(Error('unexpected commit'))
            tx.abort()
          })
          const after=await window.j.read({ownerId:window.env.manifest.ownerId,
            sessionId:'session-A',manifest:window.env.manifest})
          return {aborted,revision:after.revision}
        }finally{db.close()}
      })
      assert.deepEqual(record,{aborted:true,revision:0})
      await close(p)
    })

    await t.test('simulated storage quota and DOMException classification fail closed',async()=>{
      const p=await context.newPage();await setup(p,{maxBytes:550})
      await auth(p);await start(p)
      const r=await evaluate(p,async()=>{
        let code
        try{await window.c.append({stream:'events',offset:0,
          items:[{eventId:'e1',answer:'A',padding:'X'.repeat(5000)}]})}catch(e){code=e.code}
        const current=await window.j.read({ownerId:window.env.manifest.ownerId,
          sessionId:'session-A',manifest:window.env.manifest})
        return {code,rev:current.revision,stored:current.rows.events.length,
          nativeQuotaClass:window.classify(new DOMException('injected','QuotaExceededError')),
          nativeAbortClass:window.classify(new DOMException('injected','AbortError'))}
      })
      assert.deepEqual(r,{code:'STORAGE_QUOTA',rev:0,stored:0,
        nativeQuotaClass:'IDB_QUOTA_EXCEEDED',nativeAbortClass:'IDB_ABORT'})
      await close(p)
    })
  })
}
