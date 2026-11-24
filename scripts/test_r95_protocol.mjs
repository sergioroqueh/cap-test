import * as protocol from '../supabase/functions/rutacap-billing/protocol.mjs'
async function runR95ProtocolTests(api){
 const {stripeTestReady,eventCustomer,readSubscriptions,reconcileEvent,checkoutParams}=api
 const results=[],C='cus_synthetic',P='price_synthetic',U='11111111-1111-4111-8111-111111111111'
 const assert=v=>{if(!v)throw Error('assertion failed')}
 async function rejects(fn,code){try{await fn()}catch(e){if(!String(e.message).includes(code))throw Error('expected '+code+' got '+e.message);return}throw Error('expected '+code)}
 async function test(name,fn){await fn();results.push(name)}
 const sub=(patch={})=>({id:'sub_synthetic',customer:C,livemode:false,status:'active',cancel_at_period_end:false,items:{has_more:false,data:[{price:{id:P,livemode:false},quantity:1,current_period_end:1999999999}]},...patch})
 const list=(...data)=>({has_more:false,data})
 const evt=(id='evt_first',type='customer.subscription.updated',object={customer:C})=>({id,type,livemode:false,data:{object}})
 function fixture(){
  let gen=0,current=list(sub()),saved=null
  const receipts=new Set(),calls=[]
  const deps={price:P,begin:async a=>{calls.push('begin');return receipts.has(a.p_event)?{status:'duplicate'}:{status:'ok',generation:String(++gen)}},read:async c=>{assert(c===C);calls.push('read');return current},apply:async a=>{calls.push('apply');if(receipts.has(a.p_event))return {status:'duplicate'};if(a.p_generation!==String(gen))return {status:'stale'};saved=a.p_snapshot;receipts.add(a.p_event);return {status:'applied'}}}
  return {deps,receipts,calls,setList:v=>current=v,getSaved:()=>saved,bump:()=>gen++}
 }
 const config={key:'sk_test_synthetic',approved:'approved',project:'https://rhtbqetskghkarxhrgee.supabase.co',secret:'whsec_synthetic',price:P}
 await test('TEST requires explicit approval and correct project',()=>{assert(stripeTestReady(config));assert(!stripeTestReady({...config,approved:''}));assert(!stripeTestReady({...config,project:'https://other.test'}))})
 await test('LIVE never accepted even with approval',()=>assert(!stripeTestReady({...config,key:'sk_live_synthetic'})))
 await test('live event rejected',()=>rejects(()=>eventCustomer({...evt(),livemode:true}),'EVENT_INVALID'))
 await test('ignored event and non-subscription checkout',()=>{assert(eventCustomer(evt('evt_ignored','customer.created'))===null);assert(eventCustomer(evt('evt_oneoff','checkout.session.completed',{customer:C,mode:'payment'}))===null)})
 await test('invoice Basil and legacy reference',()=>{assert(eventCustomer(evt('evt_invoice','invoice.paid',{customer:C,parent:{subscription_details:{subscription:'sub_synthetic'}}}))===C);assert(eventCustomer(evt('evt_legacy','invoice.payment_failed',{customer:C,subscription:'sub_synthetic'}))===C)})
 await test('provider list must be complete',()=>rejects(()=>readSubscriptions({has_more:true,data:[sub()]},C,P),'SUBSCRIPTION_LIST_INCOMPLETE'))
 await test('foreign customer or live provider object rejected',async()=>{await rejects(()=>readSubscriptions(list(sub({customer:'cus_other'})),C,P),'SUBSCRIPTION_INVALID');await rejects(()=>readSubscriptions(list(sub({livemode:true})),C,P),'SUBSCRIPTION_INVALID')})
 await test('wrong price cannot grant premium',()=>{const r=readSubscriptions(list(sub({items:{has_more:false,data:[{price:{id:'price_wrong',livemode:false},quantity:1}]}})),C,P);assert(r.snapshot===null&&!r.blocked)})
 await test('active period and cancel-at-end retained',()=>{const r=readSubscriptions(list(sub({cancel_at_period_end:true})),C,P);assert(r.snapshot.status==='active'&&r.snapshot.cancelAtPeriodEnd&&r.snapshot.periodEnd===new Date(1999999999000).toISOString())})
 await test('multiple paid subscriptions fail closed',()=>rejects(()=>readSubscriptions(list(sub(),sub({id:'sub_second'})),C,P),'DUPLICATE_ACTIVE'))
 await test('multi-item price ambiguity fails closed',()=>rejects(()=>readSubscriptions(list(sub({items:{has_more:false,data:[{price:{id:P,livemode:false},quantity:2,current_period_end:1999999999}]}})),C,P),'SUBSCRIPTION_PRICE_AMBIGUOUS'))
 await test('paused collection is not premium',()=>assert(readSubscriptions(list(sub({pause_collection:{behavior:'void'}})),C,P).snapshot.status==='paused'))
 await test('incomplete checkout blocks additional checkout without premium',()=>{const r=readSubscriptions(list(sub({status:'incomplete'})),C,P);assert(r.blocked&&r.snapshot.status==='incomplete')})
 await test('existing active takes precedence over incomplete replacement',()=>assert(readSubscriptions(list(sub({id:'sub_new',status:'incomplete'}),sub()),C,P).snapshot.id==='sub_synthetic'))
 await test('webhook atomic API contract and duplicate replay',async()=>{const f=fixture();assert((await reconcileEvent(evt(),f.deps)).status==='applied');assert(f.getSaved().livemode===false&&f.receipts.size===1);assert((await reconcileEvent(evt(),f.deps)).status==='duplicate'&&f.calls.filter(x=>x==='apply').length===1)})
 await test('renewal extends period',async()=>{const f=fixture();await reconcileEvent(evt(),f.deps);const end=f.getSaved().periodEnd;f.setList(list(sub({items:{has_more:false,data:[{price:{id:P,livemode:false},quantity:1,current_period_end:2000000000}]}})));await reconcileEvent(evt('evt_renew','invoice.paid',{customer:C,subscription:'sub_synthetic'}),f.deps);assert(f.getSaved().periodEnd>end)})
 await test('payment failed -> past due',async()=>{const f=fixture();f.setList(list(sub({status:'past_due'})));await reconcileEvent(evt('evt_failed','invoice.payment_failed',{customer:C,subscription:'sub_synthetic'}),f.deps);assert(f.getSaved().status==='past_due')})
 await test('canceled -> no active snapshot',async()=>{const f=fixture();f.setList(list(sub({status:'canceled'})));await reconcileEvent(evt('evt_cancel','customer.subscription.deleted'),f.deps);assert(f.getSaved().empty===true)})
 await test('out-of-order old event reads latest provider state',async()=>{const f=fixture();f.setList(list(sub({status:'canceled'})));await reconcileEvent(evt('evt_old','customer.subscription.created'),f.deps);assert(f.getSaved().empty)})
 await test('stale concurrent reconciliation must retry',async()=>{const f=fixture(),read=f.deps.read;f.deps.read=async c=>{const v=await read(c);f.bump();return v};await rejects(()=>reconcileEvent(evt(),f.deps),'BILLING_RETRY');assert(f.receipts.size===0)})
 await test('provider error leaves no processed receipt',async()=>{const f=fixture();f.deps.read=async()=>{throw Error('provider unavailable')};await rejects(()=>reconcileEvent(evt(),f.deps),'provider unavailable');assert(!f.receipts.size)})
 await test('DB failure leaves event retryable',async()=>{const f=fixture();f.deps.apply=async()=>{throw Error('db unavailable')};await rejects(()=>reconcileEvent(evt(),f.deps),'db unavailable');assert(!f.receipts.size)})
 await test('checkout key and parameters stable across retries',()=>{const args={customer:C,userId:U,price:P,attempt:{attemptId:'22222222-2222-4222-8222-222222222222',expiresAt:1999999999},origin:'https://rutacap.es'};const a=checkoutParams(args),b=checkoutParams(args);assert(JSON.stringify(a)===JSON.stringify(b)&&a.key.startsWith('rutacap-test-')&&a.params['line_items[0][price]']===P&&a.params['payment_method_types[0]']==='card')})
 return results
}
const passed=await runR95ProtocolTests(protocol)
for(const name of passed)console.log('PASS',name)
console.log(passed.length+' R95 protocol tests passed (synthetic only)')
