import { useState } from 'react'
import { ProBrand } from './CommercialHome'

type Props={
 email:string
 onCreate:(password:string)=>Promise<void>
 onExisting:()=>Promise<void>
 onLogout:()=>Promise<void>
}

// Completing registration happens immediately after the first OTP verification,
// not hidden in Settings. The marker is only UX state; authentication is still
// verified by Supabase, never by the presence of this screen.
export function CommercialPasswordOnboarding({email,onCreate,onExisting,onLogout}:Props){
 const [password,setPassword]=useState('')
 const [confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 async function run(action:()=>Promise<void>){
  if(busy)return
  setBusy(true);setError('')
  try{await action()}
  catch(e){
   const detail=import.meta.env.DEV&&e instanceof Error?e.message:null
   setError(detail??'No se pudo completar el registro. Inténtalo otra vez.')
  }finally{setBusy(false)}
 }
 async function submit(){
  if(password.length<8||password.length>128){setError('La contraseña debe tener entre 8 y 128 caracteres.');return}
  if(password!==confirm){setError('Las contraseñas no coinciden.');return}
  await run(()=>onCreate(password))
 }
 return <section className="pro-account-preview" aria-label="Finalizar registro RutaCAP">
  <div className="pro-account-intro">
   <ProBrand/>
   <span className="pro-account-tag">CORREO VERIFICADO · ÚLTIMO PASO</span>
   <h2>Crea tu contraseña</h2>
   <p>Hemos verificado tu correo. Elige una contraseña para que puedas entrar normalmente sin solicitar un código cada vez.</p>
  </div>
  <form className="pro-email-signin" onSubmit={e=>{e.preventDefault();void submit()}}>
   <label htmlFor="pro-account-verified-email">Correo verificado</label>
   <input id="pro-account-verified-email" type="email" value={email} disabled readOnly/>
   <label htmlFor="pro-onboarding-password">Nueva contraseña (mínimo 8 caracteres)</label>
   <input id="pro-onboarding-password" type="password" autoComplete="new-password"
    minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}
    disabled={busy} required/>
   <label htmlFor="pro-onboarding-confirm">Repetir contraseña</label>
   <input id="pro-onboarding-confirm" type="password" autoComplete="new-password"
    minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}
    disabled={busy} required/>
   <button type="submit" disabled={busy||password.length<8||password!==confirm}>
    {busy?'Guardando…':'Crear contraseña y entrar'}
   </button>
  </form>
  <p className="pro-account-status">El código se utiliza para verificar tu correo. Para recuperar el acceso podrás solicitar otro desde la pantalla de entrada.</p>
  {error&&<p className="pro-account-error" role="alert">{error}</p>}
  <button type="button" className="pro-guest-button" disabled={busy} onClick={()=>void run(onExisting)}>
   Ya tenía una contraseña · Continuar
  </button>
  <button type="button" className="pro-google-button" disabled={busy} onClick={()=>void run(onLogout)}>Cerrar sesión</button>
 </section>
}
