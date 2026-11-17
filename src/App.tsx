import { useEffect, useMemo, useState } from 'react'
import Quiz from './Quiz'
import AnswerProvenance from './AnswerProvenance'
import CommercialHome, { ProBrand, ProIcon, isRegionCode, regionByCode, RegionMark, REGIONS, type RegionCode } from './CommercialHome'
import { CommercialAccountPreview } from './CommercialAccountPreview'
import ConfirmDialog from './ConfirmDialog'
import StudyPdfButton from './StudyPdfButton'
import TopFrequencyDialog from './TopFrequencyDialog'
import { CAP_DURATION_MINUTES, gradeSession, frequentExamQuestionsAtOrAbove, mostFrequentExamQuestions, uniqueExamQuestions } from './examEngine.mjs'
import type { ActiveSession, AnswerKey, BankIndex, Question, QuestionProgress, QuestionnaireMeta, StudySessionRecord, StudySource } from './types'
import { addSession, clearAllData, exportDatabase, getAllProgress, getRecentSessions, importProgress, pushLocalSnapshotToCloud, putProgress } from './db'
import { authConfigured, getSession, signInWithEmail, signInWithGoogle, signOut, supabase } from './supabase'
import { activeKey, lastKey, regionKey, setLocalOwner } from './localScope'
import type { Session } from '@supabase/supabase-js'
import { loadAllQuestions, loadBankIndex, loadQuestionnaire, resolveQuestions } from './data'
import { chooseSmartQuestions, getStatus, needsReview, percent, shuffle, smartScore } from './utils'
import { loadCapIndex, loadCapQuestions, loadAllCapQuestions, loadCapPendingQuestions, loadCapSheetReview, loadCapEditorialTriage, type CapEditorialTriage, type CapSheetReviewQuestion, type CapPendingQuestion, type CapCategory, type CapExamMeta, type CapExamIndex, type CapEditorialDecision } from './capExams'

