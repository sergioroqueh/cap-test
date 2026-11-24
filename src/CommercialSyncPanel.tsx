import {useEffect,useRef,useState} from 'react'
import {commercialConsent,commercialSyncApproved,synchronizeCommercialAccount} from './commercialSync'
import {localOwnerGeneration} from './localScope'
export function CommercialSyncPanel({refresh,onBusy,blocked=false}:{refresh:()=>Promise<void>;onBusy:(busy:boolean)=>void;blocked?:boolean}){
 const [consent,setConsent]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const live=useRef(true),locked=useRef(false),generation=useRef(localOwnerGeneration()).current
 const current=()=>live.current&&generation===localOwnerGeneration()
 useEffect(()=>{
  live.current=true
  if(commercialSyncApproved)void commercialConsent('status').then(r=>{if(current())setConsent(r.granted)}).catch(()=>{if(current())setMessage('No se ha podido consultar el consentimiento.')})
  return()=>{live.current=false}
 },[])
 async function run(action:'grant'|'revoke'|'sync'|'status'){
  if(blocked||locked.current||!commercialSyncApproved||!current())return
  locked.current=true;setBusy(true);onBusy(true);setMessage('')
  try{
   if(action==='sync'){const r=await synchronizeCommercialAccount();if(current()){await refresh();if(current())setMessage('Sincronización confirmada: '+r.events+' eventos y '+r.sessions+' sesiones.')}}
   else{const r=await commercialConsent(action);if(current()){setConsent(r.granted);setMessage(action==='revoke'?'Consentimiento retirado. Se detiene la sincronización; no se eliminan automáticamente los datos ya almacenados.':action==='grant'?'Consentimiento registrado. Puedes sincronizar manualmente.':'Estado actualizado.')}}
  }catch{if(current())setMessage('No se ha podido confirmar la operación. Inténtalo de nuevo.')}
  finally{locked.current=false;if(current()){setBusy(false);onBusy(false)}}
 }
 return <section className="card" aria-label="Sincronización de progreso"><h2>Sincronización entre dispositivos</h2>
 <p>Opcional. Comparte con tu cuenta los eventos de respuestas, favoritos y sesiones de estudio. No incorpora el progreso del invitado ni activa pagos.</p>
 <p>Al retirar el consentimiento se interrumpe la sincronización futura. La eliminación de los datos ya guardados requiere una solicitud separada. Consulta la política de privacidad antes de aceptar.</p>
 {!commercialSyncApproved?<small>Sincronización pendiente de validación. Tus datos permanecen en este navegador.</small>:<>
 {consent===null?<button disabled={busy||blocked} onClick={()=>void run('status')}>Consultar consentimiento</button>:consent?<><button className="btn primary" disabled={busy||blocked} onClick={()=>void run('sync')}>Sincronizar ahora</button><button className="btn light" disabled={busy||blocked} onClick={()=>void run('revoke')}>Retirar consentimiento</button></>:<button className="btn primary" disabled={busy||blocked} onClick={()=>void run('grant')}>Acepto activar la sincronización</button>}
 </>}
 {message&&<p role="status">{message}</p>}
 </section>
}
