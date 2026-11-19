import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fixtureProvider,sha256} from './c39_snapshot_transfer.mjs'
import {createC40Authority,createC40SignedFixture,createC40FileJournal,createC40Transfer} from './c40_signed_journal.mjs'

const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const DATA={
  events:Array.from({length:5},(_,i)=>({eventId:'ev'+i,questionId:'q'+i,answer:'A',metadata:{z:'ñ',a:1}})),
  sessions:Array.from({length:3},(_,i)=>({clientId:'ss'+i,answers:[{questionId:'q'+i,selected:'A'}]}))
}
const KEY=Buffer.alloc(32,0x43) // Synthetic CI secret, never a web/app credential.
function ctx(t,{ownerId=A,now=()=>1_000_000,ttlMs=90_000,failAt,mutatePage}={}) {
  const dir=mkdtempSync(join(tmpdir(),'rutacap-c40-fixture-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const journal=createC40FileJournal({dir})
  const authority=createC40Authority({secret:KEY,now,ttlMs})
  const base=fixtureProvider({ownerId,streams:DATA,failAt,mutatePage})
  const server=createC40SignedFixture({provider:base.provider,manifest:base.manifest,authority})
  let identity={ownerId,sessionId:'session-1',active:true,consented:true}
  const transfer=()=>createC40Transfer({server,authority,journal,getIdentity:()=>identity,pageSize:2})
  return {journal,authority,base,server,transfer,dir,getIdentity:()=>identity,setIdentity:i=>{identity=i}}
}
async function rejected(fn,code) {await assert.rejects(fn,e=>e.code===code)}

test('C40 signed v1 manifest verifies issuer, owner, expiry and MAC',t=>{
  const f=ctx(t)
  const original=f.server.envelope
  assert.equal(f.authority.verify(original,A).digest,f.base.manifest.digest)
  assert.throws(()=>f.authority.verify(original,B),e=>e.code==='OWNER_MISMATCH')
  assert.throws(()=>f.authority.verify({...original,manifest:{...original.manifest,ownerId:B}},B),e=>e.code==='MANIFEST_AUTH_INVALID')
  assert.throws(()=>f.authority.verify({...original,version:2},A),e=>e.code==='MANIFEST_AUTH_INVALID')
  assert.throws(()=>f.authority.verify({...original,issuer:'other'},A),e=>e.code==='MANIFEST_AUTH_INVALID')
  assert.throws(()=>createC40Authority({secret:'short'}),e=>e.code==='FIXTURE_AUTHORITY_INVALID')
})
test('C40 complete signed transfer clears private journal after verified finish',async t=>{
  const f=ctx(t)
  const result=await f.transfer().read()
  assert.deepEqual(result.rows,DATA)
  assert.equal(result.manifest.digest,f.base.manifest.digest)
  assert.equal(f.journal.load(A),null)
  assert.equal(f.base.stats().finished,1)
})
test('C40 persistent file journal survives new reader and resumes without replayed pages',async t=>{
  let failOnce=false
  const f=ctx(t,{failAt:({stream,offset})=>stream==='events'&&offset===2&&!failOnce?(failOnce=true):false})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  const state=f.journal.load(A)
  assert.equal(state.rows.events.length,2)
  assert.equal(state.rows.sessions.length,0)
  assert.ok(existsSync(f.journal.path(A)))
  // new transfer instance simulates process restart and loads on-disk data.
  const result=await f.transfer().read()
  assert.deepEqual(result.rows,DATA)
  assert.equal(f.base.stats().calls,6) // 1st 0,2 failed; second 2,4, sessions 0,2
  assert.equal(f.journal.load(A),null)
})
test('C40 atomic writes ignore a stray uncommitted temporary file',async t=>{
  const f=ctx(t)
  let failOnce=false
  const page=f.server.page.bind(f.server)
  f.server.page=async args=>{if(!failOnce&&args.stream==='events'&&args.offset===2){failOnce=true;const e=Error('cut');e.code='NETWORK_INTERRUPTED';throw e}return page(args)}
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  const target=f.journal.path(A)
  writeFileSync(target+'.uncommitted.tmp','{"bad":')
  assert.equal(f.journal.load(A).rows.events.length,2)
  const result=await f.transfer().read()
  assert.deepEqual(result.rows,DATA)
})
test('C40 corrupted journal refuses resumption and deletes corrupted state',async t=>{
  const f=ctx(t,{failAt:({offset,stream})=>stream==='events'&&offset===2})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  writeFileSync(f.journal.path(A),'{"broken":', {mode:0o600})
  await rejected(()=>f.transfer().read(),'JOURNAL_CORRUPT')
  assert.equal(f.journal.load(A),null)
})
test('C40 forged journal rechecksum cannot beat signed manifest digest',async t=>{
  const f=ctx(t,{failAt:({offset,stream})=>stream==='events'&&offset===2})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  const file=f.journal.path(A)
  const doc=JSON.parse(readFileSync(file,'utf8'))
  doc.state.rows.events[0].answer='Z'
  doc.integrity=sha256(doc.state) // attacker can edit untrusted local hash
  writeFileSync(file,JSON.stringify(doc))
  // Switch failure injector off and verify entire body via immutable signed hash.
  f.server.page=async args=>f.base.provider.page({...args})
  // Base fixture still failAt every events offset=2: use a fresh signed fixture.
  const fresh=fixtureProvider({ownerId:A,streams:DATA})
  f.server.page=async args=>fresh.provider.page(args)
  await rejected(()=>f.transfer().read(),'DIGEST_MISMATCH')
  assert.equal(f.journal.load(A),null)
})
test('C40 logout during awaited page purges A journal and rejects completion',async t=>{
  const f=ctx(t)
  let release,entered
  const arrived=new Promise(resolve=>{entered=resolve})
  const gate=new Promise(resolve=>{release=resolve})
  const page=f.server.page.bind(f.server)
  let blocked=false
  f.server.page=async args=>{
    if(!blocked){blocked=true;entered()}
    if(blocked && args.stream==='events'&&args.offset===0) await gate
    return page(args)
  }
  const work=f.transfer().read()
  await arrived
  f.setIdentity({ownerId:A,sessionId:'session-1',active:false,consented:false})
  release()
  await rejected(()=>work,'ACCOUNT_CHANGED')
  assert.equal(f.journal.load(A),null)
  assert.equal(f.base.stats().finished,0)
})
test('C40 switching A to B while waiting rejects and does not expose A rows',async t=>{
  const f=ctx(t)
  const page=f.server.page.bind(f.server)
  let release,entered
  const wait=new Promise(resolve=>entered=resolve)
  const hold=new Promise(resolve=>release=resolve)
  f.server.page=async args=>{entered();await hold;return page(args)}
  const work=f.transfer().read()
  await wait
  f.setIdentity({ownerId:B,sessionId:'b-session',active:true,consented:true})
  release()
  await rejected(()=>work,'ACCOUNT_CHANGED')
  assert.equal(f.journal.load(A),null)
  const b=fixtureProvider({ownerId:B,streams:DATA})
  const bserver=createC40SignedFixture({provider:b.provider,manifest:b.manifest,authority:f.authority})
  const transfer=createC40Transfer({server:bserver,authority:f.authority,journal:f.journal,
    getIdentity:f.getIdentity,pageSize:2})
  const result=await transfer.read()
  assert.equal(result.manifest.ownerId,B)
  assert.equal(f.journal.load(B),null)
})
test('C40 repeated login with a different session cannot reuse old local journal',async t=>{
  let pause=false
  const f=ctx(t,{failAt:({stream,offset})=>stream==='events'&&offset===2&&!pause})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  f.setIdentity({ownerId:A,sessionId:'another-session',active:true,consented:true})
  await rejected(()=>f.transfer().read(),'SESSION_MISMATCH')
  assert.equal(f.journal.load(A),null)
})
test('C40 expiry between interruption and resumption aborts and purges journal',async t=>{
  let clock=1_000_000
  const f=ctx(t,{now:()=>clock,ttlMs:1000,failAt:({stream,offset})=>stream==='events'&&offset===2})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  assert.ok(f.journal.load(A))
  clock+=1001
  await rejected(()=>f.transfer().read(),'MANIFEST_EXPIRED')
  assert.equal(f.journal.load(A),null)
})
test('C40 change of signed snapshot generation invalidates saved pages',async t=>{
  const f=ctx(t,{failAt:({stream,offset})=>stream==='events'&&offset===2})
  await rejected(()=>f.transfer().read(),'NETWORK_INTERRUPTED')
  const next=fixtureProvider({ownerId:A,snapshotId:'second-generation',streams:DATA})
  const other=createC40SignedFixture({provider:next.provider,manifest:next.manifest,authority:f.authority})
  f.server.begin=other.begin
  f.server.page=other.page
  f.server.finish=other.finish
  await rejected(()=>f.transfer().read(),'RESUME_MISMATCH')
  assert.equal(f.journal.load(A),null)
  assert.deepEqual((await f.transfer().read()).rows,DATA)
})
test('C40 invalid signature blocks any page read and clears old progress',async t=>{
  const f=ctx(t)
  let pages=0
  const original=f.server.page.bind(f.server)
  f.server.page=async args=>{pages++;return original(args)}
  f.server.begin=async()=>({...f.server.envelope,mac:'0'.repeat(64)})
  await rejected(()=>f.transfer().read(),'MANIFEST_AUTH_INVALID')
  assert.equal(pages,0)
  assert.equal(f.journal.load(A),null)
})
test('C40 no consent and nonfixture provider fail closed',async t=>{
  const f=ctx(t)
  f.setIdentity({ownerId:A,sessionId:'session-1',active:true,consented:false})
  await rejected(()=>f.transfer().read(),'AUTH_REQUIRED')
  assert.throws(()=>createC40Transfer({server:{},authority:f.authority,journal:f.journal,
    getIdentity:f.getIdentity}),e=>e.code==='MOCK_ONLY')
})
test('C40 explicit invalidate removes partial state on user logout',async t=>{
  const f=ctx(t,{failAt:({offset,stream})=>stream==='events'&&offset===2})
  const instance=f.transfer()
  await rejected(()=>instance.read(),'NETWORK_INTERRUPTED')
  assert.ok(f.journal.load(A))
  instance.invalidate(A)
  assert.equal(f.journal.load(A),null)
})
