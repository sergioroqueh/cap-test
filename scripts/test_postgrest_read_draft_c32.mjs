import test from 'node:test'
import assert from 'node:assert/strict'
import {createAccountSyncLease} from '../src/remoteSyncContract.mjs'
import {createPostgrestReadDraft} from '../src/postgrestReadDraft.mjs'
const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const token='synthetic.header.signature'
const event=(id,clock)=>({
 user_id:A,event_id:id,payload:{
  eventId:id,deviceId:'synthetic-dev',clock,occurredAt:1763400000000+clock,
  questionId:'q'+clock,questionnaireId:'cap',kind:'answer',answer:'A',correct:true
 }
})
const session=(id)=>({user_id:A,session_key:id,payload:{
 clientId:id,type:'exam',label:'Synthetic',startedAt:1,completedAt:2,
 answered:1,correct:1,incorrect:0,score:100,answers:[
  {questionId:'q1',questionnaireId:'cap',selected:'A',correctAnswer:'A',correct:true}
 ]
}})
const fixtures={rc_progress_events:[event('e1',1),event('e2',2),event('e3',3)],
 rc_study_sessions:[session('s1'),session('s2')]}
function setup({records=fixtures,callback}={}){
 let reads=0,identities=0
 const lease=createAccountSyncLease({
  enabled:true,getVerifiedIdentity:async()=>{
    identities++;return {verified:true,isAnonymous:false,consented:true,userId:A}
  }
 })
 const mock=async(url,options)=>{
  reads++
  assert.equal(new URL(url).origin,'https://rutacap-fixture.invalid')
  assert.equal(options.method,'GET')
  assert.equal(options.credentials,'omit')
  assert.equal(options.redirect,'error')
  assert.ok(options.signal&&!options.signal.aborted)
  assert.equal(options.headers.Authorization,'Bearer '+token)
  assert.equal(options.headers.apikey,'sb_publishable_fixture_only')
  assert.equal(options.headers.Prefer,'count=exact')
  assert.equal(new URL(url).searchParams.get('user_id'),'eq.'+A)
  if(callback)return callback({url,options,reads,lease})
  const table=new URL(url).pathname.split('/').at(-1)
  assert.ok(Object.hasOwn(records,table))
  const values=records[table]
  const [start,end]=options.headers.Range.split('-').map(Number)
  const slice=values.slice(start,end+1)
  const range=values.length===0?'*/0':start+'-'+(start+slice.length-1)+'/'+values.length
  return new Response(JSON.stringify(slice),{status:slice.length?206:200,
   headers:{'Content-Range':range,'Content-Type':'application/json'}})
 }
 return {
  lease,mock,
  read:(override={})=>createPostgrestReadDraft({
    enabled:true,lease,fetchImpl:mock,getAccessToken:async()=>token,pageSize:2,...override
  }).readOwnerSnapshot(),
  metrics:()=>({reads,identities})
 }
}
test('C32 default off cannot invoke any transport or identity callback',async()=>{
 let calls=0
 const adapter=createPostgrestReadDraft({lease:{execute:async()=>{calls++}}})
 await assert.rejects(adapter.readOwnerSnapshot(),e=>e.code==='CLOUD_OFF')
 assert.equal(calls,0)
})
test('C32 mock owner pagination is complete with JWT, GET only, 0 real network',async()=>{
 const f=setup()
 const got=await f.read()
 assert.equal(got.events.length,3)
 assert.equal(got.sessions.length,2)
 assert.equal(f.metrics().reads,3)
 assert.equal(f.metrics().identities,6)
 assert.equal(got.events[0].questionId,'q1')
})
test('C32 wrong user row is denied even with matching owner-filtered URL',async()=>{
 const altered=structuredClone(fixtures)
 altered.rc_progress_events[1].user_id=B
 const f=setup({records:altered})
 await assert.rejects(f.read(),e=>e.code==='ROW_INVALID')
})
test('C32 refuses live project URLs before any transport',()=>{
 assert.throws(()=>createPostgrestReadDraft({
   origin:'https://rhtbqetskghkarxhrgee.supabase.co',enabled:true,
   fetchImpl:async()=>{throw Error('must not call')}}),e=>e.code==='LIVE_ORIGIN_BLOCKED')
})
test('C32 malformed or missing JWT aborts before any GET',async()=>{
 const f=setup()
 await assert.rejects(f.read({getAccessToken:async()=>''}),e=>e.code==='TOKEN_INVALID')
 assert.equal(f.metrics().reads,0)
})
test('C32 untrusted status, range and truncated pages fail closed',async()=>{
 const cases=[
  {status:403,header:'0-1/3',body:[event('e1',1),event('e2',2)],code:'HTTP_ERROR'},
  {status:206,header:null,body:[event('e1',1),event('e2',2)],code:'RANGE_MISSING'},
  {status:206,header:'1-2/3',body:[event('e1',1),event('e2',2)],code:'RANGE_INVALID'},
  {status:206,header:'0-1/3',body:[event('e1',1)],code:'PAGE_INCOMPLETE'}
 ]
 for(const x of cases){
  const f=setup({callback:async()=>{
   const headers=x.header?{'Content-Range':x.header}:{}
   return new Response(JSON.stringify(x.body),{status:x.status,headers})
  }})
  await assert.rejects(f.read(),e=>e.code===x.code,x.code)
 }
})
test('C32 count changes and duplicate keys abort snapshot without partial return',async()=>{
 const f=setup({callback:async({url,options})=>{
  const table=new URL(url).pathname.split('/').at(-1)
  const [start]=options.headers.Range.split('-').map(Number)
  const values=fixtures[table]
  if(start===0)return new Response(JSON.stringify(values.slice(0,2)),{
   status:206,headers:{'Content-Range':'0-1/3'}})
  return new Response(JSON.stringify([values[2]]),{
   status:206,headers:{'Content-Range':'2-2/4'}})
 }})
 await assert.rejects(f.read(),e=>e.code==='SNAPSHOT_CHANGED')
 const duplicate=setup({records:{...fixtures,rc_progress_events:[
  event('e1',1),event('e2',2),event('e1',1)]}})
 await assert.rejects(duplicate.read(),e=>e.code==='DUPLICATE_KEY')
})
test('C32 logout aborts lease while an injected GET is pending',async()=>{
 const f=setup({callback:async({options,lease})=>{
  lease.revoke()
  return new Response(JSON.stringify([event('e1',1)]),{
   status:206,headers:{'Content-Range':'0-0/1'}})
 }})
 await assert.rejects(f.read(),e=>e.code==='CANCELLED')
})
test('C32 missing data or oversized row count blocks snapshot',async()=>{
 const f=setup({callback:async()=>new Response('[]',{
  status:206,headers:{'Content-Range':'0-0/50001'}})})
 await assert.rejects(f.read(),e=>e.code==='RANGE_INVALID')
 const bad=setup({records:{rc_progress_events:[],rc_study_sessions:[]}})
 const got=await bad.read()
 assert.deepEqual(got,{events:[],sessions:[]})
})
