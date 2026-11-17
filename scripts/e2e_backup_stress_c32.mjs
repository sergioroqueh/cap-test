// C32 stress/rollback tests, Chromium at localhost. No cloud API or real users.
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const A='11111111-1111-4111-8111-111111111111'
const browser=await chromium.launch({headless:true})
const context=await browser.newContext()
const page=await context.newPage()
const remote=[]
page.on('request',r=>{if(/supabase\.co|\/rest\/v1\//.test(r.url()))remote.push(r.url())})
try{
 await page.goto('http://127.0.0.1:5173/')
 const large=await page.evaluate(async(A)=>{
  const scope=await import('/src/localScope.ts')
  const db=await import('/src/db.ts')
  const recovery=await import('/src/backupRecovery.ts')
  scope.setLocalOwner(A)
  await db.clearAllData()
  const progress=[],journal=[],sessions=[]
  const base=1763400000000
  const QUESTIONS=2400,SESSIONS=480,ANSWERS=30
  for(let i=0;i<QUESTIONS;i++){
   const questionId='stress-q-'+String(i).padStart(5,'0')
   const time=base+i
   progress.push({questionId,questionnaireId:'cap-large',
     attempts:1,correct:1,incorrect:0,streak:1,lastAnsweredAt:time,
     lastAnswer:'A',lastCorrect:true,favorite:false,updatedAt:time})
   journal.push({eventId:'stress-event-'+i,deviceId:'stress-device',clock:i+1,
     occurredAt:time,questionId,questionnaireId:'cap-large',
     kind:'answer',answer:'A',correct:true})
  }
  const answers=Array.from({length:ANSWERS},(_,i)=>({
   questionId:'test-'+i,questionnaireId:'cap-large',selected:'A',
   correctAnswer:'A',correct:true
  }))
  for(let i=0;i<SESSIONS;i++)sessions.push({
   clientId:'stress-session-'+i,type:'exam',label:'Simulacro '+i,
   startedAt:base+i*1000,completedAt:base+i*1000+100,
   total:ANSWERS,answered:ANSWERS,correct:ANSWERS,incorrect:0,
   score:100,answers
  })
  const handle=await db.openDb()
  const tx=handle.transaction(['progress','progressEvents','sessions'],'readwrite')
  const completed=new Promise((resolve,reject)=>{
   tx.oncomplete=()=>resolve()
   tx.onabort=()=>reject(tx.error)
   tx.onerror=()=>reject(tx.error)
  })
  for(const row of progress)tx.objectStore('progress').put(row)
  for(const row of journal)tx.objectStore('progressEvents').add(row)
  for(const row of sessions)tx.objectStore('sessions').add(row)
  await completed
  handle.close()
  const start=performance.now()
  const backup=await recovery.exportFullBackup()
  const exportMs=Math.round(performance.now()-start)
  if(backup.progress.length!==QUESTIONS||backup.journal.length!==QUESTIONS||
     backup.sessions.length!==SESSIONS||backup.sessions[0].answers.length!==ANSWERS)
    throw Error('Large export lost full-fidelity data')
  window.c32backup=backup
  await db.clearAllData()
  // Deterministically inject an IndexedDB QuotaExceededError after 4 queued
  // progress writes. All preceding requests must ROLLBACK, not partially save.
  const original=IDBObjectStore.prototype.put
  let writes=0,caught=false
  IDBObjectStore.prototype.put=function(...args){
   if(this.name==='progress'&&++writes===5)
     throw new DOMException('Simulated storage full','QuotaExceededError')
   return original.apply(this,args)
  }
  try{await recovery.restoreFullBackup(backup)}
  catch(e){caught=e?.name==='QuotaExceededError'}
  finally{IDBObjectStore.prototype.put=original}
  if(!caught)throw Error('Injected quota failure did not propagate')
  if((await db.getAllProgress()).length||(await db.getRecentSessions(10)).length)
    throw Error('Storage failure caused partial restore')
  const restoreStart=performance.now()
  const first=await recovery.restoreFullBackup(backup)
  const second=await recovery.restoreFullBackup(backup)
  const restoreMs=Math.round(performance.now()-restoreStart)
  if(first.questions!==QUESTIONS||first.events!==QUESTIONS||
     first.sessions!==SESSIONS||second.questions!==QUESTIONS||
     (await db.getRecentSessions(SESSIONS+1)).length!==SESSIONS)
    throw Error('Large restore or idempotent retry lost or duplicated data')
  // Future edits must continue after restoring Lamport clock state.
  await (await import('/src/localJournal.ts')).recordStudyAnswer({
   eventId:'post-load-event',questionId:'post-load',questionnaireId:'cap-large',
   answer:'B',correct:false})
  const after=await import('/src/localJournal.ts')
  const last=(await after.readJournal()).find(e=>e.eventId==='post-load-event')
  if(!last||last.clock!==QUESTIONS+1)
    throw Error('Restored logical clock failed')
  return {questions:QUESTIONS,sessions:SESSIONS,
   answers:SESSIONS*ANSWERS,events:QUESTIONS,exportMs,restoreMs,quotaRollback:caught,
   bytes:JSON.stringify(backup).length}
 },A)
 assert.equal(large.questions,2400)
 assert.equal(large.sessions,480)
 assert.equal(large.quotaRollback,true)
 console.log('C32 STRESS PASS',JSON.stringify(large))

 const tab=await context.newPage()
 try{
  await tab.goto('http://127.0.0.1:5173/')
  // Restore same source and write unrelated new operation simultaneously.
  const results=await Promise.all([
   page.evaluate(async(A)=>{
    (await import('/src/localScope.ts')).setLocalOwner(A)
    return (await import('/src/backupRecovery.ts')).restoreFullBackup(window.c32backup)
   },A),
   tab.evaluate(async(A)=>{
    (await import('/src/localScope.ts')).setLocalOwner(A)
    return (await import('/src/localJournal.ts')).recordStudyAnswer({
     eventId:'stress-tab-race',questionId:'new-tab-question',
     questionnaireId:'cap-large',answer:'A',correct:true})
   },A)
  ])
  assert.equal(results[0].sessions,480)
  const check=await page.evaluate(async(A)=>{
   (await import('/src/localScope.ts')).setLocalOwner(A)
   const db=await import('/src/db.ts')
   const all=await db.getAllProgress()
   return {count:all.length,race:all.find(x=>x.questionId==='new-tab-question')?.attempts}
  },A)
  assert.equal(check.race,1)
  assert.equal(check.count,2402)
  console.log('C32 STRESS PASS concurrent tab merge + post-restoration write')
 }finally{await tab.close()}
 assert.deepEqual(remote,[])
 console.log('C32 STRESS PASS zero Supabase calls')
}finally{await context.close();await browser.close()}
