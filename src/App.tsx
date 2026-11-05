import { useEffect, useMemo, useState } from 'react'
import type { ActiveSession, AnswerKey, BankIndex, Question, QuestionProgress, QuestionnaireMeta, StudySessionRecord, StudySource } from './types'
import { addSession, clearAllData, clearLocalCache, exportDatabase, getAllProgress, getRecentSessions, importProgress, pushLocalSnapshotToCloud, putProgress, synchronizeAccount } from './db'
import { cloudConfigured, getSession, signIn, signOut, supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'
import { loadAllQuestions, loadBankIndex, loadQuestionnaire, resolveQuestions } from './data'
import { chooseSmartQuestions, getStatus, needsReview, percent, shuffle } from './utils'
import { loadCapIndex, loadCapQuestions, loadAllCapQuestions, loadBankExamFrequency, loadCapPendingQuestions, loadCapSheetReview, type CapSheetReviewQuestion, type CapPendingQuestion, type CapCategory, type CapExamMeta, type CapExamIndex } from './capExams'

const PREVIEW=import.meta.env.VITE_CAP_PREVIEW === 'true'
const ACTIVE=PREVIEW?'cap-test-beta-active-v1':'cap-test-active-v1',
      LAST=PREVIEW?'cap-test-beta-last-v1':'cap-test-last-v1',
      THEME=PREVIEW?'cap-test-beta-theme':'cap-test-theme'
type Route='home'|'general'|'study'|'questionnaires'|'exam'|'quiz'|'results'|'stats'|'settings'
const route=():Route=>{const r=location.hash.replace(/^#\/?/,'').split('?')[0] as Route;return ['home','general','study','questionnaires','exam','quiz','results','stats','settings'].includes(r)?r:'home'}
const go=(r:Route)=>location.hash='#/'+r
const group=(q:Question)=>q.section+':'+q.questionnaireId
const fresh=(q:Question):QuestionProgress=>({questionId:q.id,questionnaireId:group(q),attempts:0,correct:0,incorrect:0,streak:0,lastAnsweredAt:0,favorite:false})
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
 async function logout(){try{await signOut()}finally{await clearLocalCache();sessionStorage.removeItem(ACTIVE);sessionStorage.removeItem(LAST);setSession(null)}}
 if(PREVIEW)return <CapApp userEmail="Modo pruebas · solo este navegador" onSignOut={async()=>{}}/>
 if(!cloudConfigured)return <div className="authshell"><section className="authcard"><div className="authlogo">CT</div><h1>Sincronización pendiente</h1><p>La aplicación está preparada para acceso privado, pero falta conectar el proyecto de Supabase.</p></section></div>
 if(!authReady||syncing)return <Loading text={syncing?'Sincronizando tu progreso…':'Comprobando sesión…'}/>
 if(!session)return <Login onSuccess={loginDone}/>
 return <CapApp userEmail={session.user.email||'Usuario'} onSignOut={logout}/>
}

function CapApp({userEmail,onSignOut}:{userEmail:string;onSignOut:()=>Promise<void>}){
 const [page,setPage]=useState<Route>(route()),[bank,setBank]=useState<BankIndex|null>(null),[rows,setRows]=useState<QuestionProgress[]>([]),[sessions,setSessions]=useState<StudySessionRecord[]>([]),[busy,setBusy]=useState(true),[load,setLoad]=useState<number|null>(null),[online,setOnline]=useState(navigator.onLine),[theme,setTheme]=useState(localStorage.getItem(THEME)||'light')
 useEffect(()=>{const h=()=>setPage(route()),o=()=>{const isOnline=navigator.onLine;setOnline(isOnline);if(isOnline)pushLocalSnapshotToCloud().catch(console.error)};addEventListener('hashchange',h);addEventListener('online',o);addEventListener('offline',o);if(!location.hash)go('home');return()=>{removeEventListener('hashchange',h);removeEventListener('online',o);removeEventListener('offline',o)}},[])
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem(THEME,theme)},[theme])
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
  const s:ActiveSession={type,source,label,questionIds:pool.map(q=>q.id),questionnaireId:meta?.id,currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()};sessionStorage.setItem(ACTIVE,JSON.stringify(s));go('quiz')
 }
 if(busy||!bank)return <Loading text="Preparando CAP Test…"/>
 const props={bank,rows,pm,stats,sessions,start}
 return <div className="app">
  <header><button className="logo" onClick={()=>go('home')}>CT</button><div><b>{page==='home'?'CAP Test 2026':({general:'Banco general',study:'Modo estudio',questionnaires:'Cuestionarios',exam:'Simulacro general',quiz:'Test en curso',results:'Resultado',stats:'Progreso',settings:'Ajustes'} as any)[page]}</b>{!online&&<small>Sin conexión</small>}</div><button className="gear" onClick={()=>go('settings')}>⚙</button></header>
  {PREVIEW&&<div className="cap-preview-banner" role="status">VERSIÓN DE PRUEBAS · Datos locales · No sincroniza con tu cuenta</div>}
  <main>{load!==null&&<div className="overlay"><Loading text={'Preparando preguntas… '+load+'%'}/></div>}{page==='home'&&<CapHome/>} {page==='general'&&<Home {...props}/>} {page==='study'&&<Study {...props}/>}  {page==='questionnaires'&&<Questionnaires {...props}/>} {page==='exam'&&<Exam {...props}/>} {page==='quiz'&&<Quiz pm={pm} refresh={refresh}/>} {page==='results'&&<Results/>} {page==='stats'&&<Stats {...props}/>} {page==='settings'&&<Settings theme={theme} setTheme={setTheme} bank={bank} refresh={refresh} userEmail={userEmail} onSignOut={onSignOut}/>}</main>
  {!['quiz','results','settings','questionnaires'].includes(page)&&<nav><button className={page==='home'?'on':''} onClick={()=>go('home')}>⌂<span>Exámenes</span></button><button className={page==='general'||page==='study'?'on':''} onClick={()=>go('general')}>▤<span>Banco</span></button><button className={page==='exam'?'on':''} onClick={()=>go('exam')}>✓<span>Test general</span></button><button className={page==='stats'?'on':''} onClick={()=>go('stats')}>◫<span>Progreso</span></button></nav>}
 </div>
}