const PREVIEW=import.meta.env.VITE_CAP_PREVIEW === 'true'
function readRegion():RegionCode{try{const value=localStorage.getItem(regionKey());return isRegionCode(value)?value:'clm'}catch{return 'clm'}}
const THEME=PREVIEW?'cap-test-beta-theme':'rutacap-dev-theme'
type Route='home'|'general'|'study'|'questionnaires'|'exam'|'quiz'|'results'|'stats'|'settings'
const route=():Route=>{const r=location.hash.replace(/^#\/?/,'').split('?')[0] as Route;return ['home','general','study','questionnaires','exam','quiz','results','stats','settings'].includes(r)?r:'home'}
const go=(r:Route)=>location.hash='#/'+r
const keys:AnswerKey[]=['A','B','C','D']

function Bar({v}:{v:number}){return <div className="bar"><i style={{width:Math.max(0,Math.min(100,v))+'%'}}/></div>}
function Btn({children,onClick,kind='primary',disabled=false}:{children:any,onClick?:()=>void,kind?:string,disabled?:boolean}){return <button className={'btn '+kind} onClick={onClick} disabled={disabled}>{children}</button>}
function Loading({text='Cargando…'}:{text?:string}){return <div className="center"><span className="spinner"/><b>{text}</b></div>}

function App(){
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
   else if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')
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
 if(PREVIEW)return <CapApp userEmail="Modo pruebas · solo este navegador" onSignOut={async()=>{}}/>
 if(!authReady)return <Loading text="Comprobando tu acceso…"/>
 if(session)return <CapApp key={'account-'+session.user.id} userEmail={session.user.email||'Cuenta de pruebas'} onSignOut={logout}/>
 if(guest)return <CapApp key="guest" userEmail="Modo invitado · solo este navegador" onSignOut={logout}/>
 return <div className="pro-auth-entry"><CommercialAccountPreview
  onContinue={()=>{setLocalOwner(null);sessionStorage.setItem('rutacap-dev-guest-open','1');setGuest(true);setAuthError('')}}
  authEnabled={authConfigured} notice={authError}
  onGoogle={signInWithGoogle} onEmail={signInWithEmail}
 /></div>
}

function CapApp({userEmail,onSignOut}:{userEmail:string;onSignOut:()=>Promise<void>}){
 const [page,setPage]=useState<Route>(route()),[bank,setBank]=useState<BankIndex|null>(null),[rows,setRows]=useState<QuestionProgress[]>([]),[sessions,setSessions]=useState<StudySessionRecord[]>([]),[busy,setBusy]=useState(true),[load,setLoad]=useState<number|null>(null),[online,setOnline]=useState(navigator.onLine),[theme,setTheme]=useState(localStorage.getItem(THEME)||'dark')
 const [regionCode,setRegionCode]=useState<RegionCode>(readRegion)
 function changeRegion(code:RegionCode){setRegionCode(code);try{localStorage.setItem(regionKey(),code)}catch{/* in-memory preference remains */}}
 useEffect(()=>{const h=()=>setPage(route()),o=()=>{const isOnline=navigator.onLine;setOnline(isOnline);if(isOnline)pushLocalSnapshotToCloud().catch(console.error)};addEventListener('hashchange',h);addEventListener('online',o);addEventListener('offline',o);if(!location.hash)go('home');return()=>{removeEventListener('hashchange',h);removeEventListener('online',o);removeEventListener('offline',o)}},[])
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem(THEME,theme);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f5f8f8':'#0b1115')},[theme])
 const refresh=async()=>{setRows(await getAllProgress());setSessions(await getRecentSessions(30))}
 useEffect(()=>{Promise.all([loadBankIndex(),refresh()]).then(([b])=>setBank(b)).finally(()=>setBusy(false))},[])
 const pm=useMemo(()=>new Map(rows.map(x=>[x.questionId,x])),[rows])
 const stats=useMemo(()=>{const seen=rows.filter(x=>x.attempts).length,mastered=rows.filter(x=>getStatus(x)==='mastered').length,review=rows.filter(x=>needsReview(x)).length,fav=rows.filter(x=>x.favorite).length,attempts=rows.reduce((a,x)=>a+x.attempts,0),correct=rows.reduce((a,x)=>a+x.correct,0),total=bank?.totalQuestions||0;return{seen,mastered,review,fav,attempts,correct,total,acc:percent(correct,attempts),coverage:percent(seen,total)}},[rows,bank])
 async function start(type:'study'|'exam',source:StudySource,count:number,label:string,meta?:QuestionnaireMeta){
  setLoad(0);let pool=meta?await loadQuestionnaire(meta):await loadAllQuestions((d,t)=>setLoad(percent(d,t)));setLoad(null)
  if(source==='unseen')pool=pool.filter(q=>!pm.get(q.id)?.attempts)
  if(source==='errors')pool=pool.filter(q=>needsReview(pm.get(q.id)))
  if(source==='favorites')pool=pool.filter(q=>pm.get(q.id)?.favorite)
  if(source==='smart')pool=chooseSmartQuestions(pool,pm,Math.min(count,pool.length))
  else if(source==='questionnaire')pool=[...pool].sort((a,b)=>{const score={review:0,unseen:1,learning:2,mastered:3};return score[getStatus(pm.get(a.id))]-score[getStatus(pm.get(b.id))]||Math.random()-.5}).slice(0,count)
  else pool=shuffle(pool).slice(0,count)
  if(!pool.length){alert(source==='errors'?'No tienes errores pendientes.':source==='favorites'?'No tienes favoritas todavía.':'No hay preguntas con ese filtro.');return}
  const s:ActiveSession={type,source,label,questionIds:pool.map(q=>q.id),questionnaireId:meta?.id,currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()};localStorage.setItem(activeKey(),JSON.stringify(s));go('quiz')
 }
 if(busy||!bank)return <Loading text="Preparando RutaCAP…"/>
 const props={bank,rows,pm,stats,sessions,start}
 const generalKeys=new Set(bank.questionnaires.map(q=>q.section+':'+q.questionnaireId))
 const bankSeen=rows.filter(x=>x.attempts>0&&generalKeys.has(x.questionnaireId)).length
 return <div className={page==='quiz'?'app pro-quiz-page':'app'}>
  <header><button className="logo" aria-label="Inicio RutaCAP" onClick={()=>go('home')}><ProBrand/></button><div className="pro-current-page">{page==='home'?'':({general:'Banco general',study:'Estudio',questionnaires:'Cuestionarios',exam:'Test general',quiz:'Test en curso',results:'Resultado',stats:'Progreso',settings:'Perfil'} as Record<string,string>)[page]}{!online&&<small>Sin conexión</small>}</div><button className="gear" aria-label="Perfil y ajustes" onClick={()=>go('settings')}><ProIcon name="person"/></button></header>
  {PREVIEW&&<div className="cap-preview-banner" role="status"><strong>PREVIEW</strong><span>Datos locales · Sin sincronización</span></div>}
  <main>{load!==null&&<div className="overlay"><Loading text={'Preparando preguntas… '+load+'%'}/></div>}{page==='home'&&<CapHome pm={pm} bankCount={bank.totalQuestions} seenCount={bankSeen} regionCode={regionCode} onRegionChange={changeRegion}/>} {page==='general'&&<Home {...props}/>} {page==='study'&&<Study {...props}/>}  {page==='questionnaires'&&<Questionnaires {...props}/>} {page==='exam'&&<Exam {...props}/>} {page==='quiz'&&<Quiz pm={pm} refresh={refresh}/>} {page==='results'&&<Results/>} {page==='stats'&&<Stats {...props}/>} {page==='settings'&&<Settings theme={theme} setTheme={setTheme} bank={bank} refresh={refresh} userEmail={userEmail} onSignOut={onSignOut} regionCode={regionCode} onRegionChange={changeRegion}/>}</main>
  {!['quiz','results','settings','questionnaires'].includes(page)&&<nav aria-label="Navegación principal"><button className={page==='home'?'on':''} onClick={()=>go('home')}><ProIcon name="home"/><span>Inicio</span></button><button className={page==='general'||page==='study'?'on':''} onClick={()=>go('general')}><ProIcon name="bank"/><span>Banco</span></button><button className={page==='exam'?'on':''} onClick={()=>go('exam')}><ProIcon name="flag"/><span>Test general</span></button><button className={page==='stats'?'on':''} onClick={()=>go('stats')}><ProIcon name="chart"/><span>Progreso</span></button></nav>}
 </div>
}

type P={bank:BankIndex;rows:QuestionProgress[];pm:Map<string,QuestionProgress>;stats:any;sessions:StudySessionRecord[];start:(t:'study'|'exam',s:StudySource,c:number,l:string,m?:QuestionnaireMeta)=>Promise<void>}


const capDecision = (q:Question):CapEditorialDecision|null =>
 (q as Question & {editorialDecision?:CapEditorialDecision}).editorialDecision || null

function CapHome({pm,bankCount,seenCount,regionCode,onRegionChange}:{pm:Map<string,QuestionProgress>;bankCount:number;seenCount:number;regionCode:RegionCode;onRegionChange:(code:RegionCode)=>void}){
 const [index,setIndex]=useState<CapExamIndex|null>(null)
 const [editorialTriage,setEditorialTriage]=useState<CapEditorialTriage|null>(null)
 const [category,setCategory]=useState<CapCategory>('mercancias')
 const [mode,setMode]=useState<'study'|'exam'>('exam')
 const [timed,setTimed]=useState(true)
 const [count,setCount]=useState(100)
 const [showConvocations,setShowConvocations]=useState(false)
 const [topDialogOpen,setTopDialogOpen]=useState(false)
 const [topCounts,setTopCounts]=useState<{three:number;four:number}|null>(null)
 const [replaceRequest,setReplaceRequest]=useState<{source:'cap-original'|'cap-random'|'cap-mixed'|'cap-top100'|'cap-top3'|'cap-top4'|'cap-errors'|'cap-favorites'|'cap-review';chosen?:CapExamMeta}|null>(null)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [pendingId,setPendingId]=useState('')
 const [pendingRows,setPendingRows]=useState<CapPendingQuestion[]>([])
 const [pendingShown,setPendingShown]=useState(false)
 const [pendingBusy,setPendingBusy]=useState(false)
 const [sheetReviewId,setSheetReviewId]=useState('')
 const [sheetReviewRows,setSheetReviewRows]=useState<CapSheetReviewQuestion[]>([])
 const [sheetReviewBusy,setSheetReviewBusy]=useState(false)
 const [sheetReviewShown,setSheetReviewShown]=useState(false)
 const [sheetReviewOnlyIssues,setSheetReviewOnlyIssues]=useState(false)
 useEffect(()=>{Promise.all([loadCapIndex(),loadCapEditorialTriage()]).then(([ix,tri])=>{setIndex(ix);setEditorialTriage(tri)}).catch(e=>setError(String(e)))},[])
 useEffect(()=>{setPendingId('');setPendingRows([]);setPendingShown(false);setSheetReviewId('');setSheetReviewRows([]);setSheetReviewShown(false)},[category])
 useEffect(()=>{
  if(!topDialogOpen||category!=='mercancias')return
  let live=true
  loadAllCapQuestions('mercancias').then(rows=>{
   if(live)setTopCounts({
    three:frequentExamQuestionsAtOrAbove(rows,3).length,
    four:frequentExamQuestionsAtOrAbove(rows,4).length
   })
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e))})
  return()=>{live=false}
 },[topDialogOpen,category])
 function openConvocations(){setShowConvocations(true);requestAnimationFrame(()=>document.getElementById('cap-historicos')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}))}
 function closeConvocations(){setShowConvocations(false);requestAnimationFrame(()=>{const trigger=document.getElementById('focus-convocation-trigger');trigger?.focus({preventScroll:true});trigger?.scrollIntoView({behavior:'smooth',block:'center'})})}
 const exams=(index?.exams||[]).filter(x=>x.category===category).sort((a,b)=>b.date.localeCompare(a.date)||a.model.localeCompare(b.model))
 const available=exams.filter(x=>x.hasOriginalAnswerSheet)
 const pretty=(x:CapExamMeta)=>new Date(x.date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'})+(x.model==='GLOBAL'?'':' · modelo '+x.model)
 async function showPending(){
  const selected=exams.find(x=>x.id===pendingId)
  if(!selected)return
  setPendingBusy(true);setError('')
  try{setPendingRows(await loadCapPendingQuestions(selected));setPendingShown(true)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setPendingBusy(false)}
 }
 async function showSheetReview(){
  const selected=exams.find(x=>x.id===sheetReviewId)
  if(!selected)return
  setSheetReviewBusy(true);setError('')
  try{setSheetReviewRows(await loadCapSheetReview(selected));setSheetReviewShown(true)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSheetReviewBusy(false)}
 }
 const showSheetRows=sheetReviewOnlyIssues?sheetReviewRows.filter(q=>q.reviewPriority!=='P4'||!!q.r22Case||!!q.r23Case||!!q.r24Case||!!q.technicalDecision):sheetReviewRows
 const selectedTriage=editorialTriage?.exams.find(e=>e.examId===sheetReviewId)
 async function begin(source:'cap-original'|'cap-random'|'cap-mixed'|'cap-top100'|'cap-top3'|'cap-top4'|'cap-errors'|'cap-favorites'|'cap-review',chosen?:CapExamMeta,replaceConfirmed=false){
  setError('')
  const existing=localStorage.getItem(activeKey())||sessionStorage.getItem(activeKey())
  if(existing&&!replaceConfirmed){setReplaceRequest({source,chosen});return}
  setWorking(true)
  try{
   let questions:Question[]=[]
   let label=''
   const practiceSource=['cap-errors','cap-favorites','cap-review'].includes(source)
   const runMode=practiceSource?'study':mode
   const real=runMode==='exam'&&timed&&!['cap-top3','cap-top4'].includes(source)
   if(['cap-mixed','cap-top100','cap-top3','cap-top4','cap-errors','cap-favorites','cap-review'].includes(source)){
    const rows=await loadAllCapQuestions(category)
    if(['cap-top100','cap-top3','cap-top4'].includes(source)){
     if(category!=='mercancias')throw new Error('Los tests de frecuencia de Viajeros requieren plantillas verificadas.')
     // Stable selection from the same historical frequencies as the original Top 100.
     const top=source==='cap-top100'?mostFrequentExamQuestions(rows,100)
       :frequentExamQuestionsAtOrAbove(rows,source==='cap-top3'?3:4)
     if(!top.length||(source==='cap-top100'&&top.length!==100))
      throw new Error('No hay suficientes preguntas distintas y puntuables para este filtro.')
     questions=shuffle(top)
     label=source==='cap-top100'?'CAP Mercancías · Top 100 más repetidas'
       :'CAP Mercancías · Desde '+(source==='cap-top3'?'3':'4')+' repeticiones · '+top.length+' preguntas'
    }else{
     let pool=uniqueExamQuestions(shuffle(rows))
     if(source==='cap-errors')pool=pool.filter(x=>needsReview(pm.get(x.progressId||x.id)))
     if(source==='cap-favorites')pool=pool.filter(x=>pm.get(x.progressId||x.id)?.favorite)
     if(source==='cap-review')pool=pool.sort((a,b)=>smartScore(pm.get(b.progressId||b.id))-smartScore(pm.get(a.progressId||a.id)))
     questions=source==='cap-review'?pool.slice(0,20):shuffle(pool).slice(0,source==='cap-mixed'?(real?100:count):20)
     label=source==='cap-errors'?'CAP Mercancías · mis errores':source==='cap-favorites'?'CAP Mercancías · favoritas':source==='cap-review'?'CAP Mercancías · repaso inteligente':'CAP Mercancías · mezclado · '+questions.length+' preguntas'
    }
   }else{
    const meta=chosen||(available.length?shuffle(available)[0]:undefined)
    if(!meta)throw new Error('No hay convocatorias con plantilla disponibles para esta modalidad.')
    questions=await loadCapQuestions(meta)
    label='CAP '+(category==='mercancias'?'Mercancías':'Viajeros')+' · '+pretty(meta)
    if(questions.length!==(meta.expectedCount||100))throw new Error('Esta convocatoria aún no reúne sus 100 preguntas originales; se conserva sin iniciar examen.')
   }
   if(!questions.length)throw new Error(source==='cap-errors'?'¡Vas bien! No tienes errores pendientes de Mercancías.':source==='cap-favorites'?'Aún no has guardado preguntas favoritas. Pulsa la estrella de una pregunta para añadirla.':'No hay preguntas disponibles para esta selección.')
   if(real&&questions.length!==100)throw new Error('El simulacro real necesita 100 preguntas. Puedes elegir práctica sin reloj.')
   if(!questions.every(q=>q.id.startsWith('cap:')&&!!q.examId))throw new Error('Seguridad del banco CAP: se ha bloqueado una pregunta ajena a los exámenes históricos.')
   const session:ActiveSession={type:runMode,source,label,questionIds:questions.map(q=>q.id),
    currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now(),
    timed:real,durationMinutes:real?CAP_DURATION_MINUTES:undefined,markedIds:[]}
   localStorage.setItem(activeKey(),JSON.stringify(session))
   sessionStorage.removeItem(activeKey())
   go('quiz')
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setWorking(false)}
 }
 if(!index&&!error)return <Loading text="Preparando exámenes CAP…"/>
 const savedSession=(()=>{try{return JSON.parse(localStorage.getItem(activeKey())||sessionStorage.getItem(activeKey())||'null') as ActiveSession|null}catch{return null}})()
 return <div className="page cap-page focus-home">
  {savedSession&&<section className="focus-resume" role="status">
   <div><strong>Test sin terminar</strong><p>{savedSession.label} · {Object.keys(savedSession.selectedAnswers).length} respuestas guardadas</p></div>
   <button className="btn light" onClick={()=>go('quiz')}>Continuar</button>
  </section>}
  <CommercialHome regionCode={regionCode} onRegionChange={onRegionChange} bankCount={bankCount} seenCount={seenCount} hasArchive={available.length>0&&category==='mercancias'} archiveCount={available.length} working={working} onBank={()=>go('general')} onErrors={()=>void begin('cap-errors')} onFavorites={()=>void begin('cap-favorites')} onTop={()=>{setTopCounts(null);setTopDialogOpen(true)}} onExam={()=>{setMode('exam');setTimed(true);document.getElementById('pro-exam-setup')?.scrollIntoView({behavior:'smooth',block:'start'})}} onStats={()=>go('stats')}/>
  <section id="pro-exam-setup" className="focus-hero" aria-labelledby="focus-title">
   <div className="focus-eyebrow"><span className="focus-status-dot"/> RUTACAP · MERCANCÍAS</div>
   <h1 id="focus-title">Configura tu práctica.</h1>
   <p>Exámenes reales, sin distracciones. Empieza con una convocatoria completa o estudia a tu ritmo.</p>
   <div className="focus-facts"><span>100 preguntas</span><span>120 minutos</span><span>+1 / −0,5 / 0</span></div>
   <div className="focus-choice" role="group" aria-label="Modo de corrección">
    <button type="button" className={mode==='exam'?'on':''} aria-pressed={mode==='exam'} onClick={()=>setMode('exam')}>Examen</button>
    <button type="button" className={mode==='study'?'on':''} aria-pressed={mode==='study'} onClick={()=>setMode('study')}>Estudio</button>
   </div>
   {mode==='exam'&&<div className="focus-timer-toggle" role="group" aria-label="Cronómetro">
    <button className={timed?'on':''} aria-pressed={timed} onClick={()=>setTimed(true)}>Simulacro real · 2 h</button>
    <button className={!timed?'on':''} aria-pressed={!timed} onClick={()=>setTimed(false)}>Práctica sin reloj</button>
   </div>}
   <button className="focus-primary" disabled={!available.length||working} onClick={()=>void begin('cap-random')}>
     <span>{working?'Preparando…':mode==='study'?'Empezar estudio de 100 preguntas':timed?'Comenzar simulacro real':'Empezar examen sin reloj'}</span><span aria-hidden="true">→</span>
   </button>
   <small>{available.length} convocatorias con plantilla · corrección {mode==='study'?'inmediata':'solo al entregar'}{mode==='exam'&&timed?' · reloj sin pausa':''}</small>
   {category==='mercancias'&&index?.mercanciasTemplateStats&&<p className="focus-unique-count">
    <strong>{index.mercanciasTemplateStats.uniqueQuestions.toLocaleString('es-ES')}</strong> preguntas distintas
    <span>en {index.mercanciasTemplateStats.templateExamModels} exámenes con plantilla ({index.mercanciasTemplateStats.originalAppearances.toLocaleString('es-ES')} apariciones). {index.mercanciasTemplateStats.uniqueScorableQuestions.toLocaleString('es-ES')} distintas aptas para tests mezclados.</span>
   </p>}
  </section>
  {error&&<div className="focus-notice" role="alert"><span aria-hidden="true">ⓘ</span><span>{error}</span><button type="button" aria-label="Cerrar aviso" onClick={()=>setError('')}>×</button></div>}
  {topDialogOpen&&<TopFrequencyDialog counts={topCounts} onCancel={()=>setTopDialogOpen(false)}
   onSelect={source=>{setTopDialogOpen(false);void begin(source)}}/>}
  {replaceRequest&&<ConfirmDialog
    title="¿Quieres empezar otro test?"
    message="Tienes un test guardado. Si empiezas uno nuevo, las respuestas de ese test se sustituirán. Puedes volver al anterior sin perderlas."
    confirmLabel="Empezar nuevo test"
    cancelLabel="Conservar mi test"
    onCancel={()=>setReplaceRequest(null)}
    onConfirm={()=>{const request=replaceRequest;setReplaceRequest(null);void begin(request.source,request.chosen,true)}}
  />}
  <section className="focus-practices" aria-labelledby="focus-other">
   <div className="focus-section-heading"><h2 id="focus-other">Otras formas de practicar</h2><p>Elige una convocatoria, combina preguntas o repasa lo que más necesitas.</p></div>
   <div className="focus-practice-grid">
    <button id="focus-convocation-trigger" type="button" aria-expanded={showConvocations} aria-controls={showConvocations?'cap-historicos':undefined} onClick={()=>showConvocations?closeConvocations():openConvocations()}><span className="focus-choice-icon">▦</span><span><b>Por convocatoria</b><small>Fecha y modelo originales</small></span><span aria-hidden="true">{showConvocations?'⌃':'›'}</span></button>
    <button disabled={category!=='mercancias'||!available.length||working} onClick={()=>{setTopCounts(null);setTopDialogOpen(true)}}><span className="focus-choice-icon">★</span><span><b>Top más repetidas</b><small>Top 100 · desde 3 o 4 repeticiones</small></span><span aria-hidden="true">›</span></button>
    <button disabled={!available.length||working} onClick={()=>void begin('cap-mixed')}><span className="focus-choice-icon">⤨</span><span><b>Examen mezclado</b><small>Sin preguntas duplicadas</small></span><span aria-hidden="true">›</span></button>
    <button disabled={working} onClick={()=>void begin('cap-errors')}><span className="focus-choice-icon">↺</span><span><b>Mis errores</b><small>Repasa las respuestas falladas</small></span><span aria-hidden="true">›</span></button>
    <button disabled={working} onClick={()=>void begin('cap-review')}><span className="focus-choice-icon">✦</span><span><b>Repaso inteligente</b><small>Prioriza las preguntas difíciles</small></span><span aria-hidden="true">›</span></button>
    <button disabled={working} onClick={()=>void begin('cap-favorites')}><span className="focus-choice-icon">☆</span><span><b>Favoritas</b><small>Tus preguntas guardadas</small></span><span aria-hidden="true">›</span></button>
   </div>
  </section>
  <details className="focus-options">
   <summary>Opciones de práctica y archivo</summary>
   <div className="focus-options-inner">
    <p className="focus-muted">El examen real usa siempre 100 preguntas y 120 minutos. Los tests de estudio pueden ser más cortos.</p>
    <label>Preguntas en examen mezclado sin reloj</label>
    <div className="segments">{[10,20,30,50,100].map(x=><button key={x} className={count===x?'on':''} onClick={()=>setCount(x)}>{x}</button>)}</div>
    <label>Archivo por modalidad</label>
    <div className="segments"><button className={category==='mercancias'?'on':''} onClick={()=>setCategory('mercancias')}>Mercancías</button><button className={category==='viajeros'?'on':''} onClick={()=>setCategory('viajeros')}>Viajeros · pendiente</button></div>
    {category==='viajeros'&&<p className="note">Viajeros permanece archivado, sin mezclar sus preguntas ni inventar soluciones hasta verificar su plantilla.</p>}
   </div>
  </details>
  {showConvocations&&<section id="cap-historicos" className="pro-convocation-archive" aria-label="Convocatorias históricas CAP" tabIndex={-1}>
   <div className="focus-convocation-heading"><div><h2>Por convocatoria</h2><p>{exams.length} modelos · {available.length} con plantilla</p></div><button className="focus-convocation-close" type="button" onClick={closeConvocations} aria-label="Cerrar listado de convocatorias">Cerrar <span aria-hidden="true">×</span></button></div>
   <div className="pro-archive-filter" role="group" aria-label="Modalidad del archivo"><button type="button" className={category==='mercancias'?'on':''} aria-pressed={category==='mercancias'} onClick={()=>setCategory('mercancias')}>Mercancías</button><button type="button" className={category==='viajeros'?'on':''} aria-pressed={category==='viajeros'} onClick={()=>setCategory('viajeros')}>Viajeros</button></div>
   <p className="pro-archive-disclaimer">Archivo general · procedencia territorial en revisión. {category==='viajeros'?'Las convocatorias sin plantilla no se pueden iniciar.':''}</p>
   {[...new Set(exams.map(e=>e.date.slice(0,4)))].map(year=>{const group=exams.filter(e=>e.date.startsWith(year));return <section className="pro-archive-year" key={year}><div className="pro-year-heading"><h3>{year}</h3><span>{group.length} {group.length===1?'modelo':'modelos'}</span></div><div className="list">{group.map(e=><button className="pro-exam-row" key={e.id} data-exam-id={e.id} data-source-pages={e.sourcePageStart+'–'+e.sourcePageEnd} data-disputed={e.disputedCount||0} disabled={!e.hasOriginalAnswerSheet||working} onClick={()=>void begin('cap-original',e)}><span className="pro-exam-date"><b>{e.date.slice(8,10)}</b><small>{new Date(e.date+'T12:00:00').toLocaleDateString('es-ES',{month:'short'}).replace('.','')}</small></span><span className="pro-exam-info"><b>{e.model==='GLOBAL'?'Modelo global':'Modelo '+e.model}</b><small>{e.hasOriginalAnswerSheet?(e.disputedCount?e.readyCount+' puntuables · '+e.disputedCount+' sin puntuar':(e.expectedCount||100)+' preguntas · Con plantilla'):'Sin plantilla'}</small></span><span className="pro-exam-chevron" aria-hidden="true">›</span></button>)}</div></section>})}
  </section>}
  <details className="focus-editorial"><summary>Auditoría editorial · consulta avanzada</summary><div className="focus-editorial-inner">
  <section className="panel cap-pending-panel">
   <h2>Auditoría editorial · 26 convocatorias</h2>
   <p>Revisa las 100 preguntas de cada examen con sus marcas: conflicto de respuestas, texto sospechoso, desfase de numeración o falta de cotejo. P0 significa prioridad máxima, no una respuesta declarada errónea. Las letras impresas y el banco original no se alteran; R27/R28/R29/R30/R31 distinguen la clave histórica de la técnica.</p>
   <select aria-label="Examen a revisar con plantilla" value={sheetReviewId} onChange={e=>{setSheetReviewId(e.target.value);setSheetReviewShown(false);setSheetReviewRows([])}}>
    <option value="">Seleccionar convocatoria</option>
    {exams.map(e=><option key={e.id} value={e.id}>{pretty(e)} · {e.hasOriginalAnswerSheet?'con plantilla':'sin plantilla'}</option>)}
   </select>
   <Btn kind="light" disabled={!sheetReviewId||sheetReviewBusy} onClick={()=>void showSheetReview()}>{sheetReviewBusy?'Leyendo…':'Auditar las 100 preguntas'}</Btn>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/editorial_triage_r21.csv'} download="CAP_R21_2600_marcas_editoriales.csv">Exportar las 2.600 preguntas y sus marcas (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/editorial_casebook_r22.csv'} download="CAP_R22_revision_306_casos.csv">Exportar expediente R22: 300 preguntas + 6 reconstrucciones (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/editorial_casebook_r23.csv'} download="CAP_R23_revision_1000_preguntas.csv">Exportar R23: 10 modelos de 2025–2026 · 1.000 preguntas (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/editorial_casebook_r24.csv'} download="CAP_R24_mercancias_2022_2024_con_plantilla.csv">Exportar R24: 10 modelos de Mercancías 2022–2024 · 1.000 preguntas (CSV)</a></p>
   <p className="note">Fase final aplazada: Viajeros y modelos sin plantilla. El CSV R24 solo incluye Mercancías con respuestas originales.</p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/editorial_decisions_r25_three.csv'} download="CAP_cierre_3_conflictos_editoriales.csv">Exportar cierre editorial de las 3 contradicciones (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r27_cross_model.json'} download="CAP_R27_cotejo_modelos.json">Cotejo de las 21 incidencias con otros modelos (JSON)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r28.csv'} download="CAP_R28_coherencia_25.csv">Exportar 25 decisiones de coherencia R28 (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r28_queue.json'} download="CAP_R28_candidatos.json">Cola histórica R28 (resuelta en R29, JSON)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r31.csv'} download="CAP_R31_revision_178.csv">Exportar revisión R31 (178 apariciones, CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r30.csv'} download="CAP_R30_revision_87.csv">Exportar revisión R30 de 87 apariciones (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r29.csv'} download="CAP_R29_revision_62.csv">Exportar las 62 revisiones R29 (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/technical_review_r27.csv'} download="CAP_R27_revision_tecnica_21.csv">Exportar 21 decisiones técnicas R27 (CSV)</a></p>
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/sheet_audit_2400.csv'} download="CAP_2400_respuestas_plantillas_revision.csv">CSV de las 2.400 respuestas impresas</a></p>
   {sheetReviewShown&&<div className="cap-pending-results">
    <strong>{sheetReviewRows.length} preguntas · {sheetReviewRows.filter(q=>!q.scoringEligible).length} sin puntuación · {sheetReviewRows.filter(q=>q.reviewPriority!=='P4'||!!q.r22Case||!!q.r23Case||!!q.r24Case||!!q.technicalDecision).length} con alguna marca o decisión editorial</strong>
    {selectedTriage&&<p className="cap-triage-summary"><b>Prioridad:</b> P0 {selectedTriage.P0} · P1 {selectedTriage.P1} · P2 {selectedTriage.P2} · P3 {selectedTriage.P3} · sin alertas P4 {selectedTriage.P4}. Texto con revisión pendiente: {selectedTriage.pendingVisualTranscription}.</p>}
    <label><input type="checkbox" checked={sheetReviewOnlyIssues} onChange={e=>setSheetReviewOnlyIssues(e.target.checked)}/> Mostrar solo preguntas marcadas para revisión (P0–P3)</label>
    <p>{showSheetRows.length} preguntas visibles. Abre cada fila para contrastar las cuatro opciones.</p>
    {showSheetRows.map(q=><details className="cap-pending-item" key={q.number}>
     <summary>Pregunta {q.number} · página {q.sourcePage} · {q.r24Case?.priority==='P0'?'R24 PRIORIDAD ALTA ·':q.r24Case?.status==='GRAFIA_RESTAURADA_REVERSIBLE'?'R24 TEXTO CORREGIDO ·':q.r23Case?.priority==='P0'?'R23 PRIORIDAD ALTA ·':q.r23Case?.status==='LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA'?'R23 LECTURAS DIVERGENTES ·':q.r22Case?.status==='DUDOSA_TECNICA_FRENTE_DGT'?'DUDOSA ·':q.r22Case?.status==='TEXTO_CONTRASTADO_FUENTE_PUBLICA'?'TEXTO CONTRASTADO ·':''} {q.editorialDecision?'INCIDENCIA DOCUMENTADA':q.reviewPriority!=='P4'?q.reviewPriority+' · COTEJAR':'sin alertas automáticas'} · plantilla: {q.originalSheetAnswer||'—'}{!q.scoringEligible?' · SIN PUNTUAR':''}{q.originalSheetAnswer&&q.mappedSheetQuestionNumber!==q.originalSheetQuestionNumber?' · ajuste de numeración':''}</summary>
     <p>{q.question}</p>
     <ol type="A">{keys.map(k=><li key={k}>{q.options[k]}</li>)}</ol>
     {q.technicalDecision&&<div className="cap-r25-final"><b>{q.technicalDecision.round||'R27'} · {q.technicalDecision.action==='correct'?'CORRECCIÓN TÉCNICA':q.technicalDecision.action==='exclude'?'NO PUNTÚA':'MATIZ'}</b><p>Plantilla original: {q.technicalDecision.historicalAnswer} · Técnica: {q.technicalDecision.technicalAnswer||'Sin opción única'}</p><p>{q.technicalDecision.reason}</p>{q.technicalDecision.sources.map(url=><p key={url}><a href={url} target="_blank" rel="noreferrer">Fuente documental</a></p>)}<small>No constituye fe de erratas oficial.</small></div>}
     {q.editorialDecision&&<div className="cap-r25-final"><b>DECISIÓN EDITORIAL CERRADA · NO PUNTÚA</b><p>{q.editorialDecision.decision}</p><p><strong>Plantilla original:</strong> {q.editorialDecision.originalSheetAnswer} · <strong>Banco:</strong> {q.editorialDecision.bankAnswer} · <strong>Orientación técnica:</strong> {q.editorialDecision.editorialAnswer||'Pregunta inválida; sin solución'}</p><small>No se ha confirmado una fe de erratas oficial. La pregunta se muestra para estudiar y no suma ni resta puntos.</small></div>}
     {q.reviewFlags.length>0&&<div className="cap-editorial-flags"><b>Marcas de revisión (no corrigen claves):</b>{q.reviewFlags.map(f=><p key={f.code}><strong>{f.priority} · {f.code.replaceAll('_',' ')}</strong> — {f.description}. <small>{f.evidence}</small></p>)}</div>}
     {q.textReviewRequired&&<small>La transcripción del texto sigue pendiente de cotejo editorial con la imagen fuente.</small>}
     {q.r22Case&&<div className="cap-r22-case"><b>R22 · {q.r22Case.status.replaceAll('_',' ')}</b><p>{q.r22Case.explanation}</p><small>Procedencia: {q.r22Case.source}</small></div>}
     {q.r23Case&&<div className="cap-r23-case"><b>R23 · {q.r23Case.status.replaceAll('_',' ')}</b><p>{q.r23Case.reason}</p>{q.r23Case.unverifiedTextExtractionLetter&&<p><strong>Lectura textual no verificada:</strong> {q.r23Case.unverifiedTextExtractionLetter} · <strong>Hoja original verificada:</strong> {q.r23Case.visuallyVerifiedOriginalSheetLetter}. La lectura alternativa no sustituye la clave oficial.</p>}<small>Evidencia: {q.r23Case.evidenceType}{q.r23Case.sourceUrl?' · '+q.r23Case.sourceUrl:''}. No cambia puntuación.</small></div>}
     {q.r24Case&&<div className="cap-r23-case"><b>R24 · {q.r24Case.status.replaceAll('_',' ')}</b><p>{q.r24Case.reason}</p><small>Evidencia: {q.r24Case.evidenceType}{q.r24Case.sourceUrl?' · '+q.r24Case.sourceUrl:''}. Conservar la letra original, sin cambio de puntuación.</small></div>}
     {q.r22TextCorrection&&<details className="cap-r22-original"><summary>Texto de origen conservado · corrección {q.r22TextCorrection.round||'R22'}</summary><p><b>Antes:</b> {q.r22TextCorrection.originalQuestion}</p><ol type="A">{keys.map(k=><li key={k}>{q.r22TextCorrection?.originalOptions[k]}</li>)}</ol><small>{q.r22TextCorrection.reviewStatus.replaceAll('_',' ')}</small></details>}
     <p><b>Hoja original:</b> {q.originalSheetAnswer?'nº '+q.originalSheetQuestionNumber+' = '+q.originalSheetAnswer+' · '+q.originalSheetSourceFile:'No existe plantilla original para esta convocatoria'}</p>
     {q.originalSheetAnswer&&q.mappedSheetQuestionNumber!==q.originalSheetQuestionNumber&&<p><b>Correspondencia editorial:</b> fila {q.mappedSheetQuestionNumber||'sin asignar'} = {q.mappedSheetAnswer||'—'}. La hoja original no se modifica.</p>}
     <p><b>Banco:</b> {q.bankAnswer||'Sin coincidencia'} · <b>Solución aplicada:</b> {q.correctAnswer||'Bloqueada; no puntúa'}</p>
     {q.answerDispute&&<p><b>Conflicto:</b> plantilla {q.answerDispute.pdfAnswer}, banco {q.answerDispute.bankAnswer}. {q.answerDispute.reason}</p>}
     {!q.scoringEligible&&<small>Esta pregunta está incluida en el examen, pero no suma ni resta puntos.</small>}
    </details>)}
   </div>}
  </section>
  <section className="panel cap-pending-panel">
   <h2>Preguntas sin puntuación · cerradas y pendientes</h2>
   <p>Consulta el enunciado original y sus cuatro opciones. Las incidencias históricas y técnicas excluidas no puntúan. No se registran como fallos.</p>
   <select aria-label="Convocatoria con preguntas pendientes" value={pendingId} onChange={e=>{setPendingId(e.target.value);setPendingShown(false);setPendingRows([])}}>
    <option value="">Seleccionar convocatoria</option>
    {exams.filter(e=>e.hasOriginalAnswerSheet&&e.count>e.readyCount).map(e=><option key={e.id} value={e.id}>{pretty(e)} · {e.count-e.readyCount} pendientes</option>)}
   </select>
   <Btn kind="light" disabled={!pendingId||pendingBusy} onClick={()=>void showPending()}>{pendingBusy?'Preparando…':'Consultar sin puntuación'}</Btn>
   {pendingShown&&<div className="cap-pending-results">
    <strong>{pendingRows.length} preguntas sin puntuación; {pendingRows.filter(x=>x.editorialDecision).length} con decisión editorial cerrada</strong>
    {pendingRows.map(q=><details key={q.number} className="cap-pending-item">
     <summary>Pregunta {q.number} · página {q.sourcePage}{q.answerStatus.startsWith('conflicto')?' · Fuentes contradictorias':''}</summary>
     <p>{q.question}</p>
     <ol type="A">{keys.map(k=><li key={k}>{q.options[k]}</li>)}</ol>
     {q.technicalDecision?<div className="cap-r25-final"><b>{q.technicalDecision.round||'R27'} · No puntúa</b><p>Plantilla original: {q.technicalDecision.historicalAnswer}</p><p>{q.technicalDecision.reason}</p></div>:q.editorialDecision?<div className="cap-r25-final"><b>Decisión editorial cerrada · sin puntuación</b><p>{q.editorialDecision.decision}</p><small>Orientación técnica: {q.editorialDecision.editorialAnswer||'pregunta invalidada'} · Sin rectificación oficial acreditada.</small></div>:<small>Solución pendiente de revisión. No se califica esta pregunta.</small>}
    </details>)}
   </div>}
  </section>
  </div></details>
  <button className="btn light" onClick={()=>go('general')}>Abrir banco general · 8.655 preguntas</button>
  <p className="note">Los 24 modelos con plantilla mantienen sus 100 preguntas y las letras originales; las contradicciones documentadas no puntúan. No se duplican ampliaciones en el cómputo de frecuencia. La plantilla B de julio 2025 fue aportada y contrastada; su procedencia oficial no está acreditada.</p>
 </div>
}

