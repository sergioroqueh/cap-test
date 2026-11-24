import {CaptchaAction,captchaConfigured} from './CaptchaAction'
import {hasVerifiedGuestIdentity,provisionGuestIdentity,protectedDeliveryApproved} from './commercialDeliveryIdentity'
import {useEffect,useRef,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {CommercialAccountPreview} from './CommercialAccountPreview'
import {CommercialPasswordOnboarding} from './CommercialPasswordOnboarding'
import {acknowledgeExistingPassword,authConfigured,emailOtpConfigured,googleConfigured,passwordConfigured,getSession,needsPasswordOnboarding,setAccountPassword,signInWithEmail,signInWithGoogle,signInWithPassword,signOut,supabase,verifyEmailOtp} from './supabase'
import {setLocalOwner,localBackupOwner} from './localScope'
import ProtectedStudy from './ProtectedStudy'
type PendingChallenge={title:string;action:(token:string)=>Promise<void>;resolve:()=>void;reject:(e:Error)=>void}
const PREVIEW=false
const THEME='rutacap-dev-theme'
const go=(r:string)=>location.hash='#/'+r
function Loading({text}:{text:string}){return <div className="center">{text}</div>}
export default function ProtectedApp(){
 const [session,setSession]=useState<Session|null>(null)
 const [guest,setGuest]=useState(()=>{try{return !protectedDeliveryApproved&&sessionStorage.getItem('rutacap-dev-guest-open')==='1'}catch{return false}})
 const [authReady,setAuthReady]=useState(!authConfigured)
 const [authError,setAuthError]=useState('')
 const [challenge,setChallenge]=useState<PendingChallenge|null>(null)
 const challengeRef=useRef<typeof challenge>(null)
 const guestBusy=useRef(false)
 const cancelChallenge=()=>{const current=challengeRef.current;challengeRef.current=null;setChallenge(null);current?.reject(Error('R98_CAPTCHA_CANCELLED'))}
 function runWithCaptcha(title:string,action:(token:string)=>Promise<void>):Promise<void>{
  if(!captchaConfigured||challengeRef.current)return Promise.reject(Error('R98_CAPTCHA_UNAVAILABLE'))
  return new Promise((resolve,reject)=>{const c:PendingChallenge={title,action:async(token:string)=>{await action(token);if(challengeRef.current===c){challengeRef.current=null;setChallenge(null);resolve()}},resolve,reject};challengeRef.current=c;setChallenge(c)})
 }
 function enterGuest(){
  setLocalOwner(null);sessionStorage.setItem('rutacap-dev-guest-open','1');setGuest(true);setAuthError('')
 }
 async function continueGuest(){
  if(guestBusy.current)return
  guestBusy.current=true
  try{
   if(!protectedDeliveryApproved){enterGuest();return}
   if(!await hasVerifiedGuestIdentity())await runWithCaptcha('Acceso como invitado',provisionGuestIdentity)
   if(localBackupOwner().kind!=='guest'||(authConfigured&&await getSession()))throw Error('R98_ACCOUNT_CHANGED')
   enterGuest()
  }catch{setAuthError('No se ha podido verificar el acceso de invitado. Inténtalo de nuevo.')}
  finally{guestBusy.current=false}
 }
 useEffect(()=>{document.documentElement.dataset.theme=localStorage.getItem(THEME)||'dark'},[])
 useEffect(()=>{
  if(PREVIEW||!authConfigured||!supabase)return
  let live=true,revision=0
  const client=supabase
  async function refreshIdentity(){
   const current=++revision
   try {
    const verified=await getSession()
    if(!live||current!==revision)return
    setLocalOwner(verified?.user.id??null)
    setSession(verified)
    if(verified){sessionStorage.removeItem('rutacap-dev-guest-open');setGuest(false);setAuthError('')}
   } catch {
    if(!live||current!==revision)return
    setLocalOwner(null)
    setSession(null)
    setAuthError('No se ha podido verificar tu acceso. Prueba de nuevo.')
   } finally {
    if(live&&current===revision){
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
  const {data:{subscription}}=client.auth.onAuthStateChange((event,nextSession)=>{
   if(!live)return
   if(event==='SIGNED_OUT'){revision++;setLocalOwner(null);setSession(null);setGuest(false);setAuthReady(true)}
   else if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')
    {
     const owner=localBackupOwner()
     if(nextSession&&owner.kind==='user'&&owner.userId!==nextSession.user.id){revision++;setLocalOwner(null);setSession(null);setGuest(false);setAuthReady(false)}
     setTimeout(()=>{if(live)void refreshIdentity()},0)
    }
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
  onContinue={()=>void continueGuest()}
  runWithCaptcha={captchaConfigured||import.meta.env.VITE_RUTACAP_CAPTCHA_ENABLED==='true'?runWithCaptcha:undefined}
  externalBusy={!!challenge}
  authEnabled={authConfigured} googleEnabled={googleConfigured} emailOtpEnabled={emailOtpConfigured} passwordEnabled={passwordConfigured} notice={authError}
  onGoogle={signInWithGoogle} onEmail={signInWithEmail} onVerifyEmail={verifyEmailOtp} onPassword={signInWithPassword}
 />{challenge&&<CaptchaAction key={challenge.title} title={challenge.title} action={challenge.action}
 onDone={()=>{if(challengeRef.current===challenge){challengeRef.current=null;setChallenge(null);challenge.resolve()}}} onCancel={cancelChallenge}/>}</div>
}

