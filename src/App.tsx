import { useEffect, useMemo, useState } from 'react'
import Quiz from './Quiz'
import ConfirmDialog from './ConfirmDialog'
import { CAP_DURATION_MINUTES, gradeSession, mostFrequentExamQuestions, uniqueExamQuestions } from './examEngine.mjs'
import type { ActiveSession, AnswerKey, BankIndex, Question, QuestionProgress, QuestionnaireMeta, StudySessionRecord, StudySource } from './types'
import { addSession, clearAllData, clearLocalCache, exportDatabase, getAllProgress, getRecentSessions, importProgress, pushLocalSnapshotToCloud, putProgress, synchronizeAccount } from './db'
import { cloudConfigured, getSession, signIn, signOut, supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'
import { loadAllQuestions, loadBankIndex, loadQuestionnaire, resolveQuestions } from './data'
import { chooseSmartQuestions, getStatus, needsReview, percent, shuffle, smartScore } from './utils'
import { loadCapIndex, loadCapQuestions, loadAllCapQuestions, loadCapPendingQuestions, loadCapSheetReview, loadCapEditorialTriage, type CapEditorialTriage, type CapSheetReviewQuestion, type CapPendingQuestion, type CapCategory, type CapExamMeta, type CapExamIndex, type CapEditorialDecision } from './capExams'

const PREVIEW=import.meta.env.VITE_CAP_PREVIEW === 'true'
const ACTIVE=PREVIEW?'cap-test-beta-active-v1':'cap-test-active-v1',
      LAST=PREVIEW?'cap-test-beta-last-v1':'cap-test-last-v1',
      THEME=PREVIEW?'cap-test-beta-theme':'cap-test-theme'
type Route='home'|'general'|'study'|'questionnaires'|'exam'|'quiz'|'results'|'stats'|'settings'
const route=():Route=>{const r=location.hash.replace(/^#\/?/,'').split('?')[0] as Route;return ['home','general','study','questionnaires','exam','quiz','results','stats','settings'].includes(r)?r:'home'}
const go=(r:Route)=>location.hash='#/'+r
const keys:AnswerKey[]=['A','B','C','D']

function Bar({v}:{v:number}){return <div className="bar"><i style={{width:Math.max(0,Math.min(100,v))+'%'}}/></div>}
function Btn({children,onClick,kind='primary',disabled=false}:{children:any,onClick?:()=>void,kind?:string,disabled?:boolean}){return <button className={'btn '+kind} onClick={onClick} disabled={disabled}>{children}</button>}
function Loading({text='Cargando…'}:{text?:string}){return <div className="center"><span className="spinner"/><b>{text}</b></div>}

function Login({onSuccess}:{onSuccess:(session:Session)=>Promise<void>}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false)
 async function submit(e:React.FormEvent){e.preventDefault();setError('');setSending(true);try{const session=await signIn(email.trim(),password);if(!session)throw new Error('No se pudo iniciar sesión.');await onSuccess(session)}catch(err:any){console.error(err);setError('Email o contraseña no válidos.')}finally{setSending(false)}}
 return <div className="authshell"><section className="authcard"><div className="authlogo">CT</div><em>CAP TEST 2026</em><h1>Tu progreso, siempre contigo.</h1><p>Inicia sesión para conservar resultados, errores y estadísticas en todos tus dispositivos.</p><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="autherror">{error}</div>}<button className="btn primary" disabled={sending}>{sending?'Entrando…':'Entrar'}</button></form><small>Acceso privado. No hay registro público desde esta página.</small></section></div>
}

function App(){
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[syncing,setSyncing]=useState(false)
 useEffect(()=>{let live=true;if(!cloudConfigured||!supabase){setAuthReady(true);return}getSession().then(async current=>{if(!live)return;if(current){setSyncing(true);try{await synchronizeAccount()}finally{if(live)setSyncing(false)}}if(live)setSession(current)}).catch(console.error).finally(()=>{if(live)setAuthReady(true)});return()=>{live=false}},[])
 async function loginDone(next:Session){setSyncing(true);try{await synchronizeAccount();setSession(next)}finally{setSyncing(false);setAuthReady(true)}}
 async function logout(){try{await signOut()}finally{await clearLocalCache();localStorage.removeItem(ACTIVE);localStorage.removeItem(LAST);sessionStorage.removeItem(ACTIVE);sessionStorage.removeItem(LAST);setSession(null)}}
 if(PREVIEW)return <CapApp userEmail="Modo pruebas · solo este navegador" onSignOut={async()=>{}}/>
 if(!cloudConfigured)return <div className="authshell"><section className="authcard"><div className="authlogo">CT</div><h1>Sincronización pendiente</h1><p>La aplicación está preparada para acceso privado, pero falta conectar el proyecto de Supabase.</p></section></div>
 if(!authReady||syncing)return <Loading text={syncing?'Sincronizando tu progreso…':'Comprobando sesión…'}/>
 if(!session)return <Login onSuccess={loginDone}/>
 return <CapApp userEmail={session.user.email||'Usuario'} onSignOut={logout}/>
}

function CapApp({userEmail,onSignOut}:{userEmail:string;onSignOut:()=>Promise<void>}){
 const [page,setPage]=useState<Route>(route()),[bank,setBank]=useState<BankIndex|null>(null),[rows,setRows]=useState<QuestionProgress[]>([]),[sessions,setSessions]=useState<StudySessionRecord[]>([]),[busy,setBusy]=useState(true),[load,setLoad]=useState<number|null>(null),[online,setOnline]=useState(navigator.onLine),[theme,setTheme]=useState(localStorage.getItem(THEME)||'dark')
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
  const s:ActiveSession={type,source,label,questionIds:pool.map(q=>q.id),questionnaireId:meta?.id,currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()};localStorage.setItem(ACTIVE,JSON.stringify(s));go('quiz')
 }
 if(busy||!bank)return <Loading text="Preparando CAP Test…"/>
 const props={bank,rows,pm,stats,sessions,start}
 return <div className="app">
  <header><button className="logo" onClick={()=>go('home')}>CT</button><div><b>{page==='home'?'CAP Test 2026':({general:'Banco general',study:'Modo estudio',questionnaires:'Cuestionarios',exam:'Simulacro general',quiz:'Test en curso',results:'Resultado',stats:'Progreso',settings:'Ajustes'} as any)[page]}</b>{!online&&<small>Sin conexión</small>}</div><button className="gear" onClick={()=>go('settings')}>⚙</button></header>
  {PREVIEW&&<div className="cap-preview-banner" role="status">VERSIÓN DE PRUEBAS · Datos locales · No sincroniza con tu cuenta</div>}
  <main>{load!==null&&<div className="overlay"><Loading text={'Preparando preguntas… '+load+'%'}/></div>}{page==='home'&&<CapHome pm={pm}/>} {page==='general'&&<Home {...props}/>} {page==='study'&&<Study {...props}/>}  {page==='questionnaires'&&<Questionnaires {...props}/>} {page==='exam'&&<Exam {...props}/>} {page==='quiz'&&<Quiz pm={pm} refresh={refresh}/>} {page==='results'&&<Results/>} {page==='stats'&&<Stats {...props}/>} {page==='settings'&&<Settings theme={theme} setTheme={setTheme} bank={bank} refresh={refresh} userEmail={userEmail} onSignOut={onSignOut}/>}</main>
  {!['quiz','results','settings','questionnaires'].includes(page)&&<nav><button className={page==='home'?'on':''} onClick={()=>go('home')}>⌂<span>Exámenes</span></button><button className={page==='general'||page==='study'?'on':''} onClick={()=>go('general')}>▤<span>Banco</span></button><button className={page==='exam'?'on':''} onClick={()=>go('exam')}>✓<span>Test general</span></button><button className={page==='stats'?'on':''} onClick={()=>go('stats')}>◫<span>Progreso</span></button></nav>}
 </div>
}