function Home({bank,stats,sessions,start}:P){return <div className="page">
 <section className="hero"><div><em>BANCO CAP 2026</em><h1>Estudia a tu ritmo.<br/>Aprende de cada fallo.</h1><p>{bank.totalQuestions.toLocaleString('es-ES')} preguntas · {bank.totalQuestionnaires} cuestionarios</p></div><strong>{stats.coverage}%<small>visto</small></strong></section>
 <div className="metrics"><article><small>Precisión</small><b>{stats.attempts?stats.acc+'%':'—'}</b><span>{stats.attempts} respuestas</span></article><article><small>Dominadas</small><b>{stats.mastered}</b><span>3 aciertos seguidos</span></article><article><small>Por repasar</small><b>{stats.review}</b><span>errores activos</span></article></div>
 <h2>¿Qué quieres hacer?</h2><div className="cards"><button onClick={()=>start('study','smart',20,'Repaso inteligente')}>✦<span><b>Repaso inteligente</b><small>Prioriza lo que más necesitas</small></span>›</button><button onClick={()=>go('questionnaires')}>▦<span><b>Por cuestionario</b><small>Avanza bloque a bloque</small></span>›</button><button onClick={()=>start('study','errors',20,'Mis errores')}>×<span><b>Mis errores</b><small>{stats.review} pendientes</small></span>›</button><button onClick={()=>go('exam')}>✓<span><b>Simulacro</b><small>Corrección al final</small></span>›</button></div>
 {sessions[0]&&<div className="recent"><div><small>ÚLTIMA SESIÓN</small><b>{sessions[0].label}</b></div><strong>{sessions[0].score}%</strong></div>}<p className="note">Herramienta de estudio basada en el banco proporcionado. No es un servicio oficial de la DGT.</p>
 </div>}