type P={bank:BankIndex;rows:QuestionProgress[];pm:Map<string,QuestionProgress>;stats:any;sessions:StudySessionRecord[];start:(t:'study'|'exam',s:StudySource,c:number,l:string,m?:QuestionnaireMeta)=>Promise<void>}


function CapHome(){
 const [index,setIndex]=useState<CapExamIndex|null>(null)
 const [category,setCategory]=useState<CapCategory>('mercancias')
 const [mode,setMode]=useState<'study'|'exam'>('study')
 const [count,setCount]=useState(100)
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
 useEffect(()=>{loadCapIndex().then(setIndex).catch(e=>setError(String(e)))},[])
 useEffect(()=>{setPendingId('');setPendingRows([]);setPendingShown(false);setSheetReviewId('');setSheetReviewRows([]);setSheetReviewShown(false)},[category])
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
  if(!selected||!selected.hasOriginalAnswerSheet)return
  setSheetReviewBusy(true);setError('')
  try{setSheetReviewRows(await loadCapSheetReview(selected));setSheetReviewShown(true)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSheetReviewBusy(false)}
 }
 const showSheetRows=sheetReviewOnlyIssues?sheetReviewRows.filter(q=>
  !q.scoringEligible||q.mappedSheetQuestionNumber!==q.originalSheetQuestionNumber||
  q.answerStatus==='respuesta_alineacion_editorial_confirmada'||
  (!!q.bankAnswer&&!!q.mappedSheetAnswer&&q.bankAnswer!==q.mappedSheetAnswer)
 ):sheetReviewRows
 async function begin(source:'cap-original'|'cap-random'|'cap-mixed',chosen?:CapExamMeta){
  setError('');setWorking(true)
  try{
   let questions:Question[]=[]
   let label=''
   if(source==='cap-mixed'){
    const rows=await loadAllCapQuestions(category)
    const unique=new Map<string,Question>()
    shuffle(rows).forEach(x=>{const id=x.progressId||x.id;if(!unique.has(id))unique.set(id,x)})
    questions=shuffle([...unique.values()]).slice(0,count)
    label='CAP '+(category==='mercancias'?'Mercancías':'Viajeros')+' · mezclado · '+questions.length+' preguntas cotejadas'
   }else{
    const meta=chosen||(available.length?shuffle(available)[0]:undefined)
    if(!meta)throw new Error('No hay exámenes corregibles todavía en esta modalidad.')
    questions=await loadCapQuestions(meta)
    label='CAP '+(category==='mercancias'?'Mercancías':'Viajeros')+' · '+pretty(meta)
    if(questions.length<(meta.expectedCount||100))label+=' · práctica parcial ('+questions.length+'/'+(meta.expectedCount||100)+')'
   }
   if(!questions.length)throw new Error('Ninguna pregunta tiene solución cotejable todavía.')
   const session:ActiveSession={type:mode,source,label,questionIds:questions.map(q=>q.id),
    currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()}
   sessionStorage.setItem(ACTIVE,JSON.stringify(session))
   go('quiz')
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setWorking(false)}
 }
 if(!index&&!error)return <Loading text="Preparando exámenes CAP…"/>
 return <div className="page cap-page">
  <section className="hero"><div><em>PRIORIDAD DE ESTUDIO</em><h1>Exámenes CAP</h1><p>Convocatorias anteriores, preguntas repetidas y estudio a tu ritmo.</p></div></section>
  <h2>Modalidad</h2>
  <div className="segments"><button className={category==='mercancias'?'on':''} onClick={()=>setCategory('mercancias')}>Mercancías</button><button className={category==='viajeros'?'on':''} onClick={()=>setCategory('viajeros')}>Viajeros · autobús</button></div>
  <h2>Cómo quieres corregir</h2>
  <div className="segments"><button className={mode==='study'?'on':''} onClick={()=>setMode('study')}>Estudio · al responder</button><button className={mode==='exam'?'on':''} onClick={()=>setMode('exam')}>Examen · al finalizar</button></div>
  <p className="note">{category==='viajeros'?'El examen de Viajeros se conserva en el archivo, pero se aplaza hasta disponer de su plantilla.':'Cada convocatoria con plantilla contiene 100 preguntas y sus 100 respuestas impresas. Las contradicciones quedan visibles y no puntúan.'}</p>
  {error&&<div className="autherror">{error}</div>}
  <h2>Formas de practicar</h2>
  <div className="cards">
   <button onClick={()=>document.getElementById('cap-historicos')?.scrollIntoView({behavior:'smooth'})}>▦<span><b>Exámenes CAP</b><small>Elegir fecha y modelo de examen</small></span>›</button>
   <button disabled={!available.length||working} onClick={()=>void begin('cap-random')}>⤨<span><b>Exámenes CAP aleatorios</b><small>Una convocatoria de esta modalidad al azar</small></span>›</button>
   <button disabled={!available.length||working} onClick={()=>void begin('cap-mixed')}>✦<span><b>Exámenes CAP mezclados</b><small>Preguntas distintas de varias convocatorias</small></span>›</button>
  </div>
  <div className="panel"><label>Preguntas en examen mezclado</label><div className="segments">{[10,20,30,50,100].map(x=><button key={x} className={count===x?'on':''} onClick={()=>setCount(x)}>{x}</button>)}</div></div>
  <section id="cap-historicos"><h2>Convocatorias de {category==='mercancias'?'Mercancías':'Viajeros'}</h2><p>{exams.length} modelos · {available.length} con plantilla de 100 respuestas</p>
   <div className="list">{exams.map(e=><button key={e.id} disabled={!e.hasOriginalAnswerSheet||working} onClick={()=>void begin('cap-original',e)}><i>▦</i><span><b>{pretty(e)}</b><small>{e.hasOriginalAnswerSheet?'100 preguntas · '+e.readyCount+' puntuables'+(e.disputedCount?' · '+e.disputedCount+' en revisión':''):'Aplazado: falta plantilla original'} · págs. {e.sourcePageStart}–{e.sourcePageEnd}</small></span>›</button>)}</div>
  </section>
  <section className="panel cap-pending-panel">
   <h2>Preguntas pendientes de revisión</h2>
   <p>Consulta el enunciado original y sus cuatro opciones. No se muestra una solución sin cotejar, ni se registran estas preguntas como fallos.</p>
   <select aria-label="Convocatoria con preguntas pendientes" value={pendingId} onChange={e=>{setPendingId(e.target.value);setPendingShown(false);setPendingRows([])}}>
    <option value="">Seleccionar convocatoria</option>
    {exams.filter(e=>e.hasOriginalAnswerSheet&&e.count>e.readyCount).map(e=><option key={e.id} value={e.id}>{pretty(e)} · {e.count-e.readyCount} pendientes</option>)}
   </select>
   <Btn kind="light" disabled={!pendingId||pendingBusy} onClick={()=>void showPending()}>{pendingBusy?'Preparando…':'Consultar sin puntuación'}</Btn>
   {pendingShown&&<div className="cap-pending-results">
    <strong>{pendingRows.length} preguntas sin solución cotejada</strong>
    {pendingRows.map(q=><details key={q.number} className="cap-pending-item">
     <summary>Pregunta {q.number} · página {q.sourcePage}{q.answerStatus.startsWith('conflicto')?' · Fuentes contradictorias':''}</summary>
     <p>{q.question}</p>
     <ol type="A">{keys.map(k=><li key={k}>{q.options[k]}</li>)}</ol>
     <small>Solución pendiente de revisión. No se califica esta pregunta.</small>
    </details>)}
   </div>}
  </section>
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

