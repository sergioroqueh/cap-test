import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { ActiveSession, AnswerKey, Question, QuestionProgress, SessionAnswer, StudySessionRecord } from './types'
import { addSession, putManyProgress, putProgress } from './db'
import { resolveQuestions } from './data'
import { loadBankExamFrequency, type CapCategory, type CapEditorialDecision } from './capExams'
import { percent } from './utils'
import { CAP_DURATION_MINUTES, deadlineAt, formatRemaining, gradeSession, remainingMs } from './examEngine.mjs'

const PREVIEW = import.meta.env.VITE_CAP_PREVIEW === 'true'
const ACTIVE = PREVIEW ? 'cap-test-beta-active-v1' : 'cap-test-active-v1'
const LAST = PREVIEW ? 'cap-test-beta-last-v1' : 'cap-test-last-v1'
const keys: AnswerKey[] = ['A','B','C','D']
const go = (page: string) => { location.hash = '#/' + page }
const progressId = (q: Question) => q.progressId || q.id
const fresh = (q: Question): QuestionProgress => ({
  questionId: progressId(q), questionnaireId: q.section + ':' + q.questionnaireId,
  attempts: 0, correct: 0, incorrect: 0, streak: 0,
  lastAnsweredAt: 0, favorite: false
})
const capDecision = (q: Question) =>
  (q as Question & { editorialDecision?: CapEditorialDecision }).editorialDecision || null

function readActive(): ActiveSession | null {
  try { return JSON.parse(localStorage.getItem(ACTIVE) || sessionStorage.getItem(ACTIVE) || 'null') as ActiveSession | null }
  catch { return null }
}
function Bar({value}:{value:number}) {
  return <div className="bar" aria-hidden="true"><i style={{width:Math.min(100,Math.max(0,value))+'%'}}/></div>
}