function Study({stats,start}:P){return <div className="page"><em>MODO ESTUDIO</em><h1>Corrección inmediata</h1><p>Marca una respuesta, comprueba al instante y consulta la norma o referencia.</p><div className="list">
 {([['✦','Repaso inteligente','smart',20,'Errores, baja precisión y preguntas olvidadas.'],['○','Preguntas nuevas','unseen',20,'Solo preguntas que aún no has contestado.'],['×','Test de errores','errors',20,stats.review+' pendientes de consolidar.'],['★','Favoritas','favorites',20,stats.fav+' guardadas.'],['⤨','Aleatorio','random',20,'20 preguntas de todo el banco.']] as any[]).map(x=><button key={x[2]} onClick={()=>start('study',x[2],x[3],x[1])}><i>{x[0]}</i><span><b>{x[1]}</b><small>{x[4]}</small></span>›</button>)}
 <button onClick={()=>go('questionnaires')}><i>▦</i><span><b>Elegir cuestionario</b><small>Estudia una sección concreta.</small></span>›</button></div><div className="tip"><b>¿Cuándo sale de errores?</b><p>Con 2 aciertos consecutivos deja de estar pendiente. Con 3 pasa a “Dominada”.</p></div></div>}

function Questionnaires({bank,rows,start}:P){return <div className="page"><button className="back" onClick={()=>history.back()}>‹ Volver</button><h1>Cuestionarios</h1>{[...new Set(bank.questionnaires.map(q=>q.section))].map(sec=><section key={sec}><em>SECCIÓN {sec.replace(';',' / ')}</em><div className="qgrid">{bank.questionnaires.filter(q=>q.section===sec).map(m=>{const k=m.section+':'+m.questionnaireId,r=rows.filter(x=>x.questionnaireId===k),seen=r.filter(x=>x.attempts).length,att=r.reduce((a,x)=>a+x.attempts,0),cor=r.reduce((a,x)=>a+x.correct,0),cov=percent(seen,m.count);return <article key={m.id}><div className="qtop"><span>{m.questionnaireId}</span><b>{cov}%</b></div><h3>{m.title}</h3><small>{m.count} preguntas · {seen?percent(cor,att)+'% acierto':'Sin empezar'}</small><Bar v={cov}/><div className="actions"><Btn onClick={()=>start('study','questionnaire',Math.min(20,m.count),m.title+' · estudio',m)}>Estudiar 20</Btn><Btn kind="light" onClick={()=>start('study','questionnaire',m.count,m.title+' · completo',m)}>Todas</Btn></div></article>})}</div></section>)}</div>}

