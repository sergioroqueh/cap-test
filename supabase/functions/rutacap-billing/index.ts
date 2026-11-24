// R95: TEST only. No LIVE code path. Deploy only with separate approval.
import { createClient } from 'npm:@supabase/supabase-js@2.119.1'
import {stripeTestReady,validStripeUrl,reconcileEvent,readSubscriptions,checkoutParams} from './protocol.mjs'
const ORIGIN = 'https://rutacap.es'
const env=(key:string)=>Deno.env.get(key)||''
const stripeKey=env('STRIPE_SECRET_KEY')
const stripePrice=env('STRIPE_PRICE_ID')
const supaUrl=env('SUPABASE_URL')
const serviceKey=env('SUPABASE_SERVICE_ROLE_KEY')
const admin=supaUrl==='https://rhtbqetskghkarxhrgee.supabase.co'&&serviceKey?createClient(supaUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null
function ready(){
 return !!admin&&stripeTestReady({key:stripeKey,approved:env('RUTACAP_TEST_BILLING'),project:supaUrl,secret:env('STRIPE_WEBHOOK_SECRET'),price:stripePrice})
}
function reply(body:Record<string,unknown>,status=200,origin=''){
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}})
}
async function stripeApi(path:string,params?:URLSearchParams,key?:string):Promise<any>{
 if(!ready())throw Error('TEST_DISABLED')
 const response=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{
  Authorization:'Bearer '+stripeKey,'Stripe-Version':'2025-03-31.basil',
  ...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})
 },...(params?{body:params.toString()}:{}),redirect:'error',signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw Error('STRIPE_UNAVAILABLE')
 return response.json()
}
async function rpc(name:string,args:Record<string,unknown>){
 if(!admin)throw Error('DB_DISABLED')
 const {data,error}=await admin.rpc(name,args)
 if(error)throw Error('BILLING_RPC_FAILED')
 return data
}
const read=(customer:string)=>stripeApi('/subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100')
async function verifyStripeSignature(raw:string, header:string):Promise<boolean>{
 const timestamp=header.split(',').find(p=>p.startsWith('t='))?.slice(2) || ''
 const signatures=header.split(',').filter(p=>p.startsWith('v1=')).map(p=>p.slice(3))
 if(!/^\d{10}$/.test(timestamp)||!signatures.length)return false
 if(Math.abs(Date.now()/1000-Number(timestamp))>300)return false
 const secret=env('STRIPE_WEBHOOK_SECRET')
 if(!secret)return false
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign'])
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw))
 const expected=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
 return signatures.some(sig=>{
  if(!/^[a-f0-9]{64}$/i.test(sig))return false
  let difference=0
  for(let i=0;i<expected.length;i++)difference |= expected.charCodeAt(i)^sig.toLowerCase().charCodeAt(i)
  return difference===0
 })
}