function Exam({bank,stats,start}:P){const [count,setCount]=useState(30),[source,setSource]=useState<StudySource>('random'),[qid,setQid]=useState(bank.questionnaires[0].id);const meta=bank.questionnaires.find(x=>x.id===qid);return <div className="page"><em>SIMULACRO</em><h1>Como un examen</h1><p>No verás la solución hasta finalizar. Las no contestadas cuentan como fallo.</p><div className="panel"><label>Número de preguntas</label><div className="segments">{[10,20,30,50].map(n=><button className={count===n?'on':''} onClick={()=>setCount(n)} key={n}>{n}</button>)}</div><label>Contenido</label>{([['random','Todo el banco','Mezcla todos los cuestionarios'],['unseen','Solo nuevas',(stats.total-stats.seen)+' sin ver'],['errors','Solo errores',stats.review+' disponibles'],['questionnaire','Un cuestionario','Elige un bloque concreto']] as any[]).map(x=><button className={'radio '+(source===x[0]?'on':'')} onClick={()=>setSource(x[0])} key={x[0]}><i/><span><b>{x[1]}</b><small>{x[2]}</small></span></button>)}{source==='questionnaire'&&<select value={qid} onChange={e=>setQid(e.target.value)}>{bank.questionnaires.map(q=><option key={q.id} value={q.id}>Sección {q.section} · {q.questionnaireId} ({q.count})</option>)}</select>}<Btn onClick={()=>start('exam',source,count,'Simulacro · '+count,source==='questionnaire'?meta:undefined)}>Comenzar simulacro</Btn></div></div>}