function Exam({bank,stats,start}:P){const [count,setCount]=useState(30),[source,setSource]=useState<StudySource>('random'),[qid,setQid]=useState(bank.questionnaires[0].id);const meta=bank.questionnaires.find(x=>x.id===qid);return <div className="page"><em>SIMULACRO</em><h1>Como un examen</h1><p>No verás la solución hasta finalizar. Las no contestadas quedan en blanco.</p><div className="panel"><label>Número de preguntas</label><div className="segments">{[10,20,30,50].map(n=><button className={count===n?'on':''} onClick={()=>setCount(n)} key={n}>{n}</button>)}</div><label>Contenido</label>{([['random','Todo el banco','Mezcla todos los cuestionarios'],['unseen','Solo nuevas',(stats.total-stats.seen)+' sin ver'],['errors','Solo errores',stats.review+' disponibles'],['questionnaire','Un cuestionario','Elige un bloque concreto']] as any[]).map(x=><button className={'radio '+(source===x[0]?'on':'')} onClick={()=>setSource(x[0])} key={x[0]}><i/><span><b>{x[1]}</b><small>{x[2]}</small></span></button>)}{source==='questionnaire'&&<select value={qid} onChange={e=>setQid(e.target.value)}>{bank.questionnaires.map(q=><option key={q.id} value={q.id}>Sección {q.section} · {q.questionnaireId} ({q.count})</option>)}</select>}<Btn onClick={()=>start('exam',source,count,'Simulacro · '+count,source==='questionnaire'?meta:undefined)}>Comenzar simulacro</Btn></div></div>}

