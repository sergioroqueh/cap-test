// RutaCAP R82: Stripe Checkout/Billing + webhook. No real payments until
// secrets, price, consumer terms, rights and RUTACAP_LIVE_BILLING=approved.
import { createClient } from 'npm:@supabase/supabase-js@2.119.1'

const ORIGIN = 'https://rutacap.es'
const env = (key: string) => Deno.env.get(key) || ''
const stripeKey = env('STRIPE_SECRET_KEY')
const supaUrl = env('SUPABASE_URL')
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
const stripePrice = env('STRIPE_PRICE_ID')
const isLive = stripeKey.startsWith('sk_live_')
const liveApproved = env('RUTACAP_LIVE_BILLING') === 'approved'
const admin = supaUrl && serviceKey ? createClient(supaUrl, serviceKey, {
 auth:{persistSession:false,autoRefreshToken:false}
}) : null

function reply(body: Record<string, unknown>, status=200, origin='') {
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'Vary':'Origin',
  ...(origin ? {'Access-Control-Allow-Origin':origin} : {})
 }})
}
function originAllowed(origin: string): boolean {
 return origin === ORIGIN || (stripeKey.startsWith('sk_test_') &&
   env('RUTACAP_TEST_ORIGIN') === 'http://localhost:5173' &&
   origin === 'http://localhost:5173')
}
function ready(): boolean {
 return !!admin && /^(sk_test_|sk_live_)/.test(stripeKey) &&
  (!isLive || liveApproved)
}
async function stripeApi(path: string, params?: URLSearchParams, idempotency?: string): Promise<any> {
 if(!ready())throw Error('Stripe no configurado o no aprobado')
 const response=await fetch('https://api.stripe.com/v1'+path,{
  method:params?'POST':'GET',
  headers:{
   'Authorization':'Bearer '+stripeKey,
   ...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
   ...(idempotency?{'Idempotency-Key':idempotency}:{})
  },
  ...(params?{body:params.toString()}:{})
 })
 if(!response.ok)throw Error('Stripe API devolvió '+response.status)
 return await response.json()
}
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
async function synchronizeSubscription(subscriptionId: string){
 if(!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)||!admin)throw Error('Suscripción inválida')
 const subscription=await stripeApi('/subscriptions/'+encodeURIComponent(subscriptionId))
 const customerId=typeof subscription.customer==='string'?
   subscription.customer:subscription.customer?.id
 if(!/^cus_[A-Za-z0-9]+$/.test(customerId||''))throw Error('Cliente Stripe inválido')
 const {data:linked,error:linkError}=await admin.from('rc_billing_customers')
   .select('user_id').eq('stripe_customer_id',customerId).single()
 if(linkError||!linked)throw Error('Cliente sin vinculación verificada')
 const status=subscription.status
 const allowed=['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']
 if(!allowed.includes(status))throw Error('Estado de suscripción desconocido')
 const period=subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end
 const periodEnd=Number.isSafeInteger(period)&&period>0?new Date(period*1000).toISOString():null
 const price=subscription.items?.data?.[0]?.price?.id || ''
 if(!/^price_[A-Za-z0-9]+$/.test(price))throw Error('Precio de suscripción no válido')
 const {data:previous,error:prevError}=await admin.from('rc_billing_subscriptions')
   .select('stripe_subscription_id,status').eq('user_id',linked.user_id).maybeSingle()
 if(prevError)throw Error('No se pudo leer suscripción')
 // Ignore late cancellation from an older subscription after a replacement.
 if(previous?.stripe_subscription_id!==subscriptionId && previous &&
   ['canceled','incomplete_expired'].includes(status))return
 const {error}=await admin.from('rc_billing_subscriptions').upsert({
  user_id:linked.user_id,stripe_customer_id:customerId,
  stripe_subscription_id:subscriptionId,status,price_id:price,
  current_period_end:periodEnd,
  cancel_at_period_end:subscription.cancel_at_period_end===true,
  updated_at:new Date().toISOString()
 },{onConflict:'user_id'})
 if(error)throw Error('No se pudo actualizar estado de pago')
}
async function webhook(req:Request){
 if(req.method!=='POST'||!ready())return reply({error:'No disponible'},503)
 const raw=await req.text()
 if(raw.length>200000)return reply({error:'Payload demasiado grande'},413)
 if(!await verifyStripeSignature(raw,req.headers.get('Stripe-Signature')||''))return reply({error:'Firma inválida'},400)
 let event:any
 try{event=JSON.parse(raw)}catch{return reply({error:'JSON inválido'},400)}
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id||'') ||
    event.livemode!==isLive)return reply({error:'Evento inválido'},400)
 if(!admin)return reply({error:'Servicio no disponible'},503)
 const {data:already,error:readError}=await admin.from('rc_billing_events')
   .select('stripe_event_id').eq('stripe_event_id',event.id).maybeSingle()
 if(readError)return reply({error:'No se pudo consultar idempotencia'},500)
 if(already)return reply({received:true})
 try{
  let subscriptionId=''
  if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
   subscriptionId=event.data?.object?.id || ''
  }else if(event.type==='checkout.session.completed' && event.data?.object?.mode==='subscription'){
   subscriptionId=event.data?.object?.subscription || ''
  }
  if(subscriptionId)await synchronizeSubscription(subscriptionId)
  const {error}=await admin.from('rc_billing_events').insert({
   stripe_event_id:event.id,event_type:String(event.type||'unknown').slice(0,150),
   livemode:event.livemode===true
  })
  if(error && error.code!=='23505')throw Error('Fallo al guardar recibo de evento')
  return reply({received:true})
 }catch{return reply({error:'No se pudo procesar el evento; Stripe debe reintentar'},500)}
}
async function authorizedUser(req:Request){
 if(!admin)return null
 const authorization=req.headers.get('Authorization')||''
 const token=authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
 if(!token)return null
 const {data,error}=await admin.auth.getUser(token)
 if(error||!data.user||data.user.is_anonymous||!data.user.email)return null
 return data.user
}
async function customerForUser(user:{id:string;email?:string|null}):Promise<string>{
 if(!admin)throw Error('Servicio no configurado')
 const {data:existing,error}=await admin.from('rc_billing_customers')
  .select('stripe_customer_id').eq('user_id',user.id).maybeSingle()
 if(error)throw Error('No se pudo consultar cliente')
 if(existing)return existing.stripe_customer_id
 const params=new URLSearchParams({'metadata[rutacap_user_id]':user.id})
 if(user.email)params.set('email',user.email)
 const created=await stripeApi('/customers',params,'rutacap-customer-v1-'+user.id)
 if(!/^cus_[A-Za-z0-9]+$/.test(created.id||''))throw Error('Cliente Stripe inválido')
 const {error:saveError}=await admin.from('rc_billing_customers')
   .insert({user_id:user.id,stripe_customer_id:created.id})
 if(saveError){
  const {data:again}=await admin.from('rc_billing_customers')
   .select('stripe_customer_id').eq('user_id',user.id).maybeSingle()
  if(again)return again.stripe_customer_id
  throw Error('No se pudo vincular el cliente')
 }
 return created.id
}
Deno.serve(async(req)=>{
 const url=new URL(req.url)
 if(url.pathname.endsWith('/webhook'))return webhook(req)
 const origin=req.headers.get('Origin')||''
 if(!originAllowed(origin))return reply({error:'Origen no permitido'},403)
 if(req.method==='OPTIONS'){
  return new Response(null,{status:204,headers:{
   'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
   'Access-Control-Max-Age':'600','Vary':'Origin'
  }})
 }
 if(req.method!=='POST')return reply({error:'Método no admitido'},405,origin)
 if(!ready())return reply({error:'Pagos no habilitados'},503,origin)
 const user=await authorizedUser(req)
 if(!user)return reply({error:'Sesión no válida'},401,origin)
 let body:any
 try{body=await req.json()}catch{return reply({error:'Solicitud inválida'},400,origin)}
 if(!body||!['checkout','portal'].includes(body.action))return reply({error:'Acción inválida'},400,origin)
 try{
  const customer=await customerForUser(user)
  if(body.action==='portal'){
   const portal=await stripeApi('/billing_portal/sessions',
    new URLSearchParams({customer,return_url:ORIGIN+'/#/settings'}))
   if(typeof portal.url!=='string'||!portal.url.startsWith('https://billing.stripe.com/'))
    throw Error('Portal no válido')
   return reply({url:portal.url},200,origin)
  }
  if(!/^price_[A-Za-z0-9]+$/.test(stripePrice))return reply({error:'Precio no configurado'},503,origin)
  if(!admin)throw Error('Configuración no disponible')
  const {data:active,error:activeError}=await admin.from('rc_billing_subscriptions')
   .select('status').eq('user_id',user.id).maybeSingle()
  if(activeError)throw Error('No se pudo consultar el plan')
  if(active && ['active','trialing'].includes(active.status))
   return reply({error:'Ya tienes una suscripción activa; usa el portal de clientes'},409,origin)
  const checkout=await stripeApi('/checkout/sessions',new URLSearchParams({
   mode:'subscription',customer,
   'line_items[0][price]':stripePrice,'line_items[0][quantity]':'1',
   'subscription_data[metadata][rutacap_user_id]':user.id,
   client_reference_id:user.id,
   success_url:ORIGIN+'/#/settings?checkout=success',
   cancel_url:ORIGIN+'/#/settings?checkout=cancel',
   allow_promotion_codes:'true'
  }))
  if(typeof checkout.url!=='string'||!checkout.url.startsWith('https://checkout.stripe.com/'))
   throw Error('Checkout no válido')
  return reply({url:checkout.url},200,origin)
 }catch{return reply({error:'No se pudo iniciar el servicio de Stripe'},502,origin)}
})
