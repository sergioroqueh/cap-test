import {CommercialBillingPanel} from './CommercialBillingPanel'
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
import type {SelectionInput,SelectionMode} from './protectedSelection.mjs'
import {needsReview,smartScore} from './utils'
import type {StudySource} from './types'

const selectionModes: {mode:SelectionMode;source:StudySource;title:string;description:string}[]=[
 {mode:'mixed-exam',source:'cap-mixed',title:'Simulacro mezclado',description:'100 preguntas · 2 h'},
 {mode:'mixed-study',source:'cap-mixed',title:'Estudio mezclado',description:'Corrección inmediata'},
 {mode:'top100',source:'cap-top100',title:'Top 100 más repetidas',description:'Selección entre las 100 más frecuentes'},
 {mode:'top3',source:'cap-top3',title:'Desde 3 repeticiones',description:'Preguntas de frecuencia histórica ≥ 3'},
 {mode:'top4',source:'cap-top4',title:'Desde 4 repeticiones',description:'Preguntas de frecuencia histórica ≥ 4'},
 {mode:'favorites',source:'cap-favorites',title:'Favoritos',description:'Tus preguntas guardadas'},
 {mode:'errors',source:'cap-errors',title:'Errores',description:'Repasa tus fallos pendientes'},
 {mode:'review',source:'cap-review',title:'Repaso inteligente',description:'Prioridad según tu progreso'}
]