function Results(){
 const data=JSON.parse(localStorage.getItem(lastKey())||sessionStorage.getItem(lastKey())||'null') as {record:StudySessionRecord;questionIds:string[]}|null
 const [qs,setQs]=useState<Question[]>([])
 const [showAll,setShowAll]=useState(false)
 const [pdfBusy,setPdfBusy]=useState(false)
 const [pdfError,setPdfError]=useState('')
 useEffect(()=>{if(data)resolveQuestions(data.questionIds).then(setQs).catch(console.error)},[])
 if(!data)return <Loading/>
 const r=data.record
 const capResult=r.capScoring===true||r.answers.some(a=>a.questionId.startsWith('cap:'))
 const capExam=capResult&&r.type==='exam'
 const capStudy=capResult&&r.type==='study'
 const comparable=capExam&&r.passed!==null&&r.passed!==undefined
 const rebuilt=gradeSession(r.answers,true)
 const netPoints=r.netPoints??rebuilt.netPoints
 const netLabel=netPoints.toLocaleString('es-ES',{maximumFractionDigits:2})
 const resultTitle=capStudy?'Sesión de estudio terminada':capExam?(comparable?(r.passed?'Aprobado':'No aprobado'):'Resultado orientativo'):r.score>=80?'Muy buen resultado':r.score>=60?'Buen intento':'Toca reforzar'
 const resultClass=capStudy?'study':capExam?(comparable?(r.passed?'good':'bad'):'mid'):(r.score>=80?'good':r.score>=60?'mid':'bad')
 const questionMap=new Map(qs.map(q=>[q.id,q]))
 const fails=r.answers.filter(a=>a.scoringEligible!==false&&!!a.selected&&!a.correct)
 const unreviewed=r.answers.filter(a=>a.scoringEligible!==false&&!a.selected)
 const unscored=r.answers.filter(a=>a.scoringEligible===false)
 const visible=showAll?r.answers:fails
 const elapsed=Number.isFinite(r.elapsedSeconds)?Math.max(0,Math.floor(r.elapsedSeconds!)):null
 const elapsedLabel=elapsed===null?'—':Math.floor(elapsed/60).toString().padStart(2,'0')+':'+(elapsed%60).toString().padStart(2,'0')
 const precision=r.correct+r.incorrect?percent(r.correct,r.correct+r.incorrect):null
 async function downloadPdf(){
  if(!data||pdfBusy||qs.length!==data.questionIds.length)return
  setPdfBusy(true);setPdfError('')
  try{
   const {exportExamPdf}=await import('./pdfExport')
   exportExamPdf({label:r.label,questions:qs,withSolutions:true})
  }catch(err){console.error(err);setPdfError('No se pudo generar el PDF. Inténtalo de nuevo.')}
  finally{setPdfBusy(false)}
 }
 async function review(){
  if(!fails.length)return
  const session:ActiveSession={type:'study',source:fails.every(x=>x.questionId.startsWith('cap:'))?'cap-errors':'errors',label:'Repaso del último test',
   questionIds:fails.map(x=>x.questionId),currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()}
  localStorage.setItem(activeKey(),JSON.stringify(session))
  go('quiz')
 }
 return <div className="page pro-results">
  <button className="back" onClick={()=>go('home')}>‹ Inicio</button>
  <h1 className="pro-results-heading">{r.type==='exam'?'Resultado del simulacro':'Resultado del estudio'}</h1>
  <section className={'result '+resultClass}>
   <em>{capStudy?'ESTUDIO CAP · PUNTOS Y PRECISIÓN':capExam?(comparable?'SIMULACRO CAP · 100 PREGUNTAS VÁLIDAS':'CAP · CALIFICACIÓN ORIENTATIVA'):'RESULTADO'}</em>
   <div className="pro-result-score"><ProIcon name="flag"/><div><strong>{capResult?netLabel+(Math.abs(netPoints)===1?' punto':' puntos'):r.score+'%'}</strong><h2 className="pro-result-status">{resultTitle}</h2></div></div>
   <p>{r.label}</p>
   {capResult&&<p className="focus-result-explain"><b>{r.correct} aciertos × 1 − {r.incorrect} fallos × 0,5 = {netLabel} puntos netos.</b> Las preguntas en blanco valen 0.</p>}
   {capStudy&&<p className="focus-result-explain">Precisión entre las {r.correct+r.incorrect} respuestas puntuables contestadas: {r.score.toLocaleString('es-ES',{maximumFractionDigits:2})} %. Los puntos netos no equivalen al porcentaje de aciertos.</p>}
   {capExam&&!comparable&&<p className="focus-result-explain">Se han calificado {r.gradedTotal??r.total} de {r.total} enunciados. Las {r.excluded??0} excluidas no penalizan. Equivalencia orientativa sobre 100 preguntas válidas: {r.score.toLocaleString('es-ES',{maximumFractionDigits:2})} puntos. No equivale a una calificación oficial.</p>}
   {capExam&&comparable&&<p className="focus-result-explain">El umbral del simulacro es de 50 puntos netos sobre 100 preguntas válidas.</p>}
   {r.finishedReason==='timeout'&&<p className="focus-result-explain">Tiempo agotado · entrega automática.</p>}
  </section>
  <div className="metrics pro-result-metrics">
   <article className="pro-metric-good"><span>Aciertos</span><b>{r.correct}</b></article>
   <article className="pro-metric-bad"><span>Fallos</span><b>{r.incorrect}</b></article>
   <article><span>Sin responder</span><b>{unreviewed.length}</b></article>{unscored.length>0&&<article><span>Sin puntuar</span><b>{unscored.length}</b></article>}
   <article><span>Tiempo (min:seg)</span><b>{elapsedLabel}</b></article><article><span>Precisión contestadas</span><b>{precision===null?'—':precision+' %'}</b></article>
  </div>
  <section className="pro-next-steps"><h2>Tus próximos pasos</h2><div className="pro-next-grid">{fails.length>0&&<button className="pro-quick red" onClick={()=>void review()}><ProIcon name="warning"/><span><b>Repasar {fails.length} fallos</b><small>Aprende de tus errores</small></span><span aria-hidden="true">›</span></button>}<button className="pro-quick blue" onClick={()=>go('home')}><ProIcon name="flag"/><span><b>Otra práctica</b><small>Continúa tu preparación</small></span><span aria-hidden="true">›</span></button></div></section>
  <StudyPdfButton busy={pdfBusy} disabled={qs.length!==data.questionIds.length} onClick={()=>void downloadPdf()}/>
  {pdfError&&<p role="alert" className="focus-muted">{pdfError}</p>}
  <h2>Corrección de respuestas</h2>
  <p className="note">En examen puedes comprobar aciertos, fallos y preguntas sin responder. Las preguntas sin responder valen 0 puntos y no se registran como fallos en tu progreso.{unscored.length>0?' Las '+unscored.length+' preguntas con respuestas contradictorias se excluyeron del cálculo y del historial de fallos.':''}</p>
  <Btn kind="light" onClick={()=>setShowAll(v=>!v)}>{showAll?'Ver solo fallos':'Ver todas las respuestas ('+r.answers.length+')'}</Btn>
  <div className="review">
   {visible.length===0&&!showAll&&<p>No hay respuestas incorrectas.</p>}
   {visible.map((answer)=>{
    const q=questionMap.get(answer.questionId)
    if(!q)return null
    const decision=capDecision(q)
    const status=answer.scoringEligible===false?(decision?'Resuelta editorialmente · sin puntuar':'En revisión · sin puntuar'):!answer.selected?'Sin responder':answer.correct?'Correcta':'Incorrecta'
    return <article key={answer.questionId} className={answer.correct?'cap-review-correct':''}>
     <b>{showAll?'Pregunta '+(r.answers.indexOf(answer)+1)+' · ':''}{q.question}</b>
     <p><strong>{status}</strong> · Tu respuesta: {answer.selected?answer.selected+' · '+q.options[answer.selected]:'—'}</p>
     {answer.scoringEligible===false
       ?<><p>Plantilla original: <b>{q.originalSheetAnswer||'—'}</b> · Banco: <b>{q.bankAnswer||'—'}</b></p>{decision?<><p><strong>{decision.editorialAnswer?'Respuesta técnica orientativa: '+decision.editorialAnswer:'Pregunta inválida; sin respuesta técnica'}</strong></p><small>{decision.decision} No puntúa y no se presenta como fe de erratas del tribunal.</small></>:<small>No hay solución aprobada todavía. Esta pregunta no se ha calificado.</small>}</>
       :<><p className="green">Solución aplicada en esa sesión: {answer.correctAnswer} · {q.options[answer.correctAnswer]}</p>{q.reviewRequired&&<small>Solución procedente del cotejo; algunas transcripciones requieren revisión editorial.</small>}</>}
    {q.technicalDecision&&<div className="cap-r25-final"><b>{q.technicalDecision.round||'R27'} · Plantilla {q.technicalDecision.historicalAnswer} · Técnica {q.technicalDecision.technicalAnswer||'sin opción única'}</b><p>{q.technicalDecision.reason}</p><small>Decisión editorial; no rectificación oficial.</small></div>}
    <AnswerProvenance question={q}/>
    </article>
   })}
  </div>
 </div>
}

