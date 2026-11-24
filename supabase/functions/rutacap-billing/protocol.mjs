// R95 portable Stripe TEST protocol. All provider/DB calls injected.
const id=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9]+$').test(value)
const objectId=x=>typeof x==='string'?x:x?.id
const statuses=['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']
export const blockingStatus=s=>!['canceled','incomplete_expired'].includes(s)
export const allowedEventTypes=new Set(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','invoice.paid','invoice.payment_failed','invoice.payment_action_required'])
export function eventCustomer(event){
 if(!event||event.livemode!==false||!id(event.id,'evt')||typeof event.type!=='string'||event.type.length>150)throw Error('EVENT_INVALID')
 if(!allowedEventTypes.has(event.type))return null
 const obj=event.data?.object
 if(event.type.startsWith('checkout.')&&obj?.mode!=='subscription')return null
 if(event.type.startsWith('invoice.')&&!objectId(obj?.parent?.subscription_details?.subscription||obj?.subscription))return null
 const customer=objectId(obj?.customer)
 if(!id(customer,'cus')||(obj.livemode!==undefined&&obj.livemode!==false))throw Error('EVENT_CUSTOMER_INVALID')
 return customer
}
export function readSubscriptions(list,customer,price){
 if(!list||list.has_more!==false||!Array.isArray(list.data)||list.data.length>100)throw Error('SUBSCRIPTION_LIST_INCOMPLETE')
 const matching=[],seen=new Set()
 for(const s of list.data){
  if(!id(s?.id,'sub')||seen.has(s.id)||s.livemode!==false||objectId(s.customer)!==customer||
    !statuses.includes(s.status)||!s.items||s.items.has_more!==false||!Array.isArray(s.items.data)||!s.items.data.length)throw Error('SUBSCRIPTION_INVALID')
  seen.add(s.id)
  const match=s.items.data.filter(x=>x?.price?.id===price)
  if(!match.length)continue
  if(match.length!==1||s.items.data.length!==1||match[0].quantity!==1||match[0].price.livemode!==false)throw Error('SUBSCRIPTION_PRICE_AMBIGUOUS')
  const end=match[0].current_period_end??s.current_period_end
  const periodEnd=Number.isSafeInteger(end)&&end>0&&end<253402300800?new Date(end*1000).toISOString():null
  if(['active','trialing'].includes(s.status)&&!periodEnd)throw Error('SUBSCRIPTION_PERIOD_INVALID')
  matching.push({id:s.id,customer,priceId:price,livemode:false,
   status:s.pause_collection?'paused':s.status,periodEnd,cancelAtPeriodEnd:s.cancel_at_period_end===true})
 }
 const open=matching.filter(s=>blockingStatus(s.status))
 const entitled=open.filter(s=>['active','trialing'].includes(s.status))
 if(entitled.length>1)throw Error('DUPLICATE_ACTIVE_SUBSCRIPTIONS')
 // Prefer an existing valid subscription over unfinished replacement Checkout.
 const snapshot=entitled[0]??open[0]??null
 return {snapshot,blocked:open.length>0}
}
export async function reconcileEvent(event,{price,begin,read,apply}){
 const customer=eventCustomer(event)
 if(!customer)return {status:'ignored'}
 const lease=await begin({p_customer:customer,p_price:price,p_event:event.id})
 if(lease?.status==='duplicate')return lease
 if(lease?.status!=='ok'||typeof lease.generation!=='string'||!/^[1-9][0-9]{0,18}$/.test(lease.generation))throw Error('BILLING_FENCE_INVALID')
 const {snapshot}=readSubscriptions(await read(customer),customer,price)
 const result=await apply({p_customer:customer,p_price:price,p_event:event.id,p_type:event.type,
  p_generation:lease.generation,p_snapshot:snapshot??{empty:true}})
 if(!['applied','duplicate'].includes(result?.status))throw Error('BILLING_RETRY')
 return result
}
export function checkoutParams({customer,userId,price,attempt,origin}){
 if(!id(customer,'cus')||!id(price,'price')||!attempt||
   !/^[0-9a-f-]{36}$/.test(attempt.attemptId||'')||
   !Number.isSafeInteger(attempt.expiresAt)||attempt.expiresAt<=0)throw Error('CHECKOUT_RESERVATION_INVALID')
 return {key:'rutacap-test-checkout-v1-'+attempt.attemptId,params:{
  mode:'subscription',customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',
  'payment_method_types[0]':'card','subscription_data[metadata][rutacap_user_id]':userId,
  client_reference_id:userId,expires_at:String(attempt.expiresAt),
  success_url:origin+'/#/settings?checkout=success',cancel_url:origin+'/#/settings?checkout=cancel'
 }}
}
export function stripeTestReady({key,approved,project,secret,price}){
 return approved==='approved'&&typeof key==='string'&&key.startsWith('sk_test_')&&
 project==='https://rhtbqetskghkarxhrgee.supabase.co'&&typeof secret==='string'&&secret.startsWith('whsec_')&&id(price,'price')
}
export function validStripeUrl(value,host){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===host&&!u.port&&!u.username&&!u.password&&u.pathname.length>1}catch{return false}
}
