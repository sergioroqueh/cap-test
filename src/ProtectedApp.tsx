import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {CommercialAccountPreview} from './CommercialAccountPreview'
import {CommercialPasswordOnboarding} from './CommercialPasswordOnboarding'
import {acknowledgeExistingPassword,authConfigured,emailOtpConfigured,googleConfigured,passwordConfigured,getSession,needsPasswordOnboarding,setAccountPassword,signInWithEmail,signInWithGoogle,signInWithPassword,signOut,supabase,verifyEmailOtp} from './supabase'
import {setLocalOwner} from './localScope'
import ProtectedStudy from './ProtectedStudy'
const PREVIEW=false
const THEME='rutacap-dev-theme'
const go=(r:string)=>location.hash='#/'+r
function Loading({text}:{text:string}){return <div className="center">{text}</div>}
export default function ProtectedApp(){
 const [session,setSession]=useState<Session|null>(null)
 const [guest,setGuest]=useState(()=>{try{return sessionStorage.getItem('rutacap-dev-guest-open')==='1'}catch{return false}})
 const [authReady,setAuthReady]=useState(!authConfigured)
 const [authError,setAuthError]=useState('')
 useEffect(()=>{document.documentElement.dataset.theme=localStorage.getItem(THEME)||'dark'},[])
 useEffect(()=>{
  if(PREVIEW||!authConfigured||!supabase)return
  let live=true
  const client=supabase
  async function refreshIdentity(){
   try {
    const verified=await getSession()
    if(!live)return
    setLocalOwner(verified?.user.id??null)
    setSession(verified)
    if(verified){sessionStorage.removeItem('rutacap-dev-guest-open');setGuest(false);setAuthError('')}
   } catch {
    if(!live)return
    setLocalOwner(null)
    setSession(null)
    setAuthError('No se ha podido verificar tu acceso. Prueba de nuevo.')
   } finally {
    if(live){
     setAuthReady(true)
     if(window.location.pathname==='/auth/callback'){
      const parameters=new URLSearchParams(window.location.search)
      const callbackError=parameters.get('error')
      window.history.replaceState(null,'','/#/home')
      if(callbackError)setAuthError('El proveedor ha cancelado o rechazado el acceso.')
     }
    }
   }
  }
  // Auth state callback does not await or call auth methods inside its lock.
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
   if(!live)return
   if(event==='SIGNED_OUT'){setLocalOwner(null);setSession(null)}
   else if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')
    queueMicrotask(()=>{if(live)void refreshIdentity()})
  })
  void refreshIdentity()
  return()=>{live=false;subscription.unsubscribe()}
 },[])
 async function logout(){
  try{
   if(session)await signOut()
   setLocalOwner(null);setSession(null);setGuest(false);setAuthError('')
   sessionStorage.removeItem('rutacap-dev-guest-open')
   go('home')
  }catch{setAuthError('No se pudo cerrar la sesión. Vuelve a intentarlo.')}
 }
 async function finishPasswordSetup(action:()=>Promise<void>):Promise<void>{
  await action()
  const refreshed=await getSession()
  if (!refreshed) throw new Error('La sesión ha dejado de estar disponible.')
  setSession(refreshed)
 }
 if(!authReady)return <Loading text="Comprobando tu acceso…"/>
 if(session && needsPasswordOnboarding(session))
  return <CommercialPasswordOnboarding key={'setup-'+session.user.id}
   email={session.user.email||''}
   onCreate={password=>finishPasswordSetup(()=>setAccountPassword(password))}
   onExisting={()=>finishPasswordSetup(acknowledgeExistingPassword)}
   onLogout={logout}/>
 if(session)return <ProtectedStudy key={'account-'+session.user.id} userEmail={session.user.email||'Mi cuenta'} onSignOut={logout} signedIn/>
 if(guest)return <ProtectedStudy key="guest" userEmail="Modo invitado · solo este navegador" onSignOut={logout}/>
 return <div className="pro-auth-entry"><CommercialAccountPreview
  onContinue={()=>{setLocalOwner(null);sessionStorage.setItem('rutacap-dev-guest-open','1');setGuest(true);setAuthError('')}}
  authEnabled={authConfigured} googleEnabled={googleConfigured} emailOtpEnabled={emailOtpConfigured} passwordEnabled={passwordConfigured} notice={authError}
  onGoogle={signInWithGoogle} onEmail={signInWithEmail} onVerifyEmail={verifyEmailOtp} onPassword={signInWithPassword}
 /></div>
}

