import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac, webcrypto } from 'node:crypto'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

// Entirely synthetic; DOES NOT contact Supabase, Stripe, or any real account.
function bootSyntheticBilling() {
  const source = readFileSync('supabase/functions/rutacap-billing/index.ts', 'utf8')
  // TypeScript 7 no longer exports the old JS ScriptTarget/ModuleKind API.
  // This synthetic fixture uses only erasable type syntax; Node 22 can strip
  // those types without fetching packages, issuing requests or invoking Deno.
  const externalImport = "import { createClient } from 'npm:@supabase/supabase-js@2.119.1'"
  assert.ok(source.includes(externalImport), 'Pinned Supabase client import changed unexpectedly')
  const script = stripTypeScriptTypes(
    source.replace(externalImport, 'const { createClient } = __testSupabase'),
    { mode: 'strip' }
  )
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_synthetic_not_a_real_key',
    STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_not_a_real_secret',
    STRIPE_PRICE_ID: 'price_rutacapA1',
    SUPABASE_URL: 'https://rhtbqetskghkarxhrgee.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_synthetic',
    RUTACAP_LIVE_BILLING: ''
  }
  const db = { rc_billing_customers: [], rc_billing_subscriptions: [], rc_billing_events: [] }
  const stripeRequests = []
  const visibleSubscriptions = new Set()
  const stripeSubscriptions = {
    sub_goodA1: {
      id:'sub_goodA1', customer:'cus_synthA1', status:'active',
      cancel_at_period_end:false,
      items:{data:[{price:{id:'price_rutacapA1'},current_period_end:1999999999}]}
    },
    sub_wrongA1: {
      id:'sub_wrongA1', customer:'cus_synthA1', status:'active',
      cancel_at_period_end:false,
      items:{data:[{price:{id:'price_otherA1'},current_period_end:1999999999}]}
    }
  }
  const admin = {
    auth: { getUser: async token => token==='valid_test_jwt' ?
      { data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid',is_anonymous:false}},error:null } :
      { data:{user:null},error:{message:'invalid jwt'} } },
    from(name) {
      assert.ok(Object.hasOwn(db,name),'Unexpected database: '+name)
      const query = {
        field: null, value: null,
        select() { return this },
        eq(field,value) { this.field=field;this.value=value;return this },
        async maybeSingle() {
          const row=db[name].find(x=>x[this.field]===this.value)
          return {data:row||null,error:null}
        },
        async single() {
          const row=db[name].find(x=>x[this.field]===this.value)
          return {data:row||null,error:row?null:{code:'PGRST116'}}
        },
        async insert(item) {
          if(name==='rc_billing_events' && db[name].some(x=>x.stripe_event_id===item.stripe_event_id))
            return {error:{code:'23505'}}
          db[name].push({...item})
          return {error:null}
        },
        async upsert(item,{onConflict}={}) {
          const index=db[name].findIndex(x=>x[onConflict]===item[onConflict])
          if(index<0)db[name].push({...item})
          else db[name][index]={...item}
          return {error:null}
        }
      }
      return query
    }
  }
  const fetchMock = async (input,options={}) => {
    const u=new URL(input)
    assert.equal(u.origin,'https://api.stripe.com')
    stripeRequests.push({path:u.pathname,query:u.search,options})
    if(u.pathname==='/v1/customers')return {ok:true,json:async()=>({id:'cus_synthA1'})}
    if(u.pathname==='/v1/checkout/sessions')
      return {ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/synthetic'})}
    if(u.pathname==='/v1/billing_portal/sessions')
      return {ok:true,json:async()=>({url:'https://billing.stripe.com/p/session/synthetic'})}
    if(u.pathname==='/v1/subscriptions')
      return {ok:true,json:async()=>({data:Object.values(stripeSubscriptions).filter(s=>visibleSubscriptions.has(s.id) && s.customer===u.searchParams.get('customer'))})}
    const id=u.pathname.split('/').pop()
    if(u.pathname.startsWith('/v1/subscriptions/') && stripeSubscriptions[id])
      return {ok:true,json:async()=>stripeSubscriptions[id]}
    return {ok:false,status:404,json:async()=>({error:'not found'})}
  }
  let handler
  const sandbox = {
    __testSupabase: {createClient:()=>admin},
    Deno:{env:{get:k=>env[k]||''},serve:fn=>{handler=fn}},
    fetch:fetchMock, crypto:webcrypto, TextEncoder, URL, URLSearchParams, Request, Response,
    Date, console
  }
  vm.runInNewContext(script,sandbox,{timeout:3000})
  assert.equal(typeof handler,'function')
  const base='https://rhtbqetskghkarxhrgee.supabase.co/functions/v1/rutacap-billing'
  const call=(body,authorization='Bearer valid_test_jwt')=>handler(new Request(base,{
    method:'POST',headers:{Origin:'https://rutacap.es',Authorization:authorization,
      'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }))
  const webhook=(event,valid=true)=>{
    const raw=JSON.stringify(event)
    const timestamp=Math.floor(Date.now()/1000)
    const signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET)
      .update(timestamp+'.'+raw).digest('hex')
    return handler(new Request(base+'/webhook',{
      method:'POST',headers:{'Stripe-Signature':
        't='+timestamp+',v1='+(valid?signature:'0'.repeat(64))},
      body:raw
    }))
  }
  return { db, stripeRequests, stripeSubscriptions, visibleSubscriptions, call, webhook }
}

test('R84 server enforces authenticated Checkout, verified Stripe price and signed webhook',async()=>{
 const h=bootSyntheticBilling()
 const denied=await h.call({action:'checkout'},'Bearer fake_jwt')
 assert.equal(denied.status,401)
 assert.equal(h.stripeRequests.length,0)

 const checkout=await h.call({action:'checkout'})
 assert.equal(checkout.status,200)
 assert.match((await checkout.json()).url,/^https:\/\/checkout\.stripe\.com\//)
 const checkoutPost=h.stripeRequests.find(x=>x.path==='/v1/checkout/sessions')
 assert.ok(checkoutPost)
 assert.match(checkoutPost.options.body,/line_items%5B0%5D%5Bprice%5D=price_rutacapA1/)
 assert.ok(checkoutPost.options.headers['Idempotency-Key'])

 const event={id:'evt_testGoodA1',livemode:false,type:'customer.subscription.created',
   data:{object:{id:'sub_goodA1'}}}
 const invalid=await h.webhook(event,false)
 assert.equal(invalid.status,400)
 assert.equal(h.db.rc_billing_subscriptions.length,0)

 h.visibleSubscriptions.add('sub_goodA1')
 const good=await h.webhook(event)
 assert.equal(good.status,200)
 assert.equal(h.db.rc_billing_subscriptions.length,1)
 assert.equal(h.db.rc_billing_subscriptions[0].status,'active')
 assert.equal(h.db.rc_billing_subscriptions[0].price_id,'price_rutacapA1')
 assert.equal(h.db.rc_billing_events.length,1)

 const repeat=await h.webhook(event)
 assert.equal(repeat.status,200)
 assert.equal(h.db.rc_billing_events.length,1)

 const unauthorizedPrice=await h.webhook({id:'evt_testWrongA1',livemode:false,
   type:'customer.subscription.created',data:{object:{id:'sub_wrongA1'}}})
 assert.equal(unauthorizedPrice.status,200)
 assert.equal(h.db.rc_billing_subscriptions.length,1)
 assert.equal(h.db.rc_billing_subscriptions[0].stripe_subscription_id,'sub_goodA1')

 const blockedDuplicate=await h.call({action:'checkout'})
 assert.equal(blockedDuplicate.status,409)

 h.stripeSubscriptions.sub_goodA1.items.data[0].current_period_end=2009999999
 const renewal=await h.webhook({id:'evt_testRenewA1',livemode:false,type:'invoice.paid',
   data:{object:{parent:{subscription_details:{subscription:'sub_goodA1'}}}}})
 assert.equal(renewal.status,200)
 assert.equal(h.db.rc_billing_subscriptions[0].current_period_end,
   new Date(2009999999*1000).toISOString())

 h.stripeSubscriptions.sub_goodA1.status='canceled'
 const cancelled=await h.webhook({id:'evt_testCancelA1',livemode:false,
   type:'customer.subscription.deleted',data:{object:{id:'sub_goodA1'}}})
 assert.equal(cancelled.status,200)
 assert.equal(h.db.rc_billing_subscriptions[0].status,'canceled')
});

test('R84 mode mismatch and unsigned events cannot change entitlements',async()=>{
 const h=bootSyntheticBilling()
 const modeMismatch=await h.webhook({id:'evt_testLiveA1',livemode:true,
   type:'customer.subscription.created',data:{object:{id:'sub_goodA1'}}})
 assert.equal(modeMismatch.status,400)
 assert.equal(h.db.rc_billing_subscriptions.length,0)
});
