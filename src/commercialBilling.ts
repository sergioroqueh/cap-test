import { authConfigured, getSession, supabase } from './supabase'

export type CommercialTier = 'guest' | 'free' | 'premium'
export type BillingState = { tier: CommercialTier; subscriptionStatus: string | null; renewalAt: string | null }

// Client tiers are for presentation only; entitlement decisions belong on the server.
// A build variable alone never unlocks premium source data.
export const billingEnabled = authConfigured &&
  (import.meta.env.VITE_CAP_LAUNCH === 'true' || import.meta.env.DEV) &&
  import.meta.env.VITE_RUTACAP_BILLING_ENABLED === 'true'

export async function readBillingState(): Promise<BillingState> {
  if (!authConfigured || !supabase) return { tier:'guest', subscriptionStatus:null, renewalAt:null }
  const session = await getSession()
  if (!session) return { tier:'guest', subscriptionStatus:null, renewalAt:null }
  if (!billingEnabled) return { tier:'free', subscriptionStatus:null, renewalAt:null }
  const { data, error } = await supabase.from('rc_billing_subscriptions')
    .select('status,current_period_end').eq('user_id', session.user.id).maybeSingle()
  if (error) throw error
  const status = typeof data?.status === 'string' ? data.status : null
  const renewalAt = typeof data?.current_period_end === 'string' ? data.current_period_end : null
  const active = (status === 'active' || status === 'trialing') &&
    renewalAt !== null && Number.isFinite(Date.parse(renewalAt)) &&
    Date.parse(renewalAt) > Date.now()
  return {tier:active?'premium':'free',subscriptionStatus:status,renewalAt}
}

export async function openStripeFlow(action: 'checkout' | 'portal'): Promise<void> {
  if (!billingEnabled || !supabase) throw Error('Los pagos todavía no están habilitados.')
  if (!(await getSession())) throw Error('Necesitas iniciar sesión para gestionar una suscripción.')
  const { data, error } = await supabase.functions.invoke('rutacap-billing', {body:{action}})
  if (error) throw Error('No se pudo contactar con el servicio seguro de pagos.')
  const url = data && typeof data.url === 'string' ? data.url : ''
  // Never follow arbitrary URLs returned to the browser, even on a failed API path.
  if (!/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url))
    throw Error('El servidor no devolvió una dirección de Stripe válida.')
  window.location.assign(url)
}