type P={bank:BankIndex;rows:QuestionProgress[];pm:Map<string,QuestionProgress>;stats:any;sessions:StudySessionRecord[];start:(t:'study'|'exam',s:StudySource,c:number,l:string,m?:QuestionnaireMeta)=>Promise<void>}


const capDecision = (q:Question):CapEditorialDecision|null =>
 (q as Question & {editorialDecision?:CapEditorialDecision}).editorialDecision || null

function CapHome({pm}:{pm:Map<string,QuestionProgress>}){
 const [index,setIndex]=useState<CapExamIndex|null>(null)
 const [editorialTriage,setEditorialTriage]=useState<CapEditorialTriage|null>(null)
 const [category,setCategory]=useState<CapCategory>('mercancias')
 const [mode,setMode]=useState<'study'|'exam'>('exam')
 const [timed,setTimed]=useState(true)
 const [count,setCount]=useState(100)
 const [showConvocations,setShowConvocations]=useState(false)
 const [replaceRequest,setReplaceRequest]=useState<{source:'cap-original'|'cap-random'|'cap-mixed'|'cap-top100'|'cap-errors'|'cap-favorites'|'cap-review';chosen?:CapExamMeta}|null>(null)
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
 function openConvocations(){setShowConvocations(true);requestAnimationFrame(()=>document.getElementById('cap-historicos')?.scrollIntoView({behavior:'smooth',block:'start'}))}
 function closeConvocations(){setShowConvocations(false);document.getElementById('focus-other')?.scrollIntoView({behavior:'smooth',block:'start'})}
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
 const showSheetRows=sheetReviewOnlyIssues?sheetReviewRows.filter(q=>q.reviewPriority!=='P4'||!!q.r22Case||!!q.r23Case||!!q.r24Case):sheetReviewRows
 const selectedTriage=editorialTriage?.exams.find(e=>e.examId===sheetReviewId)
 async function begin(source:'cap-original'|'cap-random'|'cap-mixed'|'cap-top100'|'cap-errors'|'cap-favorites'|'cap-review',chosen?:CapExamMeta,replaceConfirmed=false){
  setError('')
  const existing=localStorage.getItem(ACTIVE)||sessionStorage.getItem(ACTIVE)
  if(existing&&!replaceConfirmed){setReplaceRequest({source,chosen});return}
  setWorking(true)
  try{
   let questions:Question[]=[]
   let label=''
   const practiceSource=['cap-errors','cap-favorites','cap-review'].includes(source)
   const runMode=practiceSource?'study':mode
   const real=runMode==='exam'&&timed
   if(['cap-mixed','cap-top100','cap-errors','cap-favorites','cap-review'].includes(source)){
    const rows=await loadAllCapQuestions(category)
    if(source==='cap-top100'){
     // Select first by historical frequency, then shuffle presentation order.
     if(category!=='mercancias')throw new Error('El Top 100 de Viajeros estará disponible al verificar sus plantillas.')
     const top=mostFrequentExamQuestions(rows,100)
     if(top.length!==100)throw new Error('Aún no hay 100 preguntas distintas y puntuables para el Top 100.')
     questions=shuffle(top)
     label='CAP Mercancías · Top 100 más repetidas'
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
   localStorage.setItem(ACTIVE,JSON.stringify(session))
   sessionStorage.removeItem(ACTIVE)
   go('quiz')
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setWorking(false)}
 }
 if(!index&&!error)return <Loading text="Preparando exámenes CAP…"/>
 const savedSession=(()=>{try{return JSON.parse(localStorage.getItem(ACTIVE)||sessionStorage.getItem(ACTIVE)||'null') as ActiveSession|null}catch{return null}})()
 return <div className="page cap-page focus-home">
  <section className="focus-hero" aria-labelledby="focus-title">
   <div className="focus-eyebrow"><span className="focus-status-dot"/> CAP TEST · MERCANCÍAS</div>
   <h1 id="focus-title">Practica para aprobar.</h1>
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
  {savedSession&&<section className="focus-resume" role="status">
   <div><strong>Test sin terminar</strong><p>{savedSession.label} · {Object.keys(savedSession.selectedAnswers).length} respuestas guardadas</p></div>
   <button className="btn light" onClick={()=>go('quiz')}>Continuar</button>
  </section>}
  {error&&<div className="focus-notice" role="alert"><span aria-hidden="true">ⓘ</span><span>{error}</span><button type="button" aria-label="Cerrar aviso" onClick={()=>setError('')}>×</button></div>}
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
    <button type="button" aria-expanded={showConvocations} aria-controls="cap-historicos" onClick={()=>showConvocations?closeConvocations():openConvocations()}><span className="focus-choice-icon">▦</span><span><b>Por convocatoria</b><small>Fecha y modelo originales</small></span><span aria-hidden="true">{showConvocations?'⌃':'›'}</span></button>
    <button disabled={category!=='mercancias'||!available.length||working} onClick={()=>void begin('cap-top100')}><span className="focus-choice-icon">★</span><span><b>Top 100 más repetidas</b><small>Las de mayor frecuencia histórica · sin duplicados</small></span><span aria-hidden="true">›</span></button>
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
  {showConvocations&&<section id="cap-historicos" aria-label="Convocatorias históricas CAP" tabIndex={-1}>
   <div className="focus-convocation-heading"><div><h2>Convocatorias de {category==='mercancias'?'Mercancías':'Viajeros'}</h2><p>{exams.length} modelos · {available.length} con plantilla de 100 respuestas</p></div><button className="focus-convocation-close" type="button" onClick={closeConvocations} aria-label="Cerrar listado de convocatorias">Cerrar <span aria-hidden="true">×</span></button></div>
   <div className="list">{exams.map(e=><button key={e.id} disabled={!e.hasOriginalAnswerSheet||working} onClick={()=>void begin('cap-original',e)}><i>▦</i><span><b>{pretty(e)}</b><small>{e.hasOriginalAnswerSheet?'100 preguntas · '+e.readyCount+' puntuables'+(e.disputedCount?' · '+e.disputedCount+' conflictos sin puntuar':''):'Aplazado: falta plantilla original'} · págs. {e.sourcePageStart}–{e.sourcePageEnd}</small></span>›</button>)}</div>
  </section>}
  <details className="focus-editorial"><summary>Auditoría editorial · consulta avanzada</summary><div className="focus-editorial-inner">
  <section className="panel cap-pending-panel">
   <h2>Auditoría editorial · 26 convocatorias</h2>
   <p>Revisa las 100 preguntas de cada examen con sus marcas: conflicto de respuestas, texto sospechoso, desfase de numeración o falta de cotejo. P0 significa prioridad máxima, no una respuesta declarada errónea. Las letras impresas y el banco original no se alteran.</p>
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
   <p><a className="btn light" href={import.meta.env.BASE_URL+'data/exams/sheet_audit_2200.csv'} download="CAP_2200_respuestas_plantillas_revision.csv">CSV de las 2.200 respuestas impresas</a></p>
   {sheetReviewShown&&<div className="cap-pending-results">
    <strong>{sheetReviewRows.length} preguntas · {sheetReviewRows.filter(q=>!q.scoringEligible).length} sin puntuación · {sheetReviewRows.filter(q=>q.reviewPriority!=='P4'||!!q.r22Case||!!q.r23Case||!!q.r24Case).length} con alguna marca o decisión editorial</strong>
    {selectedTriage&&<p className="cap-triage-summary"><b>Prioridad:</b> P0 {selectedTriage.P0} · P1 {selectedTriage.P1} · P2 {selectedTriage.P2} · P3 {selectedTriage.P3} · sin alertas P4 {selectedTriage.P4}. Texto con revisión pendiente: {selectedTriage.pendingVisualTranscription}.</p>}
    <label><input type="checkbox" checked={sheetReviewOnlyIssues} onChange={e=>setSheetReviewOnlyIssues(e.target.checked)}/> Mostrar solo preguntas marcadas para revisión (P0–P3)</label>
    <p>{showSheetRows.length} preguntas visibles. Abre cada fila para contrastar las cuatro opciones.</p>
    {showSheetRows.map(q=><details className="cap-pending-item" key={q.number}>
     <summary>Pregunta {q.number} · página {q.sourcePage} · {q.r24Case?.priority==='P0'?'R24 PRIORIDAD ALTA ·':q.r24Case?.status==='GRAFIA_RESTAURADA_REVERSIBLE'?'R24 TEXTO CORREGIDO ·':q.r23Case?.priority==='P0'?'R23 PRIORIDAD ALTA ·':q.r23Case?.status==='LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA'?'R23 LECTURAS DIVERGENTES ·':q.r22Case?.status==='DUDOSA_TECNICA_FRENTE_DGT'?'DUDOSA ·':q.r22Case?.status==='TEXTO_CONTRASTADO_FUENTE_PUBLICA'?'TEXTO CONTRASTADO ·':''} {q.editorialDecision?'INCIDENCIA DOCUMENTADA':q.reviewPriority!=='P4'?q.reviewPriority+' · COTEJAR':'sin alertas automáticas'} · plantilla: {q.originalSheetAnswer||'—'}{!q.scoringEligible?' · SIN PUNTUAR':''}{q.originalSheetAnswer&&q.mappedSheetQuestionNumber!==q.originalSheetQuestionNumber?' · ajuste de numeración':''}</summary>
     <p>{q.question}</p>
     <ol type="A">{keys.map(k=><li key={k}>{q.options[k]}</li>)}</ol>
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
   <p>Consulta el enunciado original y sus cuatro opciones. Los tres conflictos de plantilla tienen ya una decisión editorial cerrada, aunque siguen sin puntuar. No se registran como fallos.</p>
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
     {q.editorialDecision?<div className="cap-r25-final"><b>Decisión editorial cerrada · sin puntuación</b><p>{q.editorialDecision.decision}</p><small>Orientación técnica: {q.editorialDecision.editorialAnswer||'pregunta invalidada'} · Sin rectificación oficial acreditada.</small></div>:<small>Solución pendiente de revisión. No se califica esta pregunta.</small>}
    </details>)}
   </div>}
  </section>
  </div></details>
  <button className="btn light" onClick={()=>go('general')}>Abrir banco general · 8.655 preguntas</button>
  <p className="note">Los 22 modelos con plantilla mantienen sus 100 preguntas y las letras originales; las contradicciones documentadas no puntúan. No se duplican ampliaciones en el cómputo de frecuencia.</p>
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
 const data=JSON.parse(localStorage.getItem(LAST)||sessionStorage.getItem(LAST)||'null') as {record:StudySessionRecord;questionIds:string[]}|null
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
 async function downloadPdf(withSolutions:boolean){
  if(!data||pdfBusy||qs.length!==data.questionIds.length)return
  setPdfBusy(true);setPdfError('')
  try{
   const {exportExamPdf}=await import('./pdfExport')
   exportExamPdf({label:r.label,questions:qs,withSolutions})
  }catch(err){console.error(err);setPdfError('No se pudo generar el PDF. Inténtalo de nuevo.')}
  finally{setPdfBusy(false)}
 }
 async function review(){
  if(!fails.length)return
  const session:ActiveSession={type:'study',source:fails.every(x=>x.questionId.startsWith('cap:'))?'cap-errors':'errors',label:'Repaso del último test',
   questionIds:fails.map(x=>x.questionId),currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()}
  localStorage.setItem(ACTIVE,JSON.stringify(session))
  go('quiz')
 }
 return <div className="page">
  <button className="back" onClick={()=>go('home')}>‹ Inicio</button>
  <section className={'result '+resultClass}>
   <em>{capStudy?'ESTUDIO CAP · PUNTOS Y PRECISIÓN':capExam?(comparable?'SIMULACRO CAP · 100 PREGUNTAS VÁLIDAS':'CAP · CALIFICACIÓN ORIENTATIVA'):'RESULTADO'}</em>
   <strong>{capResult?netLabel+' puntos':r.score+'%'}</strong>
   <h1>{resultTitle}</h1>
   <p>{r.label}</p>
   {capResult&&<p className="focus-result-explain"><b>{r.correct} aciertos × 1 − {r.incorrect} fallos × 0,5 = {netLabel} puntos netos.</b> Las preguntas en blanco valen 0.</p>}
   {capStudy&&<p className="focus-result-explain">Precisión entre las {r.correct+r.incorrect} respuestas puntuables contestadas: {r.score.toLocaleString('es-ES',{maximumFractionDigits:2})} %. Los puntos netos no equivalen al porcentaje de aciertos.</p>}
   {capExam&&!comparable&&<p className="focus-result-explain">Se han calificado {r.gradedTotal??r.total} de {r.total} enunciados. Las {r.excluded??0} excluidas no penalizan. Equivalencia orientativa sobre 100 preguntas válidas: {r.score.toLocaleString('es-ES',{maximumFractionDigits:2})} puntos. No equivale a una calificación oficial.</p>}
   {capExam&&comparable&&<p className="focus-result-explain">El umbral del simulacro es de 50 puntos netos sobre 100 preguntas válidas.</p>}
   {r.finishedReason==='timeout'&&<p className="focus-result-explain">Tiempo agotado · entrega automática.</p>}
  </section>
  <div className="metrics">
   <article><b>{r.correct}</b><span>Correctas</span></article>
   <article><b>{r.incorrect}</b><span>Fallos</span></article>
   <article><b>{unreviewed.length}</b><span>Sin responder</span></article>{unscored.length>0&&<article><b>{unscored.length}</b><span>Sin puntuar · no penalizan</span></article>}
  </div>
  <div className="focus-result-exports">
   <button className="btn light" disabled={pdfBusy||qs.length!==data.questionIds.length} onClick={()=>void downloadPdf(false)}>{pdfBusy?'Generando PDF…':'↓ Exportar examen en PDF'}</button>
   <button className="btn light" disabled={pdfBusy||qs.length!==data.questionIds.length} onClick={()=>void downloadPdf(true)}>↓ PDF para estudiar (respuestas marcadas)</button>
  </div>
  {pdfError&&<p role="alert" className="focus-muted">{pdfError}</p>}
  {fails.length>0&&<Btn onClick={()=>void review()}>Repasar {fails.length} fallos</Btn>}
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
       :<><p className="green">Solución aplicada: {q.correctAnswer} · {q.options[q.correctAnswer]}</p>{q.reviewRequired&&<small>Solución procedente del cotejo; algunas transcripciones requieren revisión editorial.</small>}</>}
    </article>
   })}
  </div>
 </div>
}

