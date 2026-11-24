import {createCommercialSyncTransport,createCommercialPostgrestRequest} from '../src/commercialSyncTransport.mjs'
async function runTransportTests(create,createRequest){
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333'
  const results=[]
  function assert(b){if(!b)throw Error('assertion failed')}
  async function reject(fn,code){try{await fn()}catch(e){assert(String(e.message).includes(code));return}throw Error('expected '+code)}
  function fixture(){
    let user=A,scope=true,revision=1,granted=true,session=S,anonymous=false,corrupt=false,collision=false
    const db={events:[],sessions:[]},calls=[]
    const event={eventId:'event-1',questionId:'q1',occurredAt:1700000000000,kind:'answer'}
    const record={clientId:'session-1',completedAt:1700000000000}
    const validateRecords=r=>({events:r.events,sessions:r.sessions})
    const opts={enabled:true,expectedUserId:A,ownerCurrent:()=>scope,
      verifyIdentity:async()=>({verified:true,isAnonymous:anonymous,userId:user,sessionId:session,accessToken:'synthetic-token'}),
      validateRecords,request:async req=>{
        calls.push(req)
        if(req.path.startsWith('rc_sync_consents?'))return [{user_id:A,purpose:'progress-sync',notice_version:'progress-sync-v1',granted,revision,revoked_at:granted?null:'revoked'}]
        if(req.path.startsWith('rpc/'))return corrupt?null:{schemaVersion:1,userId:A,events:db.events.slice(),sessions:db.sessions.slice()}
        const target=req.path.startsWith('rc_progress_events')?db.events:db.sessions
        const key=req.path.startsWith('rc_progress_events')?'eventId':'clientId'
        for(const row of req.body)if(!target.some(x=>x[key]===row.payload[key]))target.push(collision?{...row.payload,kind:'different'}:row.payload)
        return null
      }}
    return {opts,db,calls,event,record,setUser:v=>user=v,setScope:v=>scope=v,setRevision:v=>revision=v,setGranted:v=>granted=v,setSession:v=>session=v,setAnonymous:v=>anonymous=v,setCorrupt:v=>corrupt=v,setCollision:v=>collision=v}
  }
  async function test(name,fn){await fn();results.push(name)}
  await test('disabled and guest deny before network',async()=>{let f=fixture();await reject(()=>create({...f.opts,enabled:false}).pull(A),'SCOPE_DENIED');f.setAnonymous(true);await reject(()=>create(f.opts).pull(A),'IDENTITY_DENIED');assert(!f.calls.length)})
  await test('owner A cannot request B',async()=>{const f=fixture();await reject(()=>create(f.opts).pull(B),'OWNER_MISMATCH');assert(!f.calls.length)})
  await test('consent absent blocks snapshot',async()=>{const f=fixture();f.setGranted(false);await reject(()=>create(f.opts).pull(A),'CONSENT_DENIED');assert(f.calls.length===1)})
  await test('null snapshot denied, not empty',async()=>{const f=fixture();f.setCorrupt(true);await reject(()=>create(f.opts).pull(A),'SNAPSHOT_DENIED')})
  await test('insert-only and idempotent retry',async()=>{const f=fixture(),t=create(f.opts);const input={events:[f.event],sessions:[f.record]};await t.insertMissing(A,input);await t.insertMissing(A,input);assert(f.db.events.length===1&&f.db.sessions.length===1);const writes=f.calls.filter(r=>r.prefer);assert(writes.length===2&&writes.every(r=>r.body[0].user_id===A&&r.prefer.includes('ignore-duplicates')))})
  await test('existing conflicting event rejected before write',async()=>{const f=fixture();f.db.events.push({...f.event,kind:'different'});await reject(()=>create(f.opts).insertMissing(A,{events:[f.event],sessions:[]}),'RECORD_COLLISION');assert(!f.calls.some(r=>r.prefer))})
  await test('racing duplicate with different payload detected',async()=>{const f=fixture();f.setCollision(true);await reject(()=>create(f.opts).insertMissing(A,{events:[f.event],sessions:[]}),'RECORD_COLLISION')})
  await test('consent revision changes invalidate lease',async()=>{const f=fixture(),t=create(f.opts);await t.pull(A);f.setRevision(2);await reject(()=>t.pull(A),'CONSENT_CHANGED')})
  await test('account or session switch invalidates lease',async()=>{const f=fixture(),t=create(f.opts);await t.pull(A);f.setUser(B);await reject(()=>t.pull(A),'IDENTITY_DENIED');f.setUser(A);f.setSession(B);await reject(()=>t.pull(A),'SESSION_CHANGED')})
  await test('scope changes while request pending',async()=>{const f=fixture(),req=f.opts.request;f.opts.request=async r=>{const x=await req(r);f.setScope(false);return x};await reject(()=>create(f.opts).pull(A),'SCOPE_DENIED')})
  await test('local numeric session IDs rejected',async()=>{const f=fixture();await reject(()=>create(f.opts).insertMissing(A,{events:[],sessions:[{...f.record,id:1}]}),'RECORDS_INVALID')})
  await test('closed lease cannot be reused',async()=>{const f=fixture(),t=create(f.opts);t.close();await reject(()=>t.pull(A),'SCOPE_DENIED')})
  await test('pinned origin, no cache or redirect, bearer header',async()=>{let req;const r=createRequest({publishableKey:'sb_publishable_synthetic',fetchImpl:async (url,options)=>{req={url,options};return {ok:true,status:200,json:async()=>[]}}});await r({path:'rc_sync_consents?select=user_id',method:'GET',accessToken:'fake'});assert(req.url.startsWith('https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/')&&req.options.cache==='no-store'&&req.options.redirect==='error'&&req.options.headers.Authorization==='Bearer fake');await reject(()=>r({path:'https://other.test',method:'GET',accessToken:'fake'}),'REQUEST_DENIED')})
  return results
}
const passed=await runTransportTests(createCommercialSyncTransport,createCommercialPostgrestRequest)
for(const name of passed) console.log('PASS',name)
console.log(passed.length+' transport tests passed (synthetic only)')
