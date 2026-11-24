import { useState } from 'react'
import { ProBrand, ProIcon } from './CommercialHome'

type Props = {
  onContinue: () => void
  authEnabled?: boolean
  googleEnabled?: boolean
  onGoogle?: () => Promise<void>
  onEmail?: (email: string, captchaToken?:string) => Promise<void>
  onVerifyEmail?: (email: string, code: string) => Promise<void>
  emailOtpEnabled?: boolean
  passwordEnabled?: boolean
  onPassword?: (email: string, password: string, captchaToken?:string) => Promise<void>
  notice?: string
  runWithCaptcha?: (title:string,action:(token:string)=>Promise<void>)=>Promise<void>
}
// No real third-party requests in preview; development OAuth is explicit opt-in.
const launchBeta = import.meta.env.VITE_CAP_LAUNCH === 'true'
export function CommercialAccountPreview({onContinue,authEnabled=false,googleEnabled=false,onGoogle,onEmail,onVerifyEmail,emailOtpEnabled=false,passwordEnabled=false,onPassword,notice,runWithCaptcha}:Props){
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [usePassword,setUsePassword]=useState(passwordEnabled)
 const [code,setCode]=useState('')
 const [codeSent,setCodeSent]=useState(false)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 async function verifyAction(title:string,action:(token?:string)=>Promise<void>){
  if(runWithCaptcha)await runWithCaptcha(title,action);else await action()
 }
 async function run(action:()=>Promise<void>){
  if(busy)return
  setBusy(true);setError('');setMessage('')
  try{await action()}catch(error){
   const diagnostic=import.meta.env.DEV && error instanceof Error ? `Prueba local: ${error.message}` : null
   setError(diagnostic??'No se pudo completar el acceso. Revisa la configuración e inténtalo de nuevo.')
  }
  finally{setBusy(false)}
 }
 return <section className="pro-account-preview" aria-label="Acceso RutaCAP">
  <div className="pro-account-intro">{(authEnabled||launchBeta)&&<ProBrand/>}<span className="pro-account-tag">{authEnabled?(launchBeta?'ACCESO · CUENTA GRATIS':'ACCESO · DESARROLLO'):launchBeta?'VERSIÓN BETA GRATUITA':'ACCESO · PREVIEW LOCAL'}</span><h2>Tu próximo destino: aprobar.</h2><p>Practica tus exámenes CAP. El progreso de esta etapa permanece en tu navegador, sin sincronización entre dispositivos.</p></div>
  {googleEnabled&&<><button type="button" className="pro-google-button" disabled={busy} onClick={()=>onGoogle&&void run(onGoogle)} aria-describedby="pro-google-status"><svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#4285F4" d="M44 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11.2a9.6 9.6 0 0 1-4.2 6.3v5.2h6.8c4-3.7 6.2-9.1 6.2-15.3Z"/><path fill="#34A853" d="M24 45c5.6 0 10.4-1.9 13.8-5.2L31 34.6a12.5 12.5 0 0 1-18.6-6.5H5.4v5.4A21 21 0 0 0 24 45Z"/><path fill="#FBBC05" d="M12.4 28.1a12.6 12.6 0 0 1 0-8.2v-5.4h-7a21 21 0 0 0 0 19Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3.1l6-6A20.1 20.1 0 0 0 24 3 21 21 0 0 0 5.4 14.5l7 5.4A12.5 12.5 0 0 1 24 11.2Z"/></svg>Continuar con Google</button>
  <p id="pro-google-status" className="pro-account-status">Google permite entrar con tu cuenta. Tu progreso sigue siendo local hasta que esté disponible la sincronización.</p></>}
  {authEnabled&&passwordEnabled&&emailOtpEnabled&&<div className="pro-email-signin" role="group" aria-label="Tipo de acceso">
   <button type="button" className={usePassword?'btn primary':'btn light'} aria-pressed={usePassword}
    onClick={()=>{setUsePassword(true);setError('');setMessage('');setPassword('')}} disabled={busy}>Entrar</button>
   <button type="button" className={!usePassword?'btn primary':'btn light'} aria-pressed={!usePassword}
    onClick={()=>{setUsePassword(false);setError('');setMessage('');setPassword('')}} disabled={busy}>Crear cuenta o recuperar acceso</button>
  </div>}
  {authEnabled&&passwordEnabled&&usePassword&&<form className="pro-email-signin"
   onSubmit={e=>{e.preventDefault();if(onPassword)void run(()=>verifyAction('Acceso con contraseña',token=>onPassword(email,password,token)))}}>
   <label htmlFor="pro-access-password-email">Correo electrónico</label>
   <input id="pro-access-password-email" type="email" autoComplete="username" value={email}
    onChange={e=>setEmail(e.target.value)} placeholder="tu@email.es" disabled={busy} required/>
   <label htmlFor="pro-access-password">Contraseña</label>
   <input id="pro-access-password" type="password" autoComplete="current-password" value={password}
    onChange={e=>setPassword(e.target.value)} disabled={busy} required/>
   <button type="submit" disabled={busy||!onPassword||!email.trim()||!password}>Iniciar sesión</button>
   {emailOtpEnabled&&<small>¿Primera vez u olvidaste la contraseña? Selecciona «Crear cuenta o recuperar acceso».</small>}
  </form>}
  {authEnabled&&emailOtpEnabled&&!usePassword&&<form className="pro-email-signin" onSubmit={e=>{e.preventDefault();if(onEmail)void run(async()=>{await verifyAction('Enviar código de acceso',token=>onEmail(email,token));setCodeSent(true);setMessage('Comprueba tu correo electrónico e introduce el código de seis cifras.')})}}>
   <label htmlFor="pro-access-email">Correo para verificar tu cuenta</label>
   <input id="pro-access-email" type="email" autoComplete="email" value={email} onChange={e=>{setEmail(e.target.value);setCodeSent(false);setCode('')}} placeholder="tu@email.es" required disabled={busy}/>
   <button type="submit" disabled={busy||!email.trim()}>{codeSent?'Reenviar código':'Enviar código de verificación'}</button>
   {!codeSent&&<small>Si es tu primera vez, podrás crear tu contraseña al confirmar el código.</small>}
  </form>}
  {authEnabled&&emailOtpEnabled&&!usePassword&&codeSent&&<form className="pro-email-signin" onSubmit={e=>{e.preventDefault();if(onVerifyEmail)void run(()=>onVerifyEmail(email,code))}}>
   <label htmlFor="pro-access-code">Código de seis cifras</label>
   <input id="pro-access-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} placeholder="000000" required disabled={busy}/>
   <button type="submit" disabled={busy||!onVerifyEmail||code.length!==6}>Verificar correo</button>
  </form>}
  {(error||notice)&&<p className="pro-account-error" role="alert">{error||notice}</p>}
  {message&&<p className="pro-account-message" role="status">{message}</p>}
  <button type="button" className="pro-guest-button" disabled={busy} onClick={onContinue}><span>Continuar como invitado</span><span aria-hidden="true">›</span></button>
  {launchBeta&&<p className="pro-account-status" role="note">Versión beta independiente, no oficial. Conserva una copia de tu progreso desde Perfil; las respuestas y los exámenes históricos pueden estar sujetos a revisión. Consulta las fuentes oficiales para preparar tu examen.</p>}
  <div className="pro-account-benefits"><span><ProIcon name="file"/> Archivo histórico</span><span><ProIcon name="chart"/> Progreso local</span><span><ProIcon name="bank"/> Banco general</span></div>
 </section>
}