export default function Quiz({pm,refresh}:{pm:Map<string,QuestionProgress>;refresh:()=>Promise<void>}) {
  const [initial] = useState(readActive)
  const [questions,setQuestions] = useState<Question[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [frequency,setFrequency] = useState<Record<string,{count:number;denominator:number;category:CapCategory}>>({})
  useEffect(()=>{
    if (!initial) { go('home');return }
    let live=true
    resolveQuestions(initial.questionIds)
      .then(rows=>{
        if(!live)return
        if(rows.length!==initial.questionIds.length)throw new Error('No se han recuperado todas las preguntas originales. Se mantiene la sesión sin calificar.')
        if(initial.source.startsWith('cap-')&&(!initial.questionIds.every(id=>/^cap:[^:]+:\d+$/.test(id))||!rows.every(q=>!!q.examId)))
          throw new Error('Este test CAP contiene preguntas ajenas a las convocatorias históricas verificadas. No se abrirá hasta corregirlo.')
        setQuestions(rows)
      })
      .catch(err=>{if(live)setError(err instanceof Error?err.message:String(err))})
      .finally(()=>{if(live)setLoading(false)})
    return ()=>{live=false}
  },[initial])
  useEffect(()=>{loadBankExamFrequency().then(setFrequency).catch(console.error)},[])
  if(error)return <div className="page"><h1>No se pudo abrir este test</h1><p>{error}</p><button className="btn light" onClick={()=>go('home')}>Volver al inicio</button></div>
  if(!initial||loading||!questions.length)return <div className="center">Preparando las preguntas…</div>
  return <QuizSession initial={initial} questions={questions} frequency={frequency} pm={pm} refresh={refresh}/>
}

function QuizSession({initial,questions,frequency,pm,refresh}:{
  initial:ActiveSession;questions:Question[]
  frequency:Record<string,{count:number;denominator:number;category:CapCategory}>
  pm:Map<string,QuestionProgress>;refresh:()=>Promise<void>
}){
  const [s,setS]=useState(initial)
  const [now,setNow]=useState(Date.now)
  const [refShown,setRefShown]=useState(false)
  const [finishing,setFinishing]=useState(false)
  const [confirmSubmit,setConfirmSubmit]=useState(false)
  const [saveError,setSaveError]=useState('')
  const [pdfBusy,setPdfBusy]=useState(false)
  const [pdfError,setPdfError]=useState('')
  const lock=useRef(false)
  const timed=s.type==='exam'&&s.timed===true
  const duration=s.durationMinutes||CAP_DURATION_MINUTES
  const left=timed?remainingMs(s.startedAt,now,duration):null
  const expired=timed && (left===0||Date.now()>=deadlineAt(s.startedAt,duration))
  const q=questions[s.currentIndex]
  const selected=s.selectedAnswers[q.id]
  const checked=s.checkedIds.includes(q.id)
  const favorite=pm.get(progressId(q))?.favorite
  const decision=capDecision(q)
  const isCap=s.source.startsWith('cap-')
  const eligibleCount=questions.filter(x=>x.scoringEligible!==false).length
  const answeredCount=questions.filter(x=>!!s.selectedAnswers[x.id]).length
  const markedCount=(s.markedIds||[]).length
  const frequencyInfo=q.examFrequency!==undefined
    ?{count:q.examFrequency,denominator:q.examFrequencyDenominator||0}
    :frequency[progressId(q)]
  const save=(next:ActiveSession)=>{
    setS(next)
    localStorage.setItem(ACTIVE,JSON.stringify(next))
    sessionStorage.removeItem(ACTIVE)
  }
  const navigate=(index:number)=>{
    setRefShown(false)
    save({...s,currentIndex:index})
    window.scrollTo({top:0,behavior:'instant'})
  }
  async function select(k:AnswerKey){
    if(finishing||expired||s.type==='study'&&checked)return
    if(s.type==='exam'){
      // Persist the answer and advance in one atomic state update. On question 100,
      // stay in place: delivery is always manual unless the real timer expires.
      save({...s,selectedAnswers:{...s.selectedAnswers,[q.id]:k},
        currentIndex:Math.min(s.currentIndex+1,questions.length-1)})
      setRefShown(false)
      window.scrollTo({top:0,behavior:'instant'})
      return
    }
    save({...s,selectedAnswers:{...s.selectedAnswers,[q.id]:k},checkedIds:[...s.checkedIds,q.id]})
    if(q.scoringEligible===false)return
    const prior=pm.get(progressId(q))||fresh(q)
    const ok=k===q.correctAnswer
    await putProgress({...prior,attempts:prior.attempts+1,correct:prior.correct+(ok?1:0),incorrect:prior.incorrect+(ok?0:1),streak:ok?prior.streak+1:0,lastAnsweredAt:Date.now(),lastAnswer:k,lastCorrect:ok})
    await refresh()
  }
  async function toggleFavorite(){
    const prior=pm.get(progressId(q))||fresh(q)
    await putProgress({...prior,favorite:!prior.favorite})
    await refresh()
  }
  function toggleMarked(){
    const set=new Set(s.markedIds||[])
    if(set.has(q.id))set.delete(q.id);else set.add(q.id)
    save({...s,markedIds:[...set]})
  }
  async function finish(force=false,confirmed=false){
    if(lock.current)return
    const ranOut=timed&&Date.now()>=deadlineAt(s.startedAt,duration)
    const timedOut=force||ranOut
    const unfilled=questions.length-answeredCount
    if(s.type==='exam'&&!timedOut&&unfilled>0&&!confirmed){setConfirmSubmit(true);return}
    setConfirmSubmit(false)
    lock.current=true
    setFinishing(true)
    try{
      const answers:SessionAnswer[]=questions.map(x=>({
        questionId:x.id,questionnaireId:x.section+':'+x.questionnaireId,
        selected:s.selectedAnswers[x.id],correctAnswer:x.correctAnswer,
        scoringEligible:x.scoringEligible!==false,
        correct:x.scoringEligible!==false&&!!s.selectedAnswers[x.id]&&s.selectedAnswers[x.id]===x.correctAnswer
      }))
      const grade=gradeSession(answers,isCap)
      if(s.type==='exam'){
        const changes=new Map<string,QuestionProgress>()
        for(const x of questions){
          const key=s.selectedAnswers[x.id]
          if(!key||x.scoringEligible===false)continue
          const id=progressId(x)
          const prior=changes.get(id)||pm.get(id)||fresh(x)
          const ok=key===x.correctAnswer
          changes.set(id,{...prior,attempts:prior.attempts+1,correct:prior.correct+(ok?1:0),
            incorrect:prior.incorrect+(ok?0:1),streak:ok?prior.streak+1:0,lastAnsweredAt:Date.now(),
            lastAnswer:key,lastCorrect:ok})
        }
        if(changes.size){
          try{await putManyProgress([...changes.values()])}
          catch(err){console.error('El progreso local se guardó; sincronización pendiente.',err)}
        }
      }
      const completedAt=Date.now()
      const record:StudySessionRecord={
        type:s.type,label:s.label,startedAt:s.startedAt,completedAt,
        total:questions.length,answered:grade.answered,correct:grade.correct,incorrect:grade.incorrect,
        score:s.type==='study'?(grade.graded?percent(grade.correct,grade.graded-grade.blank):0):grade.scorePercentage,
        answers,
        capScoring:isCap,netPoints:isCap?grade.netPoints:undefined,gradedTotal:grade.graded,
        blank:grade.blank,excluded:grade.excluded,passed:grade.passed,
        timed, durationMinutes:timed?duration:undefined,
        finishedReason:timedOut?'timeout':'manual',
        elapsedSeconds:Math.round((completedAt-s.startedAt)/1000)
      }
      await addSession(record)
      localStorage.setItem(LAST,JSON.stringify({record,questionIds:s.questionIds}))
      localStorage.removeItem(ACTIVE)
      sessionStorage.removeItem(ACTIVE)
      await refresh()
      go('results')
    }catch(err){
      console.error(err)
      setFinishing(false)
      lock.current=false
      setSaveError('No hemos podido guardar el resultado. Tus respuestas siguen a salvo; intenta entregarlo otra vez.')
    }
  }
  useEffect(()=>{
    if(!timed)return
    const tick=()=>setNow(Date.now())
    tick()
    const id=window.setInterval(tick,1000)
    return()=>window.clearInterval(id)
  },[timed])
  useEffect(()=>{
    if(timed && Date.now()>=deadlineAt(s.startedAt,duration) && !lock.current){
      void finish(true)
    }
  // Timer runs from persisted start; the synchronous lock prevents duplicate submissions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[now,s.startedAt,s.durationMinutes,timed])

  async function downloadPdf(withSolutions=false){
    if(pdfBusy)return
    setPdfBusy(true)
    setPdfError('')
    try{
      const {exportExamPdf}=await import('./pdfExport')
      exportExamPdf({label:s.label,questions,withSolutions})
    }catch(err){
      console.error(err)
      setPdfError('No se pudo generar el PDF. Inténtalo de nuevo.')
    }finally{setPdfBusy(false)}
  }

  const renderFeedback=s.type==='study'&&checked
  const isCorrect=q.scoringEligible!==false&&selected===q.correctAnswer
  return <div className="quiz focus-quiz">
    <div className="quizhead focus-quiz-head">
      <button aria-label="Volver al inicio; el examen no se pausa" title="Volver sin pausar" onClick={()=>go('home')}>‹</button>
      <div><b>{s.label}</b><small>{s.currentIndex+1} / {questions.length}</small><Bar value={percent(s.currentIndex+1,questions.length)}/></div>
      <button className={favorite?'fav':''} aria-pressed={!!favorite} aria-label={favorite?'Quitar de favoritas':'Guardar en favoritas para próximos repasos'} title="Favorita: guardada para otros tests" onClick={()=>void toggleFavorite()}>★</button>
    </div>
    <div className="focus-exam-status">
      {timed?<div className={'focus-clock '+(left!==null&&left<=600000?'urgent':'')} role="timer" aria-label="Tiempo restante"><span>Tiempo restante</span><strong>{formatRemaining(left||0)}</strong></div>
        :<div className="focus-clock"><span>{s.type==='study'?'Estudio':'Práctica'}</span><strong>Sin límite</strong></div>}
      <div className="focus-exam-count"><span>Contestadas</span><strong>{answeredCount} / {questions.length}</strong></div>
      <button className={'focus-mark '+((s.markedIds||[]).includes(q.id)?'on':'')} onClick={toggleMarked} aria-pressed={(s.markedIds||[]).includes(q.id)}>⚑ { (s.markedIds||[]).includes(q.id)?'Marcada':'Revisar luego'}</button>
    </div>
    <p className="focus-mark-help">⚑ Revisar: solo durante este test. <span>★ Favorita: se guarda para otros repasos.</span></p>
    <div className="focus-result-exports">
      <button className="btn light focus-export-pdf" disabled={pdfBusy} onClick={()=>void downloadPdf(false)}>{pdfBusy?'Generando PDF…':'↓ PDF para practicar (sin respuestas)'}</button>
      <button className="btn light focus-export-study-pdf" disabled={pdfBusy} onClick={()=>void downloadPdf(true)}>{pdfBusy?'Generando PDF…':'↓ PDF para estudiar (con respuestas)'}</button>
    </div>
    {pdfError&&<p className="focus-muted" role="alert">{pdfError}</p>}
    <details className="focus-index">
      <summary>Índice de preguntas · {markedCount} marcadas para revisar</summary>
      <div className="focus-question-grid">{questions.map((x,index)=><button key={x.id}
        aria-label={'Pregunta '+(index+1)+(s.selectedAnswers[x.id]?', respondida':'')+((s.markedIds||[]).includes(x.id)?', marcada':'')}
        aria-current={index===s.currentIndex?'step':undefined}
        className={(index===s.currentIndex?'current ':'')+(s.selectedAnswers[x.id]?'answered ':'')+((s.markedIds||[]).includes(x.id)?'marked ':'')+(x.scoringEligible===false?'excluded':'')}
        onClick={()=>navigate(index)}>{index+1}</button>)}</div>
    </details>
    <article className="focus-question">
      <small>Pregunta {s.currentIndex+1} de {questions.length}{q.examId?' · original nº '+q.number:''}</small>
      <h2>{q.question}</h2>
      <p className="focus-frequency" role="note">{frequencyInfo?.denominator
        ?'↻ Aparece en '+frequencyInfo.count+' de '+frequencyInfo.denominator+' exámenes ('+Math.round(100*frequencyInfo.count/frequencyInfo.denominator)+' %)'
        :'↻ Frecuencia en exámenes históricos: sin dato contrastado'}</p>
      <div className="answers">{keys.map(k=>{
        let cls=selected===k?'selected':''
        if(renderFeedback&&q.scoringEligible!==false)cls=k===q.correctAnswer?'correct':selected===k?'wrong':''
        return <button key={k} className={cls} aria-pressed={selected===k}
          disabled={finishing||expired||(s.type==='study'&&checked)}
          onClick={()=>void select(k)}><i>{k}</i><span>{q.options[k]}</span></button>
      })}</div>
      {renderFeedback&&(q.scoringEligible===false
        ?<div className="feedback" role="status"><b>No puntúa · incidencia editorial</b><p>Tu respuesta no cuenta como acierto ni como error.</p>{decision&&<p>{decision.decision}</p>}{decision?.editorialAnswer&&<p>Orientación técnica: {decision.editorialAnswer}</p>}</div>
        :<div className={'feedback '+(isCorrect?'ok':'bad')} role="status"><b>{isCorrect?'✓ Correcta':'× Incorrecta · respuesta '+q.correctAnswer}</b><button onClick={()=>setRefShown(v=>!v)}>{refShown?'Ocultar':'Ver fundamento'}</button>{refShown&&<div><p><strong>Norma:</strong> {q.norm||'Sin referencia normativa adicional'}</p><p><strong>Referencia:</strong> {q.reference||'Consultar enunciado original'}</p></div>}</div>)}
    </article>
    {saveError&&<div className="focus-notice" role="alert"><span aria-hidden="true">ⓘ</span><span>{saveError}</span><button onClick={()=>setSaveError('')} aria-label="Cerrar aviso">×</button></div>}
    <footer className="focus-quiz-actions">
      <button className="btn light" disabled={s.currentIndex===0||finishing} onClick={()=>navigate(s.currentIndex-1)}>Anterior</button>
      <button className="btn light" disabled={s.currentIndex===questions.length-1||finishing} onClick={()=>navigate(s.currentIndex+1)}>Siguiente</button>
      <button className="btn primary" disabled={finishing} onClick={()=>void finish()}>{finishing?'Guardando…':'Entregar'}</button>
    </footer>
    {confirmSubmit&&<ConfirmDialog
      title="¿Entregar el examen?"
      message={'Quedan '+(questions.length-answeredCount)+' preguntas en blanco. Valdrán 0 puntos y no se registrarán como fallos. Puedes seguir respondiendo si lo prefieres.'}
      cancelLabel="Seguir respondiendo"
      confirmLabel="Entregar y corregir"
      onCancel={()=>setConfirmSubmit(false)}
      onConfirm={()=>{setConfirmSubmit(false);void finish(false,true)}}
    />}
    {isCap&&s.type==='exam'&&eligibleCount<100&&<p className="focus-muted">Este modelo conserva {questions.length} enunciados; {questions.length-eligibleCount} no puntúan. El resultado será orientativo.</p>}
  </div>
}