function Quiz({pm,refresh}:{pm:Map<string,QuestionProgress>;refresh:()=>Promise<void>}){const [s,setS]=useState<ActiveSession|null>(()=>JSON.parse(sessionStorage.getItem(ACTIVE)||'null')),[qs,setQs]=useState<Question[]>([]),[loading,setLoading]=useState(true),[ref,setRef]=useState(false),[frequencies,setFrequencies]=useState<Record<string,{count:number;denominator:number;category:CapCategory}>>({})
 useEffect(()=>{if(!s){go('study');return}resolveQuestions(s.questionIds).then(x=>{setQs(x);setLoading(false)})},[])
 useEffect(()=>{loadBankExamFrequency().then(setFrequencies).catch(console.error)},[])
 const progressId=(x:Question)=>x.progressId||x.id
 if(!s||loading||!qs.length)return <Loading text="Cargando test…"/>
 const session=s
 const i=session.currentIndex,q=qs[i],sel=session.selectedAnswers[q.id],checked=session.checkedIds.includes(q.id),correct=q.scoringEligible!==false&&sel===q.correctAnswer,fav=pm.get(progressId(q))?.favorite
 const frequency=q.examFrequency!==undefined?{count:q.examFrequency,denominator:q.examFrequencyDenominator||0,category:(q as Question & {category?:CapCategory}).category||'mercancias'}:frequencies[progressId(q)]
 const save=(n:ActiveSession)=>{setS(n);sessionStorage.setItem(ACTIVE,JSON.stringify(n))}
 async function select(k:AnswerKey){
  if(session.type==='study'&&checked)return
  if(session.type==='exam'){save({...session,selectedAnswers:{...session.selectedAnswers,[q.id]:k}});return}
  const next={...session,selectedAnswers:{...session.selectedAnswers,[q.id]:k},checkedIds:[...session.checkedIds,q.id]}
  save(next)
  if(q.scoringEligible===false)return // el alumno no acumula fallos/aciertos discutidos
  const b=pm.get(progressId(q))||fresh({...q,id:progressId(q)}),ok=k===q.correctAnswer
  await putProgress({...b,attempts:b.attempts+1,correct:b.correct+(ok?1:0),incorrect:b.incorrect+(ok?0:1),streak:ok?b.streak+1:0,lastAnsweredAt:Date.now(),lastAnswer:k,lastCorrect:ok})
  await refresh()
 }
 async function favorite(){const b=pm.get(progressId(q))||fresh({...q,id:progressId(q)});await putProgress({...b,favorite:!b.favorite});await refresh()}
 async function finish(){
  const answered=qs.filter(x=>!!session.selectedAnswers[x.id]).length
  if(session.type==='exam'&&answered<qs.length&&!confirm('Hay '+(qs.length-answered)+' preguntas sin responder. ¿Finalizar y corregir el examen?'))return
  if(session.type==='exam'){
   for(const x of qs){
    const selected=session.selectedAnswers[x.id]
    if(!selected||x.scoringEligible===false)continue
    const prior=pm.get(progressId(x))||fresh({...x,id:progressId(x)})
    const ok=selected===x.correctAnswer
    await putProgress({...prior,attempts:prior.attempts+1,correct:prior.correct+(ok?1:0),incorrect:prior.incorrect+(ok?0:1),streak:ok?prior.streak+1:0,lastAnsweredAt:Date.now(),lastAnswer:selected,lastCorrect:ok})
   }
  }
  const answers=qs.map(x=>({questionId:x.id,questionnaireId:group(x),selected:session.selectedAnswers[x.id],correctAnswer:x.correctAnswer,scoringEligible:x.scoringEligible!==false,correct:x.scoringEligible!==false&&session.selectedAnswers[x.id]===x.correctAnswer}))
  const graded=answers.filter(x=>x.scoringEligible!==false)
  const cor=graded.filter(x=>x.correct).length
  const incorrect=graded.filter(x=>x.selected&&!x.correct).length
  const gradedAnswered=graded.filter(x=>!!x.selected).length
  const record:StudySessionRecord={type:session.type,label:session.label,startedAt:session.startedAt,completedAt:Date.now(),total:qs.length,answered,correct:cor,incorrect,score:percent(cor,session.type==='exam'?graded.length:gradedAnswered),answers}
  await addSession(record)
  sessionStorage.setItem(LAST,JSON.stringify({record,questionIds:session.questionIds}))
  sessionStorage.removeItem(ACTIVE)
  await refresh()
  go('results')
 }

 return <div className="quiz"><div className="quizhead"><button onClick={()=>history.back()}>×</button><div><b>{session.label}</b><small>{i+1} de {qs.length}</small><Bar v={percent(i+1,qs.length)}/></div><button className={fav?'fav':''} onClick={favorite}>★</button></div><article><small>Pregunta {i+1} de {qs.length}{q.examId&&q.sourcePage?' · número original '+q.number+' · PDF pág. '+q.sourcePage:''}</small><h2>{q.question}</h2><div className="cap-frequency">{frequency&&frequency.denominator>1?'↻ Aparece en '+frequency.count+' de '+frequency.denominator+' modelos analizados ('+percent(frequency.count,frequency.denominator)+' %)':frequency&&frequency.denominator===1?'↻ Registrada en un único examen parcialmente transcrito. No hay muestra suficiente para medir repetición.':'↻ Frecuencia no identificada con coincidencia exacta en los modelos analizados'}</div>{q.reviewRequired&&<div className="cap-review-warning">{q.scoringEligible===false?'Respuesta oficial y banco en conflicto: esta pregunta se incluye para estudiar, pero NO puntúa hasta resolver la discrepancia.':q.answerStatus==='plantilla_pdf_oficial_verificada'?'Respuesta verificada en la plantilla PDF original. El texto del enunciado procede de una transcripción y sigue pendiente de revisión visual.':q.answerStatus==='respuesta_alineacion_editorial_confirmada'?'Respuesta cotejada con el texto y las opciones del examen original. La numeración de la plantilla PDF no coincide desde la pregunta 44: se usó la casilla siguiente tras validación editorial.':q.answerStatus==='respuesta_fuente_publica_oficial_pendiente_plantilla'?'Respuesta contrastada con BOE/DGT (fuente oficial externa), pendiente de cotejo con la plantilla del examen y revisión del texto.':q.transcriptionReview?'Transcripción de PDF escaneado: pregunta y solución cotejada con el banco, pendientes de revisión visual.':q.answerStatus==='coincidencia_alineacion_provisional_pendiente_revision'?'La respuesta coincide con el banco original y una alineación provisional de la plantilla de 2023. Pendiente de revisión editorial.':q.answerStatus==='coincidencia_plantilla_corregida_visual_pendiente_revision'?'Coincide con el banco y con la letra de la plantilla revisada visualmente. Revisión editorial pendiente.':'Solución obtenida del banco CAP; pendiente de revisión editorial.'}</div>}<div className="answers">{keys.map(k=>{let c=sel===k?'selected':'';if(session.type==='study'&&checked)c=k===q.correctAnswer?'correct':sel===k?'wrong':'';return <button className={c} onClick={()=>void select(k)} key={k}><i>{k}</i><span>{q.options[k]}</span></button>})}</div>{session.type==='study'&&checked&&(q.scoringEligible===false
  ?<div className="feedback" role="status"><b>Pregunta en revisión · no puntúa</b><p>La plantilla original marca {q.originalSheetAnswer||'—'} y el banco marca {q.bankAnswer||'—'}. Tu elección no se registra como acierto ni como error.</p>{q.answerDispute?.reason&&<small>{q.answerDispute.reason}</small>}</div>
  :<div className={'feedback '+(correct?'ok':'bad')}><b>{correct?'✓ ¡Correcto!':'× Incorrecto · correcta '+q.correctAnswer}</b><button onClick={()=>setRef(!ref)}>{ref?'Ocultar':'Ver fundamento'}</button>{ref&&<div><p><b>Norma:</b> {q.norm}</p><p><b>Referencia:</b> {q.reference}</p>{q.originalSheetAnswer&&<p><b>Plantilla original:</b> {q.originalSheetAnswer} · casilla {q.originalSheetQuestionNumber}. {q.mappedSheetQuestionNumber!==q.originalSheetQuestionNumber?'La correspondencia editorial utiliza la casilla '+q.mappedSheetQuestionNumber+' ('+q.mappedSheetAnswer+').':''}</p>}</div>}</div>)}</article><footer><Btn kind="light" disabled={i===0} onClick={()=>{setRef(false);save({...session,currentIndex:i-1})}}>Anterior</Btn>{i<qs.length-1?<Btn onClick={()=>{setRef(false);save({...session,currentIndex:i+1})}}>Siguiente</Btn>:<Btn onClick={finish}>Finalizar</Btn>}</footer></div>}