async function webhook(req:Request){
 if(req.method!=='POST')return reply({error:'Método no admitido'},405)
 if(!ready())return reply({error:'TEST no habilitado'},503)
 const raw=await req.text()
 if(new TextEncoder().encode(raw).length>200000)return reply({error:'Payload demasiado grande'},413)
 if(!await verifyStripeSignature(raw,req.headers.get('Stripe-Signature')||''))return reply({error:'Firma inválida'},400)
 let event:any
 try{event=JSON.parse(raw)}catch{return reply({error:'JSON inválido'},400)}
 if(!event||!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||event.livemode!==false)return reply({error:'Evento inválido'},400)
 try{
  await reconcileEvent(event,{price:stripePrice,begin:(args:Record<string,unknown>)=>rpc('rc_billing_begin_v1',args),read,
    apply:(args:Record<string,unknown>)=>rpc('rc_billing_apply_v1',args)})
  return reply({received:true})
 }catch{return reply({error:'No se pudo reconciliar; reintentar'},500)}
}
async function authorizedUser(req:Request){
 if(!admin)return null
 const token=(req.headers.get('Authorization')||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
 if(!token)return null
 const {data,error}=await admin.auth.getUser(token)
 if(error||!data.user||data.user.is_anonymous!==false||!data.user.email_confirmed_at||!data.user.email)return null
 // Verify current server-side session through service-only RPC, not user_metadata.
 const claims=await admin.auth.getClaims(token)
 const c=claims.data?.claims
 if(claims.error||!c||c.sub!==data.user.id||c.iss!==supaUrl+'/auth/v1'||c.role!=='authenticated'||c.is_anonymous!==false||typeof c.session_id!=='string'||typeof c.exp!=='number'||c.exp<=Date.now()/1000)return null
 try{await rpc('rc_billing_test_authorize_v1',{p_user:data.user.id,p_price:stripePrice,p_session:c.session_id})}catch{return null}
 return data.user
}
async function customerForUser(user:{id:string;email?:string|null}):Promise<string>{
 if(!admin)throw Error('DB_DISABLED')
 const {data:existing,error}=await admin.from('rc_billing_customers').select('stripe_customer_id,stripe_livemode').eq('user_id',user.id).maybeSingle()
 if(error)throw Error('CUSTOMER_LOOKUP_FAILED')
 if(existing){
  if(existing.stripe_livemode!==false)throw Error('CUSTOMER_MODE_UNKNOWN')
  const customer=await stripeApi('/customers/'+encodeURIComponent(existing.stripe_customer_id))
  if(customer.id!==existing.stripe_customer_id||customer.livemode!==false||customer.deleted||customer.metadata?.rutacap_user_id!==user.id)throw Error('CUSTOMER_INVALID')
  return existing.stripe_customer_id
 }
 // Stable payload (no changing email parameter) and idempotency key. Reconcile
 // by metadata search before creating after Stripe's 24-hour idempotency window.
 const found=await stripeApi('/customers/search?query='+encodeURIComponent("metadata['rutacap_user_id']:'"+user.id+"'")+'&limit=100')
 if(found.has_more!==false||!Array.isArray(found.data)||found.data.length>1)throw Error('CUSTOMER_AMBIGUOUS')
 const customer=found.data[0]??await stripeApi('/customers',new URLSearchParams({'metadata[rutacap_user_id]':user.id}),'rutacap-test-customer-v1-'+user.id)
 if(!/^cus_[A-Za-z0-9]+$/.test(customer?.id||'')||customer.livemode!==false||customer.deleted||customer.metadata?.rutacap_user_id!==user.id)throw Error('CUSTOMER_INVALID')
 const {error:saveError}=await admin.from('rc_billing_customers').insert({user_id:user.id,stripe_customer_id:customer.id,stripe_livemode:false})
 if(saveError){
  const {data:again,error:againError}=await admin.from('rc_billing_customers').select('stripe_customer_id,stripe_livemode').eq('user_id',user.id).maybeSingle()
  if(againError||again?.stripe_customer_id!==customer.id||again.stripe_livemode!==false)throw Error('CUSTOMER_LINK_FAILED')
 }
 return customer.id
}
Deno.serve(async(req)=>{
 const path=new URL(req.url).pathname
 if(path==='/rutacap-billing/webhook'||path==='/functions/v1/rutacap-billing/webhook')return webhook(req)
 if(path!=='/rutacap-billing'&&path!=='/functions/v1/rutacap-billing')return reply({error:'Ruta no admitida'},404)
 const origin=req.headers.get('Origin')||''
 if(origin!==ORIGIN)return reply({error:'Origen no permitido'},403)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Vary':'Origin'}})
 if(req.method!=='POST')return reply({error:'Método no admitido'},405,origin)
 if(!ready())return reply({error:'Stripe TEST no habilitado'},503,origin)
 const user=await authorizedUser(req)
 if(!user)return reply({error:'Acceso TEST no autorizado'},401,origin)
 let body:any
 try{const raw=await req.text();if(raw.length>1000)throw Error();body=JSON.parse(raw)}catch{return reply({error:'Solicitud inválida'},400,origin)}
 if(!body||Object.keys(body).length!==1||!['checkout','portal','status'].includes(body.action))return reply({error:'Acción inválida'},400,origin)
 try{
  if(body.action==='status'){
   const data=await rpc('rc_billing_test_status_v1',{p_user:user.id,p_price:stripePrice})
   return reply({mode:'test',...data},200,origin)
  }
  const customer=await customerForUser(user)
  if(body.action==='portal'){
   const portal=await stripeApi('/billing_portal/sessions',new URLSearchParams({customer,return_url:ORIGIN+'/#/settings'}))
   if(!validStripeUrl(portal.url,'billing.stripe.com')||portal.livemode!==false||portal.customer!==customer)throw Error('PORTAL_INVALID')
   return reply({mode:'test',url:portal.url},200,origin)
  }
  // Current Stripe state, not a stale local receipt or browser claim.
  if(readSubscriptions(await read(customer),customer,stripePrice).blocked)return reply({error:'Ya hay una suscripción; utiliza el portal.'},409,origin)
  const attempt=await rpc('rc_checkout_reserve_v1',{p_user:user.id,p_price:stripePrice,p_attempt:crypto.randomUUID()})
  // Recheck after reservation to avoid a recently completed checkout.
  if(readSubscriptions(await read(customer),customer,stripePrice).blocked)return reply({error:'Ya hay una suscripción; utiliza el portal.'},409,origin)
  const {key,params}=checkoutParams({customer,userId:user.id,price:stripePrice,attempt,origin:ORIGIN})
  const checkout=await stripeApi('/checkout/sessions',new URLSearchParams(params),key)
  if(!validStripeUrl(checkout.url,'checkout.stripe.com')||checkout.livemode!==false||checkout.customer!==customer||checkout.mode!=='subscription'||checkout.status!=='open'||checkout.expires_at!==attempt.expiresAt)throw Error('CHECKOUT_INVALID')
  return reply({mode:'test',url:checkout.url},200,origin)
 }catch{return reply({error:'No se pudo iniciar o consultar Stripe TEST'},502,origin)}
})