function Stats({bank,rows,stats,sessions}:P){return <div className="page"><em>TU PREPARACIÓN</em><h1>{stats.attempts?stats.acc+'%':'Empieza hoy'}</h1><p>{stats.attempts?'de precisión global':'Tus estadísticas aparecerán aquí.'}</p><div className="statsgrid"><article><small>Vistas</small><b>{stats.seen}</b><span>de {stats.total}</span></article><article><small>Dominadas</small><b>{stats.mastered}</b></article><article><small>Por repasar</small><b>{stats.review}</b></article><article><small>Favoritas</small><b>{stats.fav}</b></article></div><h2>Progreso por cuestionario</h2><div className="progresslist">{bank.questionnaires.map(m=>{const rr=rows.filter(x=>x.questionnaireId===m.section+':'+m.questionnaireId),seen=rr.filter(x=>x.attempts).length;if(!seen)return null;const att=rr.reduce((a,x)=>a+x.attempts,0),cor=rr.reduce((a,x)=>a+x.correct,0);return <div key={m.id}><span><b>{m.questionnaireId}</b> · Sección {m.section}</span><small>{seen}/{m.count} · {percent(cor,att)}%</small><Bar v={percent(seen,m.count)}/></div>})}</div><h2>Últimas sesiones</h2><div className="history">{sessions.slice(0,10).map((s,i)=><div key={i}><span><b>{s.label}</b><small>{s.total} preguntas</small></span><strong>{s.capScoring?(s.netPoints??(s.correct-0.5*s.incorrect)).toLocaleString('es-ES',{maximumFractionDigits:2})+' pt':s.score+'%'}</strong></div>)}</div></div>}

