import {createDeliveryClient,createDeliveryRequest} from '../src/commercialDelivery.mjs'
async function runDeliveryTests(create,requestFactory){
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333',R='44444444-4444-4444-8444-444444444444'
 const input={kind:'question',contentId:'q:1',requestId:R},results=[]
 const assert=v=>{if(!v)throw Error('assertion failed')}
 async function reject(fn,code){try{await fn()}catch(e){if(!String(e.message).includes(code))throw Error('expected '+code+' got '+e.message);return}throw Error('expected '+code)}
 function fixture(anonymous=true){
  const s={user:A,session:S,scope:true,anonymous,tier:anonymous?'guest':'free',calls:[],patch:{}}
  const caps={guest:[25,1],free:[100,3],premium:[null,null]}
  const opts={enabled:true,expectedUserId:A,expectedAnonymous:anonymous,ownerCurrent:()=>s.scope,verifyIdentity:async()=>({verified:true,userId:s.user,isAnonymous:s.anonymous,sessionId:s.session,accessToken:'fake'}),request:async req=>{s.calls.push(req);const cap=caps[s.tier];return {status:'ok',tier:s.tier,day:'2026-11-24',resetAt:'2026-11-24T23:00:00Z',questionsRemaining:cap[0]===null?null:cap[0]-1,examsRemaining:cap[1],replayed:false,kind:req.kind,contentId:req.contentId,revision:'v1',content:{synthetic:true},...s.patch}}}
  return {s,opts}
 }
 async function test(name,fn){await fn();results.push(name)}
 await test('disabled denies before network',async()=>{const f=fixture();await reject(()=>create({...f.opts,enabled:false}).deliver(input),'SCOPE_DENIED');assert(!f.s.calls.length)})
 await test('guest delivery',async()=>{const f=fixture();assert((await create(f.opts).deliver(input)).questionsRemaining===24)})
 await test('free account delivery',async()=>{const f=fixture(false);assert((await create(f.opts).deliver(input)).questionsRemaining===99)})
 await test('unlimited premium only from server',async()=>{const f=fixture(false);f.s.tier='premium';const r=await create(f.opts).deliver(input);assert(r.questionsRemaining===null&&r.examsRemaining===null)})
 await test('guest cannot accept premium response',async()=>{const f=fixture();f.s.tier='premium';await reject(()=>create(f.opts).deliver(input),'RESPONSE_INVALID')})
 await test('cross-account denied',async()=>{const f=fixture();f.s.user=B;await reject(()=>create(f.opts).deliver(input),'IDENTITY_DENIED');assert(!f.s.calls.length)})
 await test('anonymous mismatch denied',async()=>{const f=fixture(false);f.s.anonymous=true;await reject(()=>create(f.opts).deliver(input),'IDENTITY_DENIED')})
 await test('scope change mid-flight denied',async()=>{const f=fixture(),req=f.opts.request;f.opts.request=async x=>{const r=await req(x);f.s.scope=false;return r};await reject(()=>create(f.opts).deliver(input),'SCOPE_DENIED')})
 await test('session switch denied',async()=>{const f=fixture(),c=create(f.opts);await c.deliver(input);f.s.session=B;await reject(()=>c.deliver(input),'SESSION_CHANGED')})
 await test('request ID reused unchanged',async()=>{const f=fixture(),c=create(f.opts);await c.deliver(input);await c.deliver(input);assert(f.s.calls.every(x=>x.requestId===R))})
 await test('quota exhaustion without payload',async()=>{const f=fixture();f.opts.request=async()=>({status:'quota_exhausted',tier:'guest',day:'2026-11-24',resetAt:'2026-11-24T23:00:00Z',questionsRemaining:0,examsRemaining:1,replayed:false});assert((await create(f.opts).deliver(input)).status==='quota_exhausted')})
 await test('quota denial containing payload rejected',async()=>{const f=fixture();f.s.patch={status:'quota_exhausted',questionsRemaining:0};await reject(()=>create(f.opts).deliver(input),'RESPONSE_INVALID')})
 await test('unavailable has no payload',async()=>{const f=fixture();f.opts.request=async()=>({status:'unavailable'});assert((await create(f.opts).deliver(input)).status==='unavailable')})
 await test('mismatched content and request ID denied',async()=>{const f=fixture();f.s.patch={contentId:'other'};const c=create(f.opts);await reject(()=>c.deliver(input),'RESPONSE_INVALID');await reject(()=>c.deliver({...input,requestId:'bad'}),'REQUEST_INVALID')})
 await test('invalid remaining count denied',async()=>{const f=fixture();f.s.patch={questionsRemaining:26};await reject(()=>create(f.opts).deliver(input),'RESPONSE_INVALID')})
 await test('closed lease denied',async()=>{const f=fixture(),c=create(f.opts);c.close();await reject(()=>c.deliver(input),'SCOPE_DENIED')})
 await test('request cannot supply tier, identity or count',async()=>{let call;const r=requestFactory({publishableKey:'sb_publishable_test',fetchImpl:async(url,options)=>{call={url,options};return {ok:true,json:async()=>({status:'unavailable'})}}});await r({...input,accessToken:'fake',tier:'premium',userId:B,count:100});const b=JSON.parse(call.options.body);assert(call.url==='https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/rpc/rc_deliver_v1'&&Object.keys(b).sort().join(',')==='p_content_id,p_kind,p_request_id'&&b.p_request_id===R&&call.options.cache==='no-store'&&call.options.redirect==='error')})
 await test('network error has no fallback',async()=>{const r=requestFactory({publishableKey:'sb_publishable_test',fetchImpl:async()=>({ok:false,status:503})});await reject(()=>r({...input,accessToken:'fake'}),'REMOTE_503')})
 return results
}
const passed=await runDeliveryTests(createDeliveryClient,createDeliveryRequest)
for(const name of passed)console.log('PASS',name)
console.log(passed.length+' R93 delivery transport tests passed (synthetic only)')