function Results(){
 const data=JSON.parse(sessionStorage.getItem(LAST)||'null') as {record:StudySessionRecord;questionIds:string[]}|null
 const [qs,setQs]=useState<Question[]>([])
 const [showAll,setShowAll]=useState(false)
 useEffect(()=>{if(data)resolveQuestions(data.questionIds).then(setQs).catch(console.error)},[])
 if(!data)return <Loading/>
 const r=data.record
 const questionMap=new Map(qs.map(q=>[q.id,q]))
 const fails=r.answers.filter(a=>a.scoringEligible!==false&&!!a.selected&&!a.correct)
 const unreviewed=r.answers.filter(a=>a.scoringEligible!==false&&!a.selected)
 const unscored=r.answers.filter(a=>a.scoringEligible===false)
 const visible=showAll?r.answers:fails
 async function review(){
  if(!fails.length)return
  const session:ActiveSession={type:'study',source:'errors',label:'Repaso del último test',
   questionIds:fails.map(x=>x.questionId),currentIndex:0,selectedAnswers:{},checkedIds:[],startedAt:Date.now()}
  sessionStorage.setItem(ACTIVE,JSON.stringify(session))
  go('quiz')
 }
 return <div className="page">
  <button className="back" onClick={()=>go('home')}>‹ Inicio</button>
  <section className={'result '+(r.score>=80?'good':r.score>=60?'mid':'bad')}>
   <em>RESULTADO</em><strong>{r.score}%</strong>
   <h1>{r.score>=80?'Muy buen resultado':r.score>=60?'Buen intento':'Toca reforzar'}</h1>
   <p>{r.label}</p>
  </section>
  <div className="metrics">
   <article><b>{r.correct}</b><span>Correctas</span></article>
   <article><b>{r.incorrect}</b><span>Fallos</span></article>
   <article><b>{unreviewed.length}</b><span>Sin responder</span></article>{unscored.length>0&&<article><b>{unscored.length}</b><span>En revisión · sin puntuar</span></article>}
  </div>
  {fails.length>0&&<Btn onClick={()=>void review()}>Repasar {fails.length} fallos</Btn>}
  <h2>Corrección de respuestas</h2>
  <p className="note">En examen puedes comprobar aciertos, fallos y preguntas sin responder. Las preguntas sin responder no se registran como fallos en tu progreso.{unscored.length>0?' Las '+unscored.length+' preguntas con respuestas contradictorias se excluyeron del cálculo y del historial de fallos.':''}</p>
  <Btn kind="light" onClick={()=>setShowAll(v=>!v)}>{showAll?'Ver solo fallos':'Ver todas las respuestas ('+r.answers.length+')'}</Btn>
  <div className="review">
   {visible.length===0&&!showAll&&<p>No hay respuestas incorrectas.</p>}
   {visible.map((answer)=>{
    const q=questionMap.get(answer.questionId)
    if(!q)return null
    const status=answer.scoringEligible===false?'En revisión · sin puntuar':!answer.selected?'Sin responder':answer.correct?'Correcta':'Incorrecta'
    return <article key={answer.questionId} className={answer.correct?'cap-review-correct':''}>
     <b>{showAll?'Pregunta '+(r.answers.indexOf(answer)+1)+' · ':''}{q.question}</b>
     <p><strong>{status}</strong> · Tu respuesta: {answer.selected?answer.selected+' · '+q.options[answer.selected]:'—'}</p>
     {answer.scoringEligible===false
       ?<><p>Plantilla original: <b>{q.originalSheetAnswer||'—'}</b> · Banco: <b>{q.bankAnswer||'—'}</b></p><small>No hay solución aprobada todavía. Esta pregunta no se ha calificado.</small></>
       :<><p className="green">Solución aplicada: {q.correctAnswer} · {q.options[q.correctAnswer]}</p>{q.reviewRequired&&<small>Solución procedente del cotejo; algunas transcripciones requieren revisión editorial.</small>}</>}
    </article>
   })}
  </div>
 </div>
}

