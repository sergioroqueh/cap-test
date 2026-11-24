// R91 regressions updated for R92 transactional RPCs.
import {createCommercialSyncTransport,createCommercialPostgrestRequest} from '../src/commercialSyncTransport.mjs'
async function runTransportTests(create,createRequest){
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333'
  const results=[]
  function assert(b){if(!b)throw Error('assertion failed')}
  async function reject(fn,code){try{await fn()}catch(e){assert(String(e.message).includes(code));return}throw Error('expected '+code)}
  function fixture(){
    let user=A,scope=true,revision=1,granted=true,session=S,anonymous=false,corrupt=false,collision=false,generation=0,changes=0,stale=false,foreign=false,loop=false,pageCap=100
    const db={events:[],sessions:[]},calls=[]
    const event={eventId:'event-1',questionId:'q1',occurredAt:1700000000000,kind:'answer'}
    const record={clientId:'session-1',completedAt:1700000000000}
    const validateRecords=r=>({events:r.events,sessions:r.sessions})
    const opts={enabled:true,expectedUserId:A,ownerCurrent:()=>scope,
      verifyIdentity:async()=>({verified:true,isAnonymous:anonymous,userId:user,sessionId:session,accessToken:'synthetic-token'}),
      validateRecords,request:async req=>{
        calls.push(req)
        if(req.path.startsWith('rc_sync_consents?'))return [{user_id:A,purpose:'progress-sync',notice_version:'progress-sync-v1',granted,revision,revoked_at:granted?null:'revoked'}]
        const b=req.body
        assert(b.p_revision===revision&&b.p_session===session)
        if(req.path.endsWith('page_v1')){
          if(b.p_after&&changes>0){changes--;generation++}
          if(b.p_generation!==null&&b.p_generation!==String(generation))return {status:'changed'}
          const key=b.p_kind==='events'?'eventId':'clientId'
          const all=db[b.p_kind].slice().sort((a,b)=>a[key]<b[key]?-1:a[key]>b[key]?1:0).filter(r=>b.p_after===null||r[key]>b.p_after)
          const rows=all.slice(0,Math.min(b.p_limit,pageCap))
          return corrupt?null:{status:'ok',schemaVersion:2,userId:foreign?B:A,generation:String(generation),kind:b.p_kind,records:rows,nextCursor:loop?'bogus':all.length>rows.length?rows[rows.length-1][key]:null}
        }
        if(stale){stale=false;generation++;return {status:'changed'}}
        if(b.p_generation!==String(generation))return {status:'changed'}
        if(collision)throw Error('SYNC_EVENT_COLLISION')
        let inserted=0
        for(const [kind,rows,key] of [['events',b.p_events,'eventId'],['sessions',b.p_sessions,'clientId']])
          for(const row of rows)if(!db[kind].some(x=>x[key]===row[key])){db[kind].push(row);inserted++}
        if(inserted)generation++
        return {status:'ok',userId:A,generation:String(generation),inserted}
      }}
    return {opts,db,calls,event,record,setUser:v=>user=v,setScope:v=>scope=v,setRevision:v=>revision=v,setGranted:v=>granted=v,setSession:v=>session=v,setAnonymous:v=>anonymous=v,setCorrupt:v=>corrupt=v,setCollision:v=>collision=v,setChanges:v=>changes=v,setStale:v=>stale=v,setForeign:v=>foreign=v,setLoop:v=>loop=v,setPageCap:v=>pageCap=v}
  }
  async function test(name,fn){await fn();results.push(name)}
  await test('disabled and guest deny before network',async()=>{let f=fixture();await reject(()=>create({...f.opts,enabled:false}).pull(A),'SCOPE_DENIED');f.setAnonymous(true);await reject(()=>create(f.opts).pull(A),'IDENTITY_DENIED');assert(!f.calls.length)})
  await test('owner A cannot request B',async()=>{const f=fixture();await reject(()=>create(f.opts).pull(B),'OWNER_MISMATCH');assert(!f.calls.length)})
  await test('consent absent blocks snapshot',async()=>{const f=fixture();f.setGranted(false);await reject(()=>create(f.opts).pull(A),'CONSENT_DENIED');assert(f.calls.length===1)})
  await test('null snapshot denied, not empty',async()=>{const f=fixture();f.setCorrupt(true);await reject(()=>create(f.opts).pull(A),'SNAPSHOT_DENIED')})
  await test('insert-only and idempotent retry',async()=>{const f=fixture(),t=create(f.opts);const input={events:[f.event],sessions:[f.record]};await t.insertMissing(A,input);await t.insertMissing(A,input);assert(f.db.events.length===1&&f.db.sessions.length===1);const writes=f.calls.filter(r=>r.path.endsWith('ingest_v1'));assert(writes.length===1&&writes[0].body.p_events.length===1&&writes[0].body.p_sessions.length===1&&!('user_id'in writes[0].body))})
  await test('existing conflicting event rejected before write',async()=>{const f=fixture();f.db.events.push({...f.event,kind:'different'});await reject(()=>create(f.opts).insertMissing(A,{events:[f.event],sessions:[]}),'RECORD_COLLISION');assert(!f.calls.some(r=>r.path.endsWith('ingest_v1')))})
  await test('SQL collision rejects the batch',async()=>{const f=fixture();f.setCollision(true);await reject(()=>create(f.opts).insertMissing(A,{events:[f.event],sessions:[]}),'SYNC_EVENT_COLLISION');assert(!f.db.events.length)})
  await test('consent revision changes invalidate lease',async()=>{const f=fixture(),t=create(f.opts);await t.pull(A);f.setRevision(2);await reject(()=>t.pull(A),'CONSENT_CHANGED')})
  await test('account or session switch invalidates lease',async()=>{const f=fixture(),t=create(f.opts);await t.pull(A);f.setUser(B);await reject(()=>t.pull(A),'IDENTITY_DENIED');f.setUser(A);f.setSession(B);await reject(()=>t.pull(A),'SESSION_CHANGED')})
  await test('scope changes while request pending',async()=>{const f=fixture(),req=f.opts.request;f.opts.request=async r=>{const x=await req(r);f.setScope(false);return x};await reject(()=>create(f.opts).pull(A),'SCOPE_DENIED')})
  await test('local numeric session IDs rejected',async()=>{const f=fixture();await reject(()=>create(f.opts).insertMissing(A,{events:[],sessions:[{...f.record,id:1}]}),'RECORDS_INVALID')})
  await test('closed lease cannot be reused',async()=>{const f=fixture(),t=create(f.opts);t.close();await reject(()=>t.pull(A),'SCOPE_DENIED')})
  await test('pinned origin, no cache or redirect, bearer header',async()=>{let req;const r=createRequest({publishableKey:'sb_publishable_synthetic',fetchImpl:async (url,options)=>{req={url,options};return {ok:true,status:200,json:async()=>[]}}});await r({path:'rc_sync_consents?select=user_id',method:'GET',accessToken:'fake'});assert(req.url.startsWith('https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/')&&req.options.cache==='no-store'&&req.options.redirect==='error'&&req.options.headers.Authorization==='Bearer fake');await reject(()=>r({path:'https://other.test',method:'GET',accessToken:'fake'}),'REQUEST_DENIED')})
  await test('5001 events and sessions without truncation',async()=>{const f=fixture();f.db.events=Array.from({length:5001},(_,i)=>({...f.event,eventId:'e'+String(i).padStart(5,'0')}));f.db.sessions=Array.from({length:5001},(_,i)=>({...f.record,clientId:'s'+String(i).padStart(5,'0')}));const r=await create(f.opts).pull(A);assert(r.events.length===5001&&r.sessions.length===5001&&new Set(r.events.map(x=>x.eventId)).size===5001)})
  await test('generation changes restart complete snapshot',async()=>{const f=fixture();f.db.events=Array.from({length:101},(_,i)=>({...f.event,eventId:'e'+String(i).padStart(3,'0')}));f.setChanges(1);const r=await create(f.opts).pull(A);assert(r.events.length===101&&f.calls.filter(c=>c.body?.p_kind==='events'&&c.body.p_after===null).length===2)})
  await test('continuous contention bounded',async()=>{const f=fixture();f.db.events=Array.from({length:101},(_,i)=>({...f.event,eventId:'e'+String(i).padStart(3,'0')}));f.setChanges(4);await reject(()=>create(f.opts).pull(A),'SNAPSHOT_BUSY')})
  await test('stale generation rejects write then retry succeeds',async()=>{const f=fixture(),t=create(f.opts),r={events:[f.event],sessions:[]};f.setStale(true);await reject(()=>t.insertMissing(A,r),'WRITE_STALE');assert(!f.db.events.length);await t.insertMissing(A,r);assert(f.db.events.length===1)})
  await test('foreign owner page denied',async()=>{const f=fixture();f.setForeign(true);await reject(()=>create(f.opts).pull(A),'SNAPSHOT_DENIED')})
  await test('invalid cursor denied',async()=>{const f=fixture();f.setLoop(true);await reject(()=>create(f.opts).pull(A),'CURSOR_INVALID')})
  await test('direct writes forbidden',async()=>{const r=createRequest({publishableKey:'sb_publishable_synthetic',fetchImpl:async()=>{throw Error('unexpected network')}});await reject(()=>r({path:'rc_progress_events?on_conflict=user_id,event_id',method:'POST',accessToken:'fake'}),'REQUEST_DENIED')})
  await test('short byte-bounded pages keep cursor and all records',async()=>{const f=fixture();f.setPageCap(2);f.db.events=Array.from({length:5},(_,i)=>({...f.event,eventId:'e'+i}));const r=await create(f.opts).pull(A);assert(r.events.length===5&&f.calls.filter(x=>x.body?.p_kind==='events').length===3)})
  return results
}
const passed=await runTransportTests(createCommercialSyncTransport,createCommercialPostgrestRequest)
for(const name of passed) console.log('PASS',name)
console.log(passed.length+' transport tests passed (synthetic only)')
