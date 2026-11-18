// C41: real Chromium/WebKit-Linux IndexedDB tests, using localhost static fixture only.
// No production app, cloud endpoints, remote HTTP calls, secrets or Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {chromium, webkit} from 'playwright'
import {sha256} from './c39_snapshot_transfer.mjs'

const moduleBytes=readFileSync(new URL('./c41_browser_journal.mjs',import.meta.url))
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222'
const EVENTS=[
  {eventId:'e1',questionId:'q1',answer:'A'},
  {eventId:'e2',questionId:'q2',answer:'B'},
  {eventId:'e3',questionId:'q3',answer:'C'}
]
const SESSIONS=[{clientId:'s1',answered:10},{clientId:'s2',answered:15}]
function manifest(ownerId=A,snapshotId='c41-fixture-snapshot'){
  const checkpoint='c41-checkpoint'
  const rows=[...EVENTS.map((item,i)=>({stream:'events',ordinal:i+1,item})),
    ...SESSIONS.map((item,i)=>({stream:'sessions',ordinal:i+1,item}))]
  return {ownerId,snapshotId,checkpoint,counts:{events:3,sessions:2},
    digest:sha256({ownerId,snapshotId,checkpoint,rows}),expiresAt:100_000}
}
let server,baseUrl
test.before(async()=>{
  server=createServer((req,res)=>{
    if(req.url==='/c41_browser_journal.mjs'){
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store'});res.end(moduleBytes)
    } else if(req.url==='/') {
      res.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store'});res.end('<!doctype html><meta charset="utf-8"><title>C41 isolated fixture</title>')
    } else {res.writeHead(404);res.end()}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  baseUrl='http://127.0.0.1:'+server.address().port
})
test.after(async()=>{await new Promise(resolve=>server.close(resolve))})
const ns=()=> 'ci-'+randomUUID().replaceAll('-','').slice(0,30)
async function setup(page,namespace,m=manifest(),options={}){
  await page.goto(baseUrl+'/')
  await page.evaluate(async ({namespace,m,options})=>{
    const {createC41Journal}=await import('/c41_browser_journal.mjs')
    window.c41Clock=options.clock??1000
    window.j=createC41Journal({namespace,clock:()=>window.c41Clock,
      maxBytes:options.maxBytes??100000,leaseMs:options.leaseMs??1000})
    window.manifest=m
  },{namespace,m,options})
}
const inPage=(page,fn,args)=>page.evaluate(fn,args)
const getSession=()=>({ownerId:A,sessionId:'logged-in-a'})
const eventPage=(offset,items)=>({ownerId:A,sessionId:'logged-in-a',manifest:manifest(),
  stream:'events',offset,items})
for(const [engine,browserType] of [['Chromium',chromium],['WebKit-Linux',webkit]]) {
  test('C41 '+engine+' browser transactions and recovery', {timeout:160000}, async t=>{
    const browser=await browserType.launch({headless:true})
    t.after(()=>browser.close())
    const context=await browser.newContext({serviceWorkers:'block'})
    t.after(()=>context.close())

    await t.test('atomic page commits, canonical SHA-256 and verified finish',async()=>{
      const p=await context.newPage(), id=ns();await setup(p,id)
      const outcome=await inPage(p,async({a,b})=>{
        const start=await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
        const fencing=start.fencing
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing,stream:'events',offset:0,items:b.events.slice(0,2)})
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing,stream:'events',offset:2,items:b.events.slice(2)})
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing,stream:'sessions',offset:0,items:b.sessions})
        const r=await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
        const done=await window.j.finish({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,fencing})
        return {rows:r.rows,done}
      },{a:A,b:{events:EVENTS,sessions:SESSIONS}})
      assert.deepEqual(outcome.rows,{events:EVENTS,sessions:SESSIONS})
      assert.equal(outcome.done.digest,manifest().digest)
      await p.close()
    })

    await t.test('transaction aborts duplicate and missing pages without partial writes',async()=>{
      const p=await context.newPage();await setup(p,ns())
      const r=await inPage(p,async({a,e})=>{
        const m=window.manifest,f=(await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:m})).fencing
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:m,fencing:f,stream:'events',offset:0,items:[e[0]]})
        const invalid=[]
        for(const params of [
          {stream:'events',offset:0,items:[e[1]]},
          {stream:'events',offset:1,items:[e[0]]},
          {stream:'events',offset:1,items:[e[1],e[1]]}
        ]) {
          try{await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:m,fencing:f,...params})}
          catch(err){invalid.push(err.code)}
        }
        return {invalid,state:await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:m})}
      },{a:A,e:EVENTS})
      assert.deepEqual(r.invalid,['PAGE_INVALID','KEY_INVALID','KEY_INVALID'])
      assert.equal(r.state.rows.events.length,1)
      assert.equal(r.state.revision,1)
      await p.close()
    })

    await t.test('two tabs enforce lease fencing, expiry and stale writer rejection',async()=>{
      const id=ns(),first=await context.newPage(),second=await context.newPage()
      await setup(first,id);await setup(second,id)
      const lease=await inPage(first,async a=>window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest}),A)
      const held=await inPage(second,async a=>{
        try{await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest});return 'UNEXPECTED'}
        catch(e){return e.code}
      },A)
      assert.equal(held,'LEASE_HELD')
      await inPage(second,()=>{window.c41Clock=2500})
      const taken=await inPage(second,async a=>window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest}),A)
      assert.equal(taken.resumed,true)
      assert.ok(taken.fencing>lease.fencing)
      const stale=await inPage(first,async ({a,e,f})=>{
        try{await window.j.append({ownerId:a,sessionId:'logged-in-a',
          manifest:window.manifest,fencing:f,stream:'events',offset:0,items:[e]});return 'UNEXPECTED'}
        catch(err){return err.code}
      },{a:A,e:EVENTS[0],f:lease.fencing})
      assert.equal(stale,'LEASE_INVALID')
      const state=await inPage(second,async a=>window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest}),A)
      assert.equal(state.rows.events.length,0)
      await first.close();await second.close()
    })

    await t.test('reload simulates tab crash; progress persists and resume finishes',async()=>{
      const p=await context.newPage(),id=ns();await setup(p,id)
      await inPage(p,async ({a,e})=>{
        const f=(await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})).fencing
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing:f,stream:'events',offset:0,items:e.slice(0,2)})
      },{a:A,e:EVENTS})
      // Closing tab is a stronger simulation than losing only the JS reader.
      await p.close()
      const reopened=await context.newPage();await setup(reopened,id,manifest(),{clock:2500})
      const result=await inPage(reopened,async ({a,e,s})=>{
        const acquired=await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
        const existing=await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing:acquired.fencing,stream:'events',offset:2,items:e.slice(2)})
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing:acquired.fencing,stream:'sessions',offset:0,items:s})
        const committed=await window.j.finish({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,fencing:acquired.fencing})
        return {resumed:acquired.resumed,count:existing.rows.events.length,committed}
      },{a:A,e:EVENTS,s:SESSIONS})
      assert.equal(result.resumed,true)
      assert.equal(result.count,2)
      assert.equal(result.committed.finished,true)
      await reopened.close()
    })

    await t.test('logout while a page awaits invalidates its lease and data',async()=>{
      const p=await context.newPage();await setup(p,ns())
      const r=await inPage(p,async({a,e})=>{
        const f=(await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})).fencing
        const awaited=Promise.resolve().then(async()=>{await new Promise(resolve=>setTimeout(resolve,10))
          try{await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
            fencing:f,stream:'events',offset:0,items:[e]});return 'UNEXPECTED'}catch(ex){return ex.code}})
        await window.j.logout({ownerId:a,sessionId:'logged-in-a'})
        const code=await awaited
        const missing=await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
          .then(()=>false,ex=>ex.code==='RESUME_MISMATCH')
        return {code,missing}
      },{a:A,e:EVENTS[0]})
      assert.deepEqual(r,{code:'LEASE_INVALID',missing:true})
      await p.close()
    })

    await t.test('synthetic storage-full abort leaves earlier pages intact',async()=>{
      const p=await context.newPage();await setup(p,ns(),manifest(),{maxBytes:580})
      const r=await inPage(p,async({a,e})=>{
        const f=(await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})).fencing
        let code
        try{await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest,
          fencing:f,stream:'events',offset:0,items:[{...e,blob:'x'.repeat(3000)}]})}
        catch(ex){code=ex.code}
        const state=await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:window.manifest})
        return {code,count:state.rows.events.length,rev:state.revision}
      },{a:A,e:EVENTS[0]})
      assert.deepEqual(r,{code:'STORAGE_QUOTA',count:0,rev:0})
      await p.close()
    })

    await t.test('wrong identity and altered rows reject finish before commit',async()=>{
      const p=await context.newPage();await setup(p,ns())
      const r=await inPage(p,async({a,b,e,s})=>{
        const m=window.manifest,f=(await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:m})).fencing
        let foreign
        try{await window.j.read({ownerId:b,sessionId:'logged-in-b',manifest:{...m,ownerId:b}})}catch(ex){foreign=ex.code}
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:m,fencing:f,
          stream:'events',offset:0,items:[{...e[0],answer:'TAMPERED'},...e.slice(1)]})
        await window.j.append({ownerId:a,sessionId:'logged-in-a',manifest:m,fencing:f,
          stream:'sessions',offset:0,items:s})
        let mismatch
        try{await window.j.finish({ownerId:a,sessionId:'logged-in-a',manifest:m,fencing:f})}catch(ex){mismatch=ex.code}
        const state=await window.j.read({ownerId:a,sessionId:'logged-in-a',manifest:m})
        return {foreign,mismatch,finished:state.finished}
      },{a:A,b:B,e:EVENTS,s:SESSIONS})
      assert.deepEqual(r,{foreign:'RESUME_MISMATCH',mismatch:'DIGEST_MISMATCH',finished:false})
      await p.close()
    })

    await t.test('v1 upgrade discards unverifiable legacy journal',async()=>{
      const p=await context.newPage(),id=ns()
      await p.goto(baseUrl+'/')
      await inPage(p,namespace=>new Promise((resolve,reject)=>{
        const req=indexedDB.open('rutacap-c41-fixture-'+namespace,1)
        req.onupgradeneeded=()=>{
          req.result.createObjectStore('jobs',{keyPath:'ownerId'}).put({ownerId:'legacy-owner',stale:true})
        }
        req.onsuccess=()=>{req.result.close();resolve(true)}
        req.onerror=()=>reject(req.error)
      }),id)
      await setup(p,id)
      const r=await inPage(p,async a=>{
        const m=window.manifest
        const lease=await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:m})
        return {resumed:lease.resumed,db:window.j.name}
      },A)
      assert.equal(r.resumed,false)
      assert.ok(r.db.includes(id))
      await p.close()
    })

    await t.test('expired manifest and session mismatch cannot resume',async()=>{
      const p=await context.newPage(),id=ns();await setup(p,id)
      const r=await inPage(p,async a=>{
        const m=window.manifest
        await window.j.acquire({ownerId:a,sessionId:'logged-in-a',manifest:m})
        window.c41Clock=2500
        let session
        try{await window.j.acquire({ownerId:a,sessionId:'new-login',manifest:m})}catch(ex){session=ex.code}
        window.c41Clock=100001
        let expired
        try{await window.j.acquire({ownerId:a,sessionId:'new-login',manifest:m})}catch(ex){expired=ex.code}
        return {session,expired}
      },A)
      assert.deepEqual(r,{session:'RESUME_MISMATCH',expired:'SNAPSHOT_EXPIRED'})
      await p.close()
    })
  })
}