function Stats({bank,rows,stats,sessions}:P){return <div className="page"><em>TU PREPARACIÓN</em><h1>{stats.attempts?stats.acc+'%':'Empieza hoy'}</h1><p>{stats.attempts?'de precisión global':'Tus estadísticas aparecerán aquí.'}</p><div className="statsgrid"><article><small>Vistas</small><b>{stats.seen}</b><span>de {stats.total}</span></article><article><small>Dominadas</small><b>{stats.mastered}</b></article><article><small>Por repasar</small><b>{stats.review}</b></article><article><small>Favoritas</small><b>{stats.fav}</b></article></div><h2>Progreso por cuestionario</h2><div className="progresslist">{bank.questionnaires.map(m=>{const rr=rows.filter(x=>x.questionnaireId===m.section+':'+m.questionnaireId),seen=rr.filter(x=>x.attempts).length;if(!seen)return null;const att=rr.reduce((a,x)=>a+x.attempts,0),cor=rr.reduce((a,x)=>a+x.correct,0);return <div key={m.id}><span><b>{m.questionnaireId}</b> · Sección {m.section}</span><small>{seen}/{m.count} · {percent(cor,att)}%</small><Bar v={percent(seen,m.count)}/></div>})}</div><h2>Últimas sesiones</h2><div className="history">{sessions.slice(0,10).map((s,i)=><div key={i}><span><b>{s.label}</b><small>{s.total} preguntas</small></span><strong>{s.score}%</strong></div>)}</div></div>}