export default function ProtectedStudy({userEmail,onSignOut,signedIn=false}:{userEmail:string;onSignOut:()=>Promise<void>;signedIn?:boolean}){
 const [catalog,setCatalog]=useState<ProtectedCatalog|null>(null)
 const [progress,setProgress]=useState<QuestionProgress[]>([])
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [quota,setQuota]=useState<Pick<Exclude<DeliveryReply,{status:'unavailable'}>,'tier'|'day'|'resetAt'|'questionsRemaining'|'examsRemaining'>|null>(null)
 const [selectionMode,setSelectionMode]=useState<SelectionMode>('mixed-exam')
 const [selectionCount,setSelectionCount]=useState(20)
 const [selectionCategory,setSelectionCategory]=useState<'mercancias'|'viajeros'>('mercancias')
 const [selectionNotice,setSelectionNotice]=useState('')
 const selectionPending=useRef<SelectionInput|null>(null)
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
  lock.current=true;setBusy(true);setError('');setResult(null);setSelectionNotice('')
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
 async function startSelection(){
  if(lock.current||!ownerCurrent())return
  lock.current=true;setBusy(true);setError('');setResult(null);setSelectionNotice('')
  const spec=selectionModes.find(x=>x.mode===selectionMode)!
  const count=selectionMode==='mixed-exam'?100:selectionCount
  const category=selectionMode.startsWith('mixed-')?selectionCategory:'mercancias'
  // Only progress IDs and scores travel. Never transmit answer history,
  // email, user ID, current tier, or question text to the selector.
  const hints:Record<string,number>=Object.create(null)
  if(['favorites','errors','review'].includes(selectionMode)){
   for(const p of [...progress].sort((a,b)=>a.questionId.localeCompare(b.questionId))){
    if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(p.questionId))continue
    if(selectionMode==='favorites'&&p.favorite)hints[p.questionId]=1
    if(selectionMode==='errors'&&needsReview(p))hints[p.questionId]=1
    if(selectionMode==='review'){
     const score=smartScore(p)
     if(Number.isFinite(score))hints[p.questionId]=Math.round(Math.max(-1000000,Math.min(1000000,score))*1000)/1000
    }
   }
  }
  let client:Awaited<ReturnType<typeof openCommercialDelivery>>|undefined
  try{
   if(['favorites','errors'].includes(selectionMode)&&!Object.keys(hints).length){
    setError(selectionMode==='favorites'?'Todavía no tienes preguntas favoritas.':'No tienes errores pendientes de repaso.');return
   }
   if(Object.keys(hints).length>5000||JSON.stringify(hints).length>500000){
    setError('El historial supera el límite de selección de esta versión. No se ha consumido cupo.');return
   }
   const last=selectionPending.current
   // A retry reuses the exact preferences, even if the smart age score changes.
   const input:SelectionInput=last&&last.mode===selectionMode&&last.count===count&&last.category===category
    ?last:{mode:selectionMode,category,count,hints,requestId:crypto.randomUUID()}
   selectionPending.current=input
   client=await openCommercialDelivery(signedIn?'account':'guest')
   const reply=await client.select(input)
   if(!ownerCurrent())return
   if(reply.status==='unavailable'){
    selectionPending.current=null
    setError('No hay suficientes preguntas autorizadas para esta selección. No se ha consumido cupo.');return
   }
   const {tier,day,resetAt,questionsRemaining,examsRemaining}=reply
   setQuota({tier,day,resetAt,questionsRemaining,examsRemaining})
   if(reply.status==='quota_exhausted'){
    selectionPending.current=null;setError('Has agotado el cupo diario de esta modalidad.');return
   }
   const questions=reply.content.questions
   const exam=input.mode==='mixed-exam'
   const initial:ActiveSession={type:exam?'exam':'study',source:spec.source,
    label:'CAP '+(category==='mercancias'?'Mercancías':'Viajeros')+' · '+spec.title+' · '+questions.length+' preguntas',
    questionIds:questions.map(q=>q.id),currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now(),
    timed:exam,durationMinutes:exam?CAP_DURATION_MINUTES:undefined,clientId:crypto.randomUUID()}
   if(questions.length<count)setSelectionNotice('Se han entregado '+questions.length+' de '+count+' preguntas solicitadas por disponibilidad o cupo.')
   selectionPending.current=null;setActive({initial,questions})
  }catch(e){
   if(ownerCurrent())setError(e instanceof Error&&e.message==='R93_DELIVERY_DISABLED'?'La entrega comercial aún no está activada.':'No se ha podido abrir la selección. Reintenta el mismo modo.')
  }finally{client?.close();lock.current=false;if(ownerCurrent())setBusy(false)}
 }
 if(active&&ownerCurrent())return <div className="app pro-quiz-page">{selectionNotice&&<p role="status" className="card">{selectionNotice}</p>}<QuizSession key={active.initial.clientId} initial={active.initial} questions={active.questions} frequency={{}} pm={new Map(progress.map(p=>[p.questionId,p]))} refresh={refresh} protectedCallbacks={{
  ownerCurrent,exit:()=>setActive(null),complete:record=>{setActive(null);setResult(record)}
 }}/></div>
 const items=(catalog?.items||[]).filter(i=>i.kind===mode)
 const chosen=items.find(i=>i.contentId===selected)
 return <div className="app"><header><ProBrand/><button className="btn light" onClick={()=>void onSignOut()}>Salir</button></header>
 <main className="page"><h1>Estudio RutaCAP</h1><p>{userEmail}</p>
 <p>Entrega de contenido autorizado por sesión. Se requiere conexión.</p>
 <CommercialBillingPanel signedIn={signedIn}/>
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
 </div>
 <section className="card" aria-label="Modos de estudio protegidos">
 <h2>Simulacros y repaso</h2>
 <div className="pro-shortcuts">{selectionModes.map(spec=><button type="button" key={spec.mode} className={selectionMode===spec.mode?'btn primary':'btn light'} aria-pressed={selectionMode===spec.mode} disabled={busy} onClick={()=>{if(selectionMode!==spec.mode)selectionPending.current=null;setSelectionMode(spec.mode);setSelectionNotice('')}}><strong>{spec.title}</strong> · {spec.description}</button>)}</div>
 {selectionMode.startsWith('mixed-')&&<label>Modalidad CAP <select disabled={busy} value={selectionCategory} onChange={e=>{selectionPending.current=null;setSelectionCategory(e.target.value as 'mercancias'|'viajeros')}}><option value="mercancias">Mercancías</option><option value="viajeros">Viajeros</option></select></label>}
 {selectionMode!=='mixed-exam'&&<label>Preguntas por sesión <select disabled={busy} value={selectionCount} onChange={e=>{selectionPending.current=null;setSelectionCount(Number(e.target.value))}}>{[10,20,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>}
 <p>{selectionMode==='mixed-exam'?'Se consume un examen si se entregan las 100 preguntas.':'Se consumen únicamente las preguntas entregadas. El servidor puede ajustar la sesión al cupo disponible.'}</p>
 <button className="btn primary" disabled={busy||!catalog||!catalog.items.some(i=>i.kind==='question'&&i.category===(selectionMode.startsWith('mixed-')?selectionCategory:'mercancias'))} onClick={()=>void startSelection()}>{busy?'Comprobando acceso…':'Iniciar selección protegida'}</button>
 {selectionNotice&&<p role="status">{selectionNotice}</p>}
 </section>
 {error&&<p role="alert" className="card">{error}</p>}
 <p>La exportación PDF y el estudio sin conexión siguen deshabilitados en esta compilación protegida.</p>
 </main></div>
}