function Settings({theme,setTheme,bank,refresh,userEmail,onSignOut}:{theme:string;setTheme:(s:string)=>void;bank:BankIndex;refresh:()=>Promise<void>;userEmail:string;onSignOut:()=>Promise<void>}){async function backup(){const d=await exportDatabase(),b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='cap-test-backup.json';a.click();URL.revokeObjectURL(u)}async function restore(e:any){const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text());if(!Array.isArray(d.progress))return alert('Copia no válida');await importProgress(d.progress);await refresh();alert('Progreso importado')}async function reset(){if(confirm(PREVIEW?'¿Borrar solo los datos de esta versión de pruebas?':'¿Borrar todo el progreso de tu cuenta? Esta acción afectará a todos tus dispositivos.')){await clearAllData();await refresh()}}return <div className="page"><button className="back" onClick={()=>history.back()}>‹ Volver</button><h1>Ajustes</h1><div className="panel account"><small>CUENTA</small><h2>{userEmail}</h2><p>{PREVIEW?'Esta versión guarda el progreso únicamente en este navegador, separado de la aplicación real. No utiliza Supabase.':'Tu progreso está sincronizado con tu cuenta y disponible en cualquier dispositivo donde inicies sesión.'}</p>{!PREVIEW&&<Btn kind="light" onClick={()=>void onSignOut()}>Cerrar sesión</Btn>}</div><div className="panel"><label>Tema</label><div className="segments"><button className={theme==='light'?'on':''} onClick={()=>setTheme('light')}>☀ Claro</button><button className={theme==='dark'?'on':''} onClick={()=>setTheme('dark')}>◐ Oscuro</button></div></div><div className="panel"><h2>Copia de seguridad</h2><p>{PREVIEW?'Los datos de prueba se guardan localmente. Puedes exportarlos como respaldo manual.':'Tu progreso se guarda en tu cuenta. Esta copia sirve como respaldo manual.'}</p><div className="actions"><Btn kind="light" onClick={backup}>↓ Exportar</Btn><label className="btn light">↑ Importar<input type="file" accept=".json" hidden onChange={restore}/></label></div></div><div className="panel"><h2>Banco CAP 2026</h2><p>{bank.totalQuestions.toLocaleString('es-ES')} preguntas · {bank.totalQuestionnaires} cuestionarios · {bank.version}</p></div><div className="panel danger"><h2>Empezar de cero</h2><Btn kind="danger" onClick={reset}>Borrar todo mi progreso</Btn></div></div>}

export default App
