// C30: local-only tests against real Chromium IndexedDB (synthetic identities).
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const C='33333333-3333-4333-8333-333333333333'
const browser=await chromium.launch({headless:true})
const context=await browser.newContext()
const page=await context.newPage()
const outgoing=[]
page.on('request',r=>{if(/supabase\.co|\/rest\/v1\//.test(r.url()))outgoing.push(r.url())})
try {
  await page.goto('http://127.0.0.1:5173/')
  await page.evaluate(async()=>{
    const [scope,db,journal,core]=await Promise.all([
      import('/src/localScope.ts'),import('/src/db.ts'),
      import('/src/localJournal.ts'),import('/src/syncCore.mjs')
    ])
    window.c30={scope,db,journal,core}
  })
  await context.setOffline(true)
  const offline=await page.evaluate(async([A,B])=>{
    const {scope,db,journal,core}=window.c30
    scope.setLocalOwner(A)
    await db.clearAllData()
    const ans=(eventId,answer,correct,questionnaireId='first')=>
      ({eventId,questionId:'canonical',questionnaireId,answer,correct})
    await journal.recordStudyAnswer(ans('one','A',true))
    await journal.recordStudyAnswer(ans('one','A',true))
    await journal.recordStudyAnswer(ans('two','B',false,'second'))
    await journal.recordFavorite({eventId:'favorite',questionId:'canonical',questionnaireId:'second'})
    const p=(await db.getAllProgress())[0],events=await journal.readJournal()
    if(p.attempts!==2||p.correct!==1||p.incorrect!==1||!p.favorite)throw Error('Lost answer or favorite')
    if(events.length!==3||events.some(x=>x.questionnaireId!=='first'))throw Error('Duplicate or canonical drift')
    if(core.replayProgress(events)[0].attempts!==2)throw Error('Deterministic replay mismatch')
    scope.setLocalOwner(B)
    if((await db.getAllProgress()).length)throw Error('Account isolation broken')
    scope.setLocalOwner(A)
    return {events:events.length,attempts:p.attempts}
  },[A,B])
  assert.deepEqual(offline,{events:3,attempts:2})
  await context.setOffline(false)
  await page.reload()
  const reloaded=await page.evaluate(async(A)=>{
    const scope=await import('/src/localScope.ts'),db=await import('/src/db.ts')
    scope.setLocalOwner(A)
    return (await db.getAllProgress())[0].attempts
  },A)
  assert.equal(reloaded,2)
  console.log('C30 PASS: offline, retry, canonical CAP question, A/B, reload')

  const legacy=await page.evaluate(async(C)=>{
    const {setLocalOwner,localDbName}=await import('/src/localScope.ts')
    setLocalOwner(C)
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open(localDbName(),1)
      request.onupgradeneeded=()=>{
        const db=request.result
        const p=db.createObjectStore('progress',{keyPath:'questionId'})
        p.createIndex('questionnaireId','questionnaireId',{unique:false})
        const s=db.createObjectStore('sessions',{keyPath:'id',autoIncrement:true})
        s.createIndex('completedAt','completedAt',{unique:false})
      }
      request.onerror=()=>reject(request.error)
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction(['progress','sessions'],'readwrite')
        tx.objectStore('progress').put({questionId:'legacy',questionnaireId:'old',
          attempts:3,correct:2,incorrect:1,streak:1,lastAnsweredAt:123,
          favorite:false,updatedAt:123})
        tx.objectStore('sessions').add({type:'study',label:'old',startedAt:1,
          completedAt:2,total:1,answered:1,correct:1,incorrect:0,score:100,answers:[]})
        tx.oncomplete=()=>{db.close();resolve()}
        tx.onabort=()=>{db.close();reject(tx.error)}
      }
    })
    const db=await import('/src/db.ts'),journal=await import('/src/localJournal.ts')
    const session=(await db.getRecentSessions(2))[0]
    if(!session.clientId||session.id!==1)throw Error('Legacy session ID not persisted')
    await db.ensureLegacySessionIds()
    if((await db.getRecentSessions(2))[0].clientId!==session.clientId)
      throw Error('Legacy ID changed')
    await journal.recordStudyAnswer({eventId:'post-v1',questionId:'legacy',
      questionnaireId:'old',answer:'B',correct:false})
    const events=await journal.readJournal()
    if(events.filter(x=>x.kind==='legacy-baseline').length!==1)
      throw Error('Legacy history not explicitly baselined')
    const core=await import('/src/syncCore.mjs')
    if(core.replayProgress(events)[0].attempts!==4)throw Error('Legacy counts lost')
    const backup=await db.exportDatabase()
    if(backup.version!==3||backup.journal.length!==2||!backup.sessions[0].clientId)
      throw Error('Incomplete local backup')
    let rejected=false
    try{await db.importProgress([{...backup.progress[0],attempts:5,correct:3,incorrect:2}])}
    catch(e){rejected=String(e).includes('No se puede sobrescribir progreso')}
    if(!rejected)throw Error('Tracked data overwritten by aggregate import')
    return {id:session.clientId,events:events.length}
  },C)
  assert.equal(legacy.events,2)
  console.log('C30 PASS: v1->v2 upgrade, stable ID, legacy baseline, import guard')

  const exam=await page.evaluate(async(A)=>{
    const {scope,db,journal}=await Promise.all([
      import('/src/localScope.ts'),import('/src/db.ts'),import('/src/localJournal.ts')
    ]).then(([scope,db,journal])=>({scope,db,journal}))
    scope.setLocalOwner(A)
    const answers=[{questionId:'x',questionnaireId:'exam',selected:'A',
      correctAnswer:'A',correct:true}]
    const record={clientId:'exam-c30',type:'exam',label:'CAP',startedAt:100,
      completedAt:200,total:1,answered:1,correct:1,incorrect:0,score:100,answers}
    const ops=[{eventId:'exam-c30:answer:0',questionId:'x',
      questionnaireId:'exam',answer:'A',correct:true}]
    const first=await journal.completeExam(ops,record)
    const again=await journal.completeExam(ops,{...record,completedAt:300})
    if(first.id!==again.id)throw Error('Duplicate exam on retry')
    if((await db.getAllProgress()).find(x=>x.questionId==='x')?.attempts!==1)
      throw Error('Duplicate grading')
    const before=(await journal.readJournal()).length
    let rejected=false
    try{await journal.completeExam([
      {eventId:'rollback-1',questionId:'z1',questionnaireId:'exam',answer:'A',correct:true},
      {eventId:'rollback-2',questionId:'z2',questionnaireId:'exam',answer:'E',correct:false}
    ],{...record,clientId:'rollback'})}
    catch(e){rejected=String(e).includes('respuesta inválida')}
    if(!rejected||(await journal.readJournal()).length!==before ||
       (await db.getAllProgress()).some(x=>x.questionId==='z1'))
      throw Error('Transaction did not roll back')
    return {first:first.id,again:again.id,events:before}
  },A)
  assert.equal(exam.first,exam.again)
  // Two tabs share one account's IndexedDB. Readwrite transactions must
  // serialize the competing events, rather than apply stale in-memory totals.
  const tab2=await context.newPage()
  try{
    await tab2.goto('http://127.0.0.1:5173/')
    // page.evaluate cannot serialize a higher-order closure; pass each ID explicitly.
    await Promise.all([
      page.evaluate(async(A)=>{
        (await import('/src/localScope.ts')).setLocalOwner(A)
        await (await import('/src/localJournal.ts')).recordStudyAnswer({
          eventId:'tab-one',questionId:'same-tab-question',questionnaireId:'concurrency',
          answer:'A',correct:true})
      },A),
      tab2.evaluate(async(A)=>{
        (await import('/src/localScope.ts')).setLocalOwner(A)
        await (await import('/src/localJournal.ts')).recordStudyAnswer({
          eventId:'tab-two',questionId:'same-tab-question',questionnaireId:'concurrency',
          answer:'B',correct:false})
      },A)
    ])
    const attempts=await page.evaluate(async(A)=>{
      (await import('/src/localScope.ts')).setLocalOwner(A)
      return (await (await import('/src/db.ts')).getAllProgress())
        .find(x=>x.questionId==='same-tab-question')?.attempts
    },A)
    assert.equal(attempts,2,'Concurrent tabs lost an attempt')
    console.log('C30 PASS: two-tab transactional concurrency')
  } finally {await tab2.close()}
  const independent=await browser.newContext()
  try{
    const p=await independent.newPage()
    await p.goto('http://127.0.0.1:5173/')
    const count=await p.evaluate(async(A)=>{
      const {setLocalOwner}=await import('/src/localScope.ts')
      setLocalOwner(A)
      return (await import('/src/db.ts')).getAllProgress().then(x=>x.length)
    },A)
    assert.equal(count,0)
  } finally {await independent.close()}
  assert.deepEqual(outgoing,[])
  console.log('C30 PASS: atomic exam, rollback, other browser, zero remote requests')
} finally {await context.close();await browser.close()}