function Settings({theme,setTheme,bank,refresh,userEmail,onSignOut}:{theme:string;setTheme:(s:string)=>void;bank:BankIndex;refresh:()=>Promise<void>;userEmail:string;onSignOut:()=>Promise<void>}){async function backup(){const d=await exportDatabase(),b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='cap-test-backup.json';a.click();URL.revokeObjectURL(u)}async function restore(e:any){const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text());if(!Array.isArray(d.progress))return alert('Copia no válida');await importProgress(d.progress);await refresh();alert('Progreso importado')}async function reset(){if(confirm(PREVIEW?'¿Borrar solo los datos de esta versión de pruebas?':'¿Borrar todo el progreso de tu cuenta? Esta acción afectará a todos tus dispositivos.')){await clearAllData();await refresh()}}return <div className="page"><button className="back" onClick={()=>history.back()}>‹ Volver</button><h1>Ajustes</h1><div className="panel account"><small>CUENTA</small><h2>{userEmail}</h2><p>{PREVIEW?'Esta versión guarda el progreso únicamente en este navegador, separado de la aplicación real. No utiliza Supabase.':'Tu progreso está sincronizado con tu cuenta y disponible en cualquier dispositivo donde inicies sesión.'}</p>{!PREVIEW&&<Btn kind="light" onClick={()=>void onSignOut()}>Cerrar sesión</Btn>}</div><div className="panel"><label>Tema</label><div className="segments"><button className={theme==='light'?'on':''} onClick={()=>setTheme('light')}>☀ Claro</button><button className={theme==='dark'?'on':''} onClick={()=>setTheme('dark')}>◐ Oscuro</button></div></div><div className="panel"><h2>Copia de seguridad</h2><p>{PREVIEW?'Los datos de prueba se guardan localmente. Puedes exportarlos como respaldo manual.':'Tu progreso se guarda en tu cuenta. Esta copia sirve como respaldo manual.'}</p><div className="actions"><Btn kind="light" onClick={backup}>↓ Exportar</Btn><label className="btn light">↑ Importar<input type="file" accept=".json" hidden onChange={restore}/></label></div></div><div className="panel"><h2>Banco CAP 2026</h2><p>{bank.totalQuestions.toLocaleString('es-ES')} preguntas · {bank.totalQuestionnaires} cuestionarios · {bank.version}</p></div><div className="panel danger"><h2>Empezar de cero</h2><Btn kind="danger" onClick={reset}>Borrar todo mi progreso</Btn></div></div>}

export default App