function Stats({bank,rows,stats,sessions}:P){return <div className="page"><em>TU PREPARACIÓN</em><h1>{stats.attempts?stats.acc+'%':'Empieza hoy'}</h1><p>{stats.attempts?'de precisión global':'Tus estadísticas aparecerán aquí.'}</p><div className="statsgrid"><article><small>Vistas</small><b>{stats.seen}</b><span>de {stats.total}</span></article><article><small>Dominadas</small><b>{stats.mastered}</b></article><article><small>Por repasar</small><b>{stats.review}</b></article><article><small>Favoritas</small><b>{stats.fav}</b></article></div><h2>Progreso por cuestionario</h2><div className="progresslist">{bank.questionnaires.map(m=>{const rr=rows.filter(x=>x.questionnaireId===m.section+':'+m.questionnaireId),seen=rr.filter(x=>x.attempts).length;if(!seen)return null;const att=rr.reduce((a,x)=>a+x.attempts,0),cor=rr.reduce((a,x)=>a+x.correct,0);return <div key={m.id}><span><b>{m.questionnaireId}</b> · Sección {m.section}</span><small>{seen}/{m.count} · {percent(cor,att)}%</small><Bar v={percent(seen,m.count)}/></div>})}</div><h2>Últimas sesiones</h2><div className="history">{sessions.slice(0,10).map((s,i)=><div key={i}><span><b>{s.label}</b><small>{s.total} preguntas</small></span><strong>{s.capScoring?(s.netPoints??(s.correct-0.5*s.incorrect)).toLocaleString('es-ES',{maximumFractionDigits:2})+' pt':s.score+'%'}</strong></div>)}</div></div>}

