import { authConfigured, getSession, supabase } from './supabase'

export type CommercialTier = 'guest' | 'free' | 'premium'
export type BillingState = { tier: CommercialTier; subscriptionStatus: string | null; renewalAt: string | null; cancelAtPeriodEnd?: boolean; mode?: 'test' }

// Client tiers are for presentation only; entitlement decisions belong on the server.
// A build variable alone never unlocks premium source data.
export const billingEnabled = authConfigured &&
  (import.meta.env.VITE_CAP_LAUNCH === 'true' || import.meta.env.DEV) &&
  import.meta.env.VITE_RUTACAP_BILLING_ENABLED === 'true' &&
  import.meta.env.VITE_RUTACAP_TEST_BILLING === 'true'

export async function readBillingState(): Promise<BillingState> {
  if (!authConfigured || !supabase) return { tier:'guest', subscriptionStatus:null, renewalAt:null }
  const session = await getSession()
  if (!session) return { tier:'guest', subscriptionStatus:null, renewalAt:null }
  if (!billingEnabled) return { tier:'free', subscriptionStatus:null, renewalAt:null }
  const {data,error}=await supabase.functions.invoke('rutacap-billing',{body:{action:'status'}})
  if(error||data?.mode!=='test'||!['free','premium'].includes(data.tier))throw Error('No se pudo verificar la suscripción TEST.')
  const status=typeof data.subscriptionStatus==='string'?data.subscriptionStatus:null
  const renewalAt=typeof data.renewalAt==='string'?data.renewalAt:null
  const active=data.tier==='premium'&&(status === 'active' || status === 'trialing')&&
    renewalAt!==null&&Number.isFinite(Date.parse(renewalAt))&&Date.parse(renewalAt) > Date.now()
  return {tier:active?'premium':'free',subscriptionStatus:status,renewalAt,cancelAtPeriodEnd:data.cancelAtPeriodEnd===true,mode:'test'}
}

export async function openStripeFlow(action: 'checkout' | 'portal'): Promise<void> {
  if (!billingEnabled || !supabase) throw Error('Los pagos todavía no están habilitados.')
  if (!(await getSession())) throw Error('Necesitas iniciar sesión para gestionar una suscripción.')
  const { data, error } = await supabase.functions.invoke('rutacap-billing', {body:{action}})
  if (error || data?.mode!=='test') throw Error('No se pudo contactar con el servicio seguro de pagos.')
  const url = data && typeof data.url === 'string' ? data.url : ''
  // Never follow arbitrary URLs returned to the browser, even on a failed API path.
  if (!(action==='checkout'?/^https:\/\/checkout\.stripe\.com\//:/^https:\/\/billing\.stripe\.com\//).test(url))
    throw Error('El servidor no devolvió una dirección de Stripe válida.')
  window.location.assign(url)
}
