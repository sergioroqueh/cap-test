import {useEffect,useRef,useState} from 'react'
import {ProBrand} from './CommercialHome'
import {QuizSession} from './Quiz'
import {CAP_DURATION_MINUTES} from './examEngine.mjs'
import {getAllProgress} from './db'
import {localOwnerGeneration,localBackupOwner} from './localScope'
import {openCommercialDelivery} from './commercialDeliveryIdentity'
import {validatePublicCatalog,validateDeliveredUnit,type ProtectedItem,type ProtectedCatalog} from './protectedCatalogContract.mjs'
import type {ActiveSession,Question,QuestionProgress,StudySessionRecord} from './types'
import type {DeliveryReply} from './commercialDelivery.mjs'

export default function ProtectedStudy({userEmail,onSignOut,signedIn=false}:{userEmail:string;onSignOut:()=>Promise<void>;signedIn?:boolean}){
 const [catalog,setCatalog]=useState<ProtectedCatalog|null>(null)
 const [progress,setProgress]=useState<QuestionProgress[]>([])
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [quota,setQuota]=useState<Pick<Exclude<DeliveryReply,{status:'unavailable'}>,'tier'|'day'|'resetAt'|'questionsRemaining'|'examsRemaining'>|null>(null)
 const [selected,setSelected]=useState('')
 const [mode,setMode]=useState<'question'|'exam'>('exam')
 const [active,setActive]=useState<{initial:ActiveSession;questions:Question[]}|null>(null)
 const [result,setResult]=useState<StudySessionRecord|null>(null)
 const pending=useRef<{key:string;requestId:string}|null>(null)
 const lock=useRef(false),live=useRef(true)
 const generation=useRef(localOwnerGeneration()).current
 const ownerCurrent=()=>live.current&&localOwnerGeneration()===generation&&localBackupOwner().kind===(signedIn?'user':'guest')
 useEffect(()=>{
  live.current=true
  let cancelled=false
  fetch('/catalog.json',{cache:'no-store',redirect:'error'}).then(r=>{
   if(!r.ok)throw Error('R94_CATALOG_UNAVAILABLE')
   return r.json()
  }).then(validatePublicCatalog).then(value=>{if(!cancelled&&ownerCurrent())setCatalog(value)})
  .catch(()=>{if(!cancelled&&ownerCurrent())setError('No se ha podido cargar el catálogo autorizado.')})
  void getAllProgress().then(value=>{if(!cancelled&&ownerCurrent())setProgress(value)}).catch(()=>{})
  return()=>{cancelled=true;live.current=false}
 },[])
 const refresh=async()=>{if(ownerCurrent()){const value=await getAllProgress();if(ownerCurrent())setProgress(value)}}
 async function start(item:ProtectedItem){
  if(lock.current||!ownerCurrent())return
  lock.current=true;setBusy(true);setError('');setResult(null)
  const key=item.kind+':'+item.contentId+':'+item.revision
  if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID()}
  const requestId=pending.current.requestId
  let client:Awaited<ReturnType<typeof openCommercialDelivery>>|undefined
  try{
   client=await openCommercialDelivery(signedIn?'account':'guest')
   const reply=await client.deliver({kind:item.kind,contentId:item.contentId,requestId})
   if(!ownerCurrent())return
   if(reply.status==='unavailable'){pending.current=null;setError('Este contenido no está disponible para tu acceso.');return}
   // Never retain the delivered payload in quota state.
   const {tier,day,resetAt,questionsRemaining,examsRemaining}=reply
   setQuota({tier,day,resetAt,questionsRemaining,examsRemaining})
   if(reply.status==='quota_exhausted'){pending.current=null;setError('Has agotado el cupo diario de esta modalidad.');return}
   const questions=validateDeliveredUnit(reply,item)
   const initial:ActiveSession={type:item.kind==='exam'?'exam':'study',source:item.category==='general'?'questionnaire':'cap-original',
    label:item.label,questionIds:questions.map(q=>q.id),currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now(),
    timed:item.kind==='exam',durationMinutes:item.kind==='exam'?CAP_DURATION_MINUTES:undefined,clientId:crypto.randomUUID()}
   pending.current=null;setActive({initial,questions})
  }catch(e){
   if(ownerCurrent())setError(e instanceof Error&&e.message==='R93_DELIVERY_DISABLED'
    ?'La entrega comercial aún no está activada.'
    :!signedIn?'No se ha podido verificar el acceso de invitado. Puede requerir verificación CAPTCHA.':'No se ha podido abrir el contenido autorizado. Reintenta la misma selección.')
  }finally{client?.close();lock.current=false;if(ownerCurrent())setBusy(false)}
 }
 if(active&&ownerCurrent())return <div className="app pro-quiz-page"><QuizSession key={active.initial.clientId} initial={active.initial} questions={active.questions} frequency={{}} pm={new Map(progress.map(p=>[p.questionId,p]))} refresh={refresh} protectedCallbacks={{
  ownerCurrent,exit:()=>setActive(null),complete:record=>{setActive(null);setResult(record)}
 }}/></div>
 const items=(catalog?.items||[]).filter(i=>i.kind===mode)
 const chosen=items.find(i=>i.contentId===selected)
 return <div className="app"><header><ProBrand/><button className="btn light" onClick={()=>void onSignOut()}>Salir</button></header>
 <main className="page"><h1>Estudio RutaCAP</h1><p>{userEmail}</p>
 <p>Entrega de contenido autorizado por sesión. Se requiere conexión.</p>
 {quota&&<section className="card" aria-label="Cupo diario"><b>{quota.tier==='guest'?'Invitado':quota.tier==='free'?'Gratis':'Premium'}</b>
 <p>Preguntas disponibles: {quota.questionsRemaining??'Sin límite'} · Exámenes: {quota.examsRemaining??'Sin límite'}</p>
 <small>Renovación: {new Date(quota.resetAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid'})}</small></section>}
 {result&&<section className="card"><h2>Resultado</h2><p>{result.correct} aciertos · {result.incorrect} fallos · {result.blank??0} en blanco</p>
 <p>{result.capScoring?result.netPoints+' puntos netos':result.score+' %'}</p>{result.passed!==null&&result.passed!==undefined&&<p>{result.passed?'Aprobado':'No aprobado'}</p>}</section>}
 <div className="card"><label>Modalidad <select disabled={busy} value={mode} onChange={e=>{setMode(e.target.value as 'question'|'exam');setSelected('')}}><option value="exam">Examen histórico</option><option value="question">Pregunta de estudio</option></select></label>
 {!catalog?<p>Cargando catálogo…</p>:items.length===0?<p>No hay unidades autorizadas para esta modalidad.</p>:<>
 <label>Contenido <select disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecciona una unidad</option>{items.map(i=><option key={i.contentId} value={i.contentId}>{i.label}</option>)}</select></label>
 <button className="btn primary" disabled={busy||!chosen} onClick={()=>{if(chosen)void start(chosen)}}>{busy?'Comprobando acceso…':'Abrir contenido'}</button>
 <button className="btn light" disabled={busy} onClick={()=>{const item=items[Math.floor(Math.random()*items.length)];if(item){setSelected(item.contentId);void start(item)}}}>Elegir al azar</button></>}
 {error&&<p role="alert">{error}</p>}</div>
 <p>Los modos de banco completo, exportación PDF y estudio sin conexión no están habilitados en esta compilación protegida.</p>
 </main></div>
}