function Settings({theme,setTheme,bank,refresh,userEmail,onSignOut,regionCode,onRegionChange}:{theme:string;setTheme:(s:string)=>void;bank:BankIndex;refresh:()=>Promise<void>;userEmail:string;onSignOut:()=>Promise<void>;regionCode:RegionCode;onRegionChange:(code:RegionCode)=>void}){async function backup(){const d=await exportDatabase(),b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='rutacap-backup.json';a.click();URL.revokeObjectURL(u)}async function restore(e:any){const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text());if(!Array.isArray(d.progress))return alert('Copia no válida');await importProgress(d.progress);await refresh();alert('Progreso importado')}async function reset(){if(confirm(PREVIEW?'¿Borrar solo los datos de esta versión de pruebas?':'¿Borrar el progreso local de este perfil en este navegador?')){await clearAllData();await refresh()}}return <div className="page"><button className="back" onClick={()=>history.back()}>‹ Volver</button><h1>Mi perfil</h1>{PREVIEW&&<CommercialAccountPreview onContinue={()=>go('home')}/>}<div className="panel pro-profile-region"><small>MI COMUNIDAD</small><div className="pro-profile-region-title"><RegionMark region={regionByCode(regionCode)}/><h2>{regionByCode(regionCode)[1]}</h2></div><label htmlFor="pro-profile-region-select">¿Dónde te presentas?</label><select id="pro-profile-region-select" value={regionCode} onChange={e=>{if(isRegionCode(e.target.value))onRegionChange(e.target.value)}}>{REGIONS.map(r=><option key={r[0]} value={r[0]}>{r[1]}</option>)}</select><p>Preferencia local. El archivo histórico aún no se filtra por comunidad.</p></div><div className="panel account"><small>CUENTA</small><h2>{userEmail}</h2><p>{PREVIEW?'Esta versión guarda el progreso únicamente en este navegador, separado de la aplicación real. No utiliza Supabase.':'Acceso de desarrollo: tus datos permanecen solo en este navegador. La sincronización en la nube no está activada.'}</p>{!PREVIEW&&<Btn kind="light" onClick={()=>void onSignOut()}>{userEmail.startsWith("Modo invitado")?"Salir del modo invitado":"Cerrar sesión"}</Btn>}</div><div className="panel"><label>Tema</label><div className="segments"><button className={theme==='light'?'on':''} onClick={()=>setTheme('light')}>☀ Claro</button><button className={theme==='dark'?'on':''} onClick={()=>setTheme('dark')}>◐ Oscuro</button></div></div><div className="panel"><h2>Copia de seguridad</h2><p>{PREVIEW?'Los datos de prueba se guardan localmente. Puedes exportarlos como respaldo manual.':'Los datos se guardan en este navegador. Exporta una copia si quieres conservarlos.'}</p><div className="actions"><Btn kind="light" onClick={backup}>↓ Exportar</Btn><label className="btn light">↑ Importar<input type="file" accept=".json" hidden onChange={restore}/></label></div></div><div className="panel"><h2>Banco CAP 2026</h2><p>{bank.totalQuestions.toLocaleString('es-ES')} preguntas · {bank.totalQuestionnaires} cuestionarios · {bank.version}</p></div><div className="panel danger"><h2>Empezar de cero</h2><Btn kind="danger" onClick={reset}>Borrar todo mi progreso</Btn></div></div>}

export default App
