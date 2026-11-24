import { useEffect, useState } from 'react'
import { billingEnabled, openStripeFlow, readBillingState, type BillingState } from './commercialBilling'

export function CommercialBillingPanel({signedIn}:{signedIn:boolean}){
 const [state,setState]=useState<BillingState>({tier:signedIn?'free':'guest',subscriptionStatus:null,renewalAt:null})
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 useEffect(()=>{
  if(!signedIn){setState({tier:'guest',subscriptionStatus:null,renewalAt:null});return}
  let live=true
  void readBillingState().then(value=>{if(live)setState(value)}).catch(()=>{if(live)setError('No se pudo consultar la suscripción.')})
  return()=>{live=false}
 },[signedIn])
 async function go(action:'checkout'|'portal'){
  if(busy)return
  setBusy(true);setError('')
  try{await openStripeFlow(action)}
  catch(e){setError(e instanceof Error?e.message:'No se pudo abrir Stripe.')}
  finally{setBusy(false)}
 }
 const premium=state.tier==='premium'
 const managed=['active','trialing','past_due','unpaid','paused','incomplete'].includes(state.subscriptionStatus||'')
 return <div className="panel account" aria-label="Plan de acceso">
  <small>PLAN DE RUTACAP</small><h2>{premium?'Premium · TEST':signedIn?'Cuenta gratuita':'Invitado'}</h2>
  <p>{premium?'Acceso Premium de prueba confirmado por el servidor. No es una suscripción comercial real.':
     signedIn?'Tu plan actual es gratuito. RutaCAP está en fase beta; el pago Premium solo aparecerá cuando esté habilitado de forma segura.':
     'Estás practicando como invitado. El progreso se conserva en este navegador.'}</p>
  {premium&&state.renewalAt&&<p>{state.cancelAtPeriodEnd?'Cancelación programada. Acceso hasta:':'Periodo registrado hasta:'} {new Date(state.renewalAt).toLocaleDateString('es-ES')}</p>}
  {state.subscriptionStatus==='past_due'&&<p role="alert">Hay un problema de pago pendiente. Puedes gestionar tu suscripción en Stripe.</p>}
  {signedIn&&billingEnabled&&<button type="button" className="btn light" disabled={busy}
    onClick={()=>void go(managed?'portal':'checkout')}>
    {busy?'Conectando…':premium||state.subscriptionStatus==='past_due'?'Gestionar suscripción':'Probar Premium en Stripe (TEST)'}
  </button>}
  {billingEnabled&&signedIn&&<small>Modo de prueba · no usar una tarjeta real.</small>}
  {!billingEnabled&&signedIn&&<small>Sin cobros habilitados durante esta etapa.</small>}
  {error&&<p role="alert">{error}</p>}
 </div>
}
