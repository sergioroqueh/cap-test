import {useEffect,useRef,useState} from 'react'
import {createCaptchaChallenge,type CaptchaState} from './captchaChallenge.mjs'
type Api={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(widget:string)=>void}
const SITEKEY=import.meta.env.VITE_RUTACAP_TURNSTILE_SITEKEY?.trim()||''
export const captchaConfigured=import.meta.env.MODE==='cap-protected'&&import.meta.env.VITE_RUTACAP_CAPTCHA_ENABLED==='true'&&/^[A-Za-z0-9_-]{10,100}$/.test(SITEKEY)
let loading:Promise<Api>|undefined
function loadApi():Promise<Api>{
 if(!captchaConfigured)return Promise.reject(Error('R98_CAPTCHA_DISABLED'))
 const w=window as Window&{turnstile?:Api}
 if(w.turnstile)return Promise.resolve(w.turnstile)
 if(!loading)loading=new Promise<Api>((resolve,reject)=>{
  const script=document.createElement('script')
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async=true;script.defer=true
  const timer=window.setTimeout(()=>{script.remove();reject(Error('R98_CAPTCHA_TIMEOUT'))},15000)
  script.onload=()=>{clearTimeout(timer);if(w.turnstile)resolve(w.turnstile);else{script.remove();reject(Error('R98_CAPTCHA_LOAD'))}}
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('R98_CAPTCHA_LOAD'))}
  document.head.appendChild(script)
 }).catch(error=>{loading=undefined;throw error})
 return loading
}
export function CaptchaAction({title,action,onDone,onCancel}:{title:string;action:(token:string)=>Promise<void>;onDone:()=>void;onCancel:()=>void}){
 const box=useRef<HTMLDivElement>(null),challenge=useRef<ReturnType<typeof createCaptchaChallenge>|null>(null)
 const [state,setState]=useState<CaptchaState|'loading'|'busy'>('loading')
 const [attempt,setAttempt]=useState(0),[message,setMessage]=useState('')
 const busy=useRef(false),live=useRef(true)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 useEffect(()=>{
  let current=true;setState('loading')
  void loadApi().then(api=>{
   if(!current||!box.current)return
   const c=createCaptchaChallenge({render:api.render.bind(api),remove:api.remove.bind(api)})
   challenge.current=c;c.mount(box.current,SITEKEY,s=>{if(current&&!busy.current)setState(s)})
  }).catch(()=>{if(current)setState('error')})
  return()=>{current=false;challenge.current?.close();challenge.current=null}
 },[attempt])
 async function submit(){
  if(busy.current||state!=='ready')return
  busy.current=true;setState('busy');setMessage('')
  try{const token=challenge.current?.consume();if(!token)throw Error('R98_CAPTCHA_REQUIRED');await action(token);if(live.current)onDone()}
  catch{if(live.current){setMessage('No se ha completado la verificación. Reintenta con un nuevo desafío.');setAttempt(n=>n+1)}}
  finally{busy.current=false}
 }
 return <section className="card" aria-label="Verificación de seguridad"><h3>{title}</h3>
 <p>Completa la comprobación de seguridad para continuar.</p><div ref={box}/>
 {state==='loading'&&<p role="status">Cargando verificación…</p>}
 {(state==='error'||state==='expired')&&<button type="button" className="btn light" onClick={()=>setAttempt(n=>n+1)}>Reintentar verificación</button>}
 {message&&<p role="alert">{message}</p>}
 <button type="button" className="btn primary" disabled={state!=='ready'} onClick={()=>void submit()}>{state==='busy'?'Verificando…':'Confirmar acceso'}</button>
 <button type="button" className="btn light" disabled={state==='busy'} onClick={onCancel}>Cancelar</button>
 </section>
}
