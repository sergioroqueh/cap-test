import * as api from '../src/protectedSelection.mjs'
import {createDeliveryClient} from '../src/commercialDelivery.mjs'
import {uniqueExamQuestions} from '../src/examEngine.mjs'
async function runR97Tests(api,createClient,unique){
 const {validateSelectionInput,validateSelectionReply,createSelectionRequest}=api
 const tests=[],assert=v=>{if(!v)throw Error('assertion failed')}
 const U='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',R='33333333-3333-4333-8333-333333333333'
 const input={mode:'mixed-study',category:'mercancias',count:20,hints:{},requestId:R}
 const question=(i=1,patch={})=>({id:'cap:synthetic:'+i,progressId:'canonical-'+i,examId:'synthetic',category:'mercancias',section:'1',questionnaireId:'synthetic',question:'SYNTHETIC QUESTION '+i,options:{A:'a',B:'b',C:'c',D:'d'},originalSheetAnswer:'A',correctAnswer:'A',scoringEligible:true,examFrequency:4,...patch})
 const reply=(x=input,rows=[question()],patch={})=>({status:'ok',tier:'guest',day:'2026-11-24',resetAt:'2026-11-24T23:00:00Z',questionsRemaining:24,examsRemaining:1,replayed:false,mode:x.mode,category:x.category,requestId:x.requestId,requested:x.count,count:rows.length,content:{questions:rows},...patch})
 const rejects=async(fn,code='R97_SELECTION_INVALID')=>{try{await fn()}catch(e){if(!String(e.message).includes(code))throw Error('expected '+code+' got '+e.message);return}throw Error('expected failure')}
 async function test(name,fn){await fn();tests.push(name)}
 await test('valid mixed study selection',()=>assert(validateSelectionInput(input)===input))
 await test('exact full mixed exam',()=>{const x={...input,mode:'mixed-exam',count:100};assert(validateSelectionReply(reply(x,Array.from({length:100},(_,i)=>question(i+1)),{examsRemaining:0}),x,true).count===100)})
 await test('short mixed exam rejected',()=>rejects(()=>validateSelectionReply(reply({...input,mode:'mixed-exam',count:100}),{...input,mode:'mixed-exam',count:100},true)))
 await test('mixed exam count cannot be changed',()=>rejects(()=>validateSelectionInput({...input,mode:'mixed-exam',count:99})))
 await test('untrusted tier or token injection rejected',async()=>{await rejects(()=>validateSelectionInput({...input,tier:'premium'}));await rejects(()=>validateSelectionInput({...input,accessToken:'foreign'}))})
 await test('count and mode limits',async()=>{await rejects(()=>validateSelectionInput({...input,count:101}));await rejects(()=>validateSelectionInput({...input,mode:'unknown'}))})
 await test('guest partial delivery accepted',()=>assert(validateSelectionReply(reply(input,[question(1),question(2)],{questionsRemaining:0}),input,true).count===2))
 await test('denial cannot contain payload',()=>rejects(()=>validateSelectionReply(reply(input,[question()],{status:'quota_exhausted',questionsRemaining:0}),input,true)))
 await test('canonical duplicate rejected',()=>rejects(()=>validateSelectionReply(reply(input,[question(1),question(2,{progressId:'canonical-1'})]),input,true)))
 await test('normalized stem duplicate rejected consistently with legacy',async()=>{const rows=[question(1,{question:'¿ÁRBOL  TEST?'}),question(2,{question:'árbol test'})];assert(unique(rows).length===1);await rejects(()=>validateSelectionReply(reply(input,rows),input,true))})
 await test('excluded or nonhistorical question rejected',async()=>{await rejects(()=>validateSelectionReply(reply(input,[question(1,{scoringEligible:false})]),input,true));await rejects(()=>validateSelectionReply(reply(input,[question(1,{originalSheetAnswer:null})]),input,true))})
 await test('category mismatch rejected',()=>rejects(()=>validateSelectionReply(reply(input,[question(1,{category:'viajeros'})]),input,true)))
 await test('frequency threshold verified',async()=>{for(const mode of ['top100','top3','top4']){const x={...input,mode};assert(validateSelectionReply(reply(x),x,true).count===1)}const x={...input,mode:'top4'};await rejects(()=>validateSelectionReply(reply(x,[question(1,{examFrequency:3})]),x,true))})
 await test('favorite/error preference must match returned canonical ID',async()=>{for(const mode of ['favorites','errors']){const x={...input,mode,hints:{'canonical-1':1}};assert(validateSelectionReply(reply(x),x,true).count===1);await rejects(()=>validateSelectionReply(reply(x,[question(2)]),x,true))}})
 await test('review accepts unseen authorized questions and numeric scores',()=>{const x={...input,mode:'review',hints:{'canonical-1':-2,'canonical-2':12}};validateSelectionInput(x);assert(validateSelectionReply(reply(x,[question(3)]),x,true).count===1)})
 await test('request ID and selected mode bound to reply',async()=>{await rejects(()=>validateSelectionReply(reply(input,[question()],{requestId:U}),input,true));await rejects(()=>validateSelectionReply(reply(input,[question()],{mode:'top4'}),input,true))})
 await test('premium cannot be asserted by guest response',()=>rejects(()=>validateSelectionReply(reply(input,[question()],{tier:'premium',questionsRemaining:null,examsRemaining:null}),input,true)))
 await test('transport emits only approved RPC parameters',async()=>{let call;const request=createSelectionRequest({publishableKey:'sb_publishable_synthetic',fetchImpl:async(url,options)=>{call={url,options};return {ok:true,json:async()=>reply()}}});await request({...input,accessToken:'synthetic'});assert(call.url.endsWith('/rpc/rc_deliver_selection_v1')&&call.options.cache==='no-store'&&call.options.redirect==='error'&&Object.keys(JSON.parse(call.options.body)).sort().join(',')==='p_category,p_count,p_hints,p_mode,p_request_id')})
 function fixture(){const state={user:U,session:S,scope:true,calls:0};const opts={enabled:true,expectedUserId:U,expectedAnonymous:true,ownerCurrent:()=>state.scope,verifyIdentity:async()=>({verified:true,userId:state.user,isAnonymous:true,sessionId:state.session,accessToken:'synthetic'}),request:async()=>{throw Error('no legacy fallback')},selectionRequest:async()=>{state.calls++;return reply()}};return {state,opts}}
 await test('disabled lease never calls selection',async()=>{const f=fixture();await rejects(()=>createClient({...f.opts,enabled:false}).select(input),'SCOPE_DENIED');assert(!f.state.calls)})
 await test('account switch during selection rejected',async()=>{const f=fixture();f.opts.selectionRequest=async()=>{f.state.user=S;return reply()};await rejects(()=>createClient(f.opts).select(input),'IDENTITY_DENIED')})
 await test('session change after first selection rejected',async()=>{const f=fixture(),c=createClient(f.opts);await c.select(input);f.state.session=U;await rejects(()=>c.select(input),'SESSION_CHANGED')})
 await test('same request ID replay retained',async()=>{const f=fixture(),keys=[];f.opts.selectionRequest=async x=>{keys.push(x.requestId);return reply()};const c=createClient(f.opts);await c.select(input);await c.select(input);assert(keys.length===2&&keys.every(k=>k===R))})
 return tests
}
const passed=await runR97Tests(api,createDeliveryClient,uniqueExamQuestions)
for(const name of passed)console.log('PASS',name)
console.log(passed.length+' R97 synthetic selection tests passed')
