import test from 'node:test'
import assert from 'node:assert/strict'
import {createSnapshotCursorDraft} from '../src/snapshotCursorDraft.mjs'
import {createAccountSyncLease} from '../src/remoteSyncContract.mjs'
const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const events=Array.from({length:5},(_,i)=>({
  eventId:'ev-'+i,deviceId:'device-1',clock:i+1,
  occurredAt:1763500000000+i,questionId:'q-'+i,questionnaireId:'historico',
  kind:'answer',answer:'A',correct:true
}))
const sessions=Array.from({length:3},(_,i)=>({
  clientId:'sess-'+i,type:'exam',label:'CAP simulacro',startedAt:i+1,
  completedAt:i+2,total:1,answered:1,correct:1,incorrect:0,score:100,
  answers:[{questionId:'q-'+i,questionnaireId:'historico',selected:'A',
    correctAnswer:'A',correct:true}]
}))
function fixture(options={}){
  let identity={verified:true,isAnonymous:false,consented:true,userId:A}
  const lease=createAccountSyncLease({enabled:true,getVerifiedIdentity:async()=>identity})
  const live={events:structuredClone(events),sessions:structuredClone(sessions)}
  let pinned=null,reads=0,started=0
  const provider={
    fixtureOnly:true,
    async begin({ownerId,signal}){
      assert.equal(signal.aborted,false)
      if(ownerId!==A)throw Error('Wrong account')
      pinned=structuredClone(live)
      started++
      return {ownerId,snapshotId:'snap-'+started,checkpoint:'fixed-digest-1',
        counts:{events:pinned.events.length,sessions:pinned.sessions.length}}
    },
    async page({ownerId,snapshotId,checkpoint,table,offset,limit,signal}){
      assert.equal(ownerId,A)
      assert.equal(snapshotId,'snap-1')
      assert.equal(checkpoint,'fixed-digest-1')
      assert.equal(signal.aborted,false)
      reads++
      if(options.onPage)await options.onPage({table,offset,limit,live,lease})
      const rows=pinned[table].slice(offset,offset+limit)
      const answer={ownerId,snapshotId,checkpoint,table,offset,total:pinned[table].length,items:rows}
      return options.modifyPage?options.modifyPage(answer):answer
    },
    async finish({ownerId,snapshotId,checkpoint}){
      const answer={ownerId,snapshotId,checkpoint,committed:true}
      return options.modifyFinish?options.modifyFinish(answer):answer
    }
  }
  const read=(more={})=>createSnapshotCursorDraft({
    enabled:true,provider,lease,pageSize:2,...more
  }).readOwnerSnapshot()
  return {read,lease,live,setIdentity:value=>{identity=value},getReads:()=>reads}
}
test('C33 no provider reads when disabled by default',async()=>{
  const adapter=createSnapshotCursorDraft({provider:{fixtureOnly:true}})
  await assert.rejects(adapter.readOwnerSnapshot(),e=>e.code==='CLOUD_OFF')
})
test('C33 pinned snapshot frozen across pages despite simultaneous live writes',async()=>{
  const f=fixture({onPage:async({table,offset,live})=>{
    if(table==='events'&&offset===0){
      // Same-count replacement during old offset paging is dangerous;
      // our fixture snapshot remains unchanged.
      live.events[3]={...live.events[3],eventId:'new-same-count'}
      live.sessions.push({...sessions[0],clientId:'new-session'})
    }
  }})
  const result=await f.read()
  assert.equal(result.events.length,5)
  assert.equal(result.sessions.length,3)
  assert.equal(result.events[3].eventId,'ev-3')
  assert.equal(f.live.sessions.length,4)
  assert.equal(f.getReads(),5)
})
test('C33 changed snapshot marker is denied, even when total row count unchanged',async()=>{
  const f=fixture({modifyPage:p=>p.table==='events'&&p.offset===2?
    {...p,checkpoint:'unrelated-tx'}:p})
  await assert.rejects(f.read(),e=>e.code==='PAGE_INVALID')
})
test('C33 missing page, wrong owner or duplicate immutable key fail closed',async()=>{
  for(const mutate of [
    p=>p.table==='events'&&p.offset===2?{...p,items:[]}:p,
    p=>p.table==='events'&&p.offset===0?{...p,ownerId:B}:p,
    p=>p.table==='events'&&p.offset===2?{...p,items:[p.items[0],p.items[0]]}:p,
    p=>p.table==='sessions'&&p.offset===2?{...p,items:[{...p.items[0],clientId:'sess-0'}]}:p
  ]){
    const f=fixture({modifyPage:mutate})
    await assert.rejects(f.read(),e=>e.code==='PAGE_INVALID'||e.code==='KEY_INVALID')
  }
})
test('C33 final server checkpoint mismatch invalidates all collected pages',async()=>{
  const f=fixture({modifyFinish:p=>({...p,checkpoint:'changed-after-pages'})})
  await assert.rejects(f.read(),e=>e.code==='SNAPSHOT_INVALID')
})
test('C33 identity switching or logout while awaiting a page aborts result',async()=>{
  const f=fixture({onPage:async({lease})=>lease.revoke()})
  await assert.rejects(f.read(),e=>e.code==='CANCELLED')
  const g=fixture({onPage:async()=>{g.setIdentity({
    verified:true,isAnonymous:false,consented:true,userId:B
  })}})
  await assert.rejects(g.read(),e=>e.code==='ACCOUNT_SWITCH')
})
test('C33 rejects untrusted provider, bounds and oversized manifest',async()=>{
  const f=fixture()
  await assert.rejects(createSnapshotCursorDraft({
    enabled:true,lease:f.lease,provider:{begin(){},page(){},finish(){}}
  }).readOwnerSnapshot(),e=>e.code==='PROVIDER_MISSING')
  assert.throws(()=>createSnapshotCursorDraft({enabled:true,pageSize:2000}),
    e=>e.code==='BOUNDS_INVALID')
  await assert.rejects(f.read({maxRows:2}),e=>e.code==='MANIFEST_INVALID')
})
