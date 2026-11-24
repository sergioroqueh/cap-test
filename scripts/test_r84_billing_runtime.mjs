import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHmac,webcrypto} from 'node:crypto'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import * as protocol from '../supabase/functions/rutacap-billing/protocol.mjs'

// R84 HTTP regression upgraded to R95. Real HMAC, fake provider and DB only.
function boot(overrides={}){
 const U='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222'
 const C='cus_synthetic',P='price_synthetic'
 const env={STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',
  STRIPE_PRICE_ID:P,SUPABASE_URL:'https://rhtbqetskghkarxhrgee.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic_service_role',RUTACAP_TEST_BILLING:'approved',...overrides}
 const state={customer:null,subs:[],receipts:new Set(),generation:0,snapshot:null,allow:true,failApply:false,requests:[],attempt:null}
 const admin={
  auth:{
   getUser:async token=>token==='valid_test_jwt'?{data:{user:{id:U,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01',is_anonymous:false}},error:null}:{data:{user:null},error:{}},
   getClaims:async()=>({data:{claims:{sub:U,iss:env.SUPABASE_URL+'/auth/v1',role:'authenticated',is_anonymous:false,session_id:S,exp:Math.floor(Date.now()/1000)+3600}},error:null})
  },
  from(name){
   assert.equal(name,'rc_billing_customers')
   return {select(){return this},eq(){return this},async maybeSingle(){return {data:state.customer,error:null}},
    async insert(row){state.customer=row;return {error:null}}}
  },
  async rpc(name,a){
   if(name==='rc_billing_test_authorize_v1')return {data:null,error:state.allow?null:{}}
   if(name==='rc_billing_test_status_v1')return {data:{tier:'free',subscriptionStatus:null,renewalAt:null,cancelAtPeriodEnd:false},error:null}
   if(name==='rc_checkout_reserve_v1'){
    state.attempt??={attemptId:a.p_attempt,expiresAt:Math.floor(Date.now()/1000)+3600}
    return {data:state.attempt,error:null}
   }
   if(name==='rc_billing_begin_v1'){
    if(state.customer?.stripe_customer_id!==a.p_customer)return {error:{}}
    return {data:state.receipts.has(a.p_event)?{status:'duplicate'}:{status:'ok',generation:String(++state.generation)},error:null}
   }
   if(name==='rc_billing_apply_v1'){
    if(state.failApply)return {error:{}}
    if(state.receipts.has(a.p_event))return {data:{status:'duplicate'},error:null}
    if(a.p_generation!==String(state.generation))return {data:{status:'stale'},error:null}
    state.snapshot=a.p_snapshot;state.receipts.add(a.p_event);return {data:{status:'applied'},error:null}
   }
   throw Error('unexpected RPC '+name)
  }
 }
 const stripeCustomer={id:C,livemode:false,metadata:{rutacap_user_id:U}}
 const fetchMock=async(input,options={})=>{
  const u=new URL(input);assert.equal(u.origin,'https://api.stripe.com')
  assert.equal(options.headers.Authorization,'Bearer sk_test_synthetic')
  state.requests.push({path:u.pathname,body:options.body,key:options.headers['Idempotency-Key']})
  let result
  if(u.pathname==='/v1/customers/search')result={has_more:false,data:[]}
  else if(u.pathname==='/v1/customers'||u.pathname==='/v1/customers/'+C)result=stripeCustomer
  else if(u.pathname==='/v1/subscriptions')result={has_more:false,data:state.subs}
  else if(u.pathname==='/v1/checkout/sessions')result={url:'https://checkout.stripe.com/c/pay/synthetic',customer:C,livemode:false,mode:'subscription',status:'open',expires_at:state.attempt.expiresAt}
  else if(u.pathname==='/v1/billing_portal/sessions')result={url:'https://billing.stripe.com/p/session/synthetic',customer:C,livemode:false}
  else throw Error('unexpected provider route')
  return {ok:true,json:async()=>result}
 }
 const source=readFileSync('supabase/functions/rutacap-billing/index.ts','utf8')
 const script=stripTypeScriptTypes(source
  .replace("import { createClient } from 'npm:@supabase/supabase-js@2.119.1'","const createClient=__createClient")
  .replace(/import \{([^}]+)\} from '\.\/protocol\.mjs'/,"const {$1}=__protocol"),{mode:'strip'})
 let handler
 vm.runInNewContext(script,{__createClient:()=>admin,__protocol:protocol,Deno:{env:{get:k=>env[k]},serve:f=>handler=f},
  fetch:fetchMock,crypto:webcrypto,TextEncoder,URL,URLSearchParams,Request,Response,AbortSignal,Date,console},{timeout:3000})
 const base=env.SUPABASE_URL+'/functions/v1/rutacap-billing'
 const call=(action,token='valid_test_jwt',extra={})=>handler(new Request(base,{method:'POST',
  headers:{Origin:'https://rutacap.es',Authorization:'Bearer '+token},body:JSON.stringify({action,...extra})}))
 const event=(name='evt_first',type='customer.subscription.updated',extra={})=>({id:name,type,livemode:false,data:{object:{customer:C,...extra}}})
 const webhook=(e,{valid=true,age=0,tamper=false}={})=>{
  const raw=JSON.stringify(e),t=Math.floor(Date.now()/1000)-age
  const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex')
  return handler(new Request(base+'/webhook',{method:'POST',headers:{'Stripe-Signature':'t='+t+',v1='+(valid?sig:'0'.repeat(64))},body:tamper?raw+' ':raw}))
 }
 const subscription=(status='active',end=1999999999,extra={})=>({id:'sub_synthetic',customer:C,livemode:false,status,cancel_at_period_end:false,
  items:{has_more:false,data:[{price:{id:P,livemode:false},quantity:1,current_period_end:end}]},...extra})
 return {state,call,webhook,event,subscription}
}
test('R95 no LIVE path, no unauthenticated or non-allowlisted Checkout',async()=>{
 const h=boot({STRIPE_SECRET_KEY:'sk_live_synthetic'})
 assert.equal((await h.call('checkout')).status,503);assert.equal(h.state.requests.length,0)
 const f=boot();assert.equal((await f.call('checkout','wrong')).status,401)
 f.state.allow=false;assert.equal((await f.call('checkout')).status,401);assert.equal(f.state.requests.length,0)
})
test('R95 Checkout uses persistent reservation, strict price, portal and status',async()=>{
 const h=boot();assert.equal((await h.call('checkout','valid_test_jwt',{price:'price_wrong'})).status,400)
 assert.equal((await h.call('checkout')).status,200);assert.equal((await h.call('checkout')).status,200)
 const posts=h.state.requests.filter(x=>x.path==='/v1/checkout/sessions')
 assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(posts[0].body,posts[1].body)
 assert.match(posts[0].body,/price_synthetic/)
 h.state.subs=[h.subscription()];assert.equal((await h.call('checkout')).status,409)
 assert.equal((await h.call('portal')).status,200)
 assert.equal((await (await h.call('status')).json()).mode,'test')
})
test('R95 real HMAC rejects invalid, expired, modified and LIVE webhook payloads',async()=>{
 const h=boot();await h.call('checkout');h.state.subs=[h.subscription()]
 const e=h.event()
 for(const options of [{valid:false},{age:301},{tamper:true}])assert.equal((await h.webhook(e,options)).status,400)
 assert.equal((await h.webhook({...e,livemode:true})).status,400)
 assert.equal(h.state.receipts.size,0)
 assert.equal((await h.webhook(e)).status,200);assert.equal(h.state.snapshot.status,'active')
 assert.equal((await h.webhook(e)).status,200);assert.equal(h.state.receipts.size,1)
})
test('R95 failed write retried, renewal, scheduled cancellation, failure and cancellation',async()=>{
 const h=boot();await h.call('checkout');h.state.subs=[h.subscription()]
 h.state.failApply=true;assert.equal((await h.webhook(h.event())).status,500);assert.equal(h.state.receipts.size,0)
 h.state.failApply=false;assert.equal((await h.webhook(h.event())).status,200)
 h.state.subs=[h.subscription('active',2000000000,{cancel_at_period_end:true})]
 assert.equal((await h.webhook(h.event('evt_renew','invoice.paid',{subscription:'sub_synthetic'}))).status,200)
 assert.equal(h.state.snapshot.cancelAtPeriodEnd,true)
 h.state.subs=[h.subscription('past_due')];assert.equal((await h.webhook(h.event('evt_failed','invoice.payment_failed',{subscription:'sub_synthetic'}))).status,200)
 assert.equal(h.state.snapshot.status,'past_due')
 h.state.subs=[];assert.equal((await h.webhook(h.event('evt_cancel','customer.subscription.deleted'))).status,200)
 assert.equal(h.state.snapshot.empty,true)
})
