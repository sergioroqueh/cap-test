// C31: end-to-end local backup/restore in real Chromium, synthetic profiles.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const browser=await chromium.launch({headless:true})
const context=await browser.newContext()
const page=await context.newPage()
const remote=[]
page.on('request',r=>{if(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(r.url()))remote.push(r.url())})
try{
  await page.goto('http://127.0.0.1:5173/')
  const original=await page.evaluate(async(A)=>{
    const {setLocalOwner}=await import('/src/localScope.ts')
    const db=await import('/src/db.ts')
    const journal=await import('/src/localJournal.ts')
    const backup=await import('/src/backupRecovery.ts')
    setLocalOwner(A);await db.clearAllData()
    await journal.recordStudyAnswer({eventId:'answer-1',questionId:'cap-q',
      questionnaireId:'hist-a',answer:'A',correct:true})
    await journal.recordFavorite({eventId:'favorite-1',questionId:'cap-q',
      questionnaireId:'hist-b'})
    await db.addSession({clientId:'session-1',type:'exam',label:'Simulacro',
      startedAt:100,completedAt:200,total:2,answered:1,correct:1,incorrect:0,score:50,
      answers:[{questionId:'cap-q',questionnaireId:'hist-a',selected:'A',
        correctAnswer:'A',correct:true},{questionId:'cap-q2',questionnaireId:'hist-a',
        correctAnswer:'B',correct:false}]})
    const file=await backup.exportFullBackup()
    if(file.version!==3||file.owner?.userId!==A||file.journal.length!==2||
       file.sessions[0].answers.length!==2||!file.checksum)
      throw Error('Incomplete scoped v3 backup')
    return file
  },A)
  assert.equal(original.sessions.length,1)
  console.log('C31 PASS export: coherent v3, full session answers and checksum')

  const wrong=await page.evaluate(async({A,B,original})=>{
    const scope=await import('/src/localScope.ts')
    const db=await import('/src/db.ts')
    const backup=await import('/src/backupRecovery.ts')
    scope.setLocalOwner(B);await db.clearAllData()
    let refused=false, cause=''
    try{await backup.restoreFullBackup(original)}catch(e){
      cause=String(e);refused=cause.includes('otro perfil')
    }
    const bRows=await db.getAllProgress()
    if(!refused||bRows.length)throw Error('Wrong account imported: '+cause+'; B rows='+bRows.length)
    scope.setLocalOwner(null)
    refused=false
    try{await backup.restoreFullBackup(original)}catch(e){
      refused=String(e).includes('otro perfil')
    }
    if(!refused)throw Error('Account backup imported into guest')
    scope.setLocalOwner(A)
    return true
  },{A,B,original})
  assert.equal(wrong,true)
  console.log('C31 PASS owner isolation A/B/guest')

  const restored=await page.evaluate(async({A,original})=>{
    const scope=await import('/src/localScope.ts')
    const db=await import('/src/db.ts')
    const journal=await import('/src/localJournal.ts')
    const backup=await import('/src/backupRecovery.ts')
    scope.setLocalOwner(A)
    await db.clearAllData()
    const a=await backup.restoreFullBackup(original)
    const b=await backup.restoreFullBackup(original)
    const questions=await db.getAllProgress()
    const sessions=await db.getRecentSessions(10)
    if(a.questions!==1||a.sessions!==1||a.events!==2||
       b.events!==2||questions[0].attempts!==1||!questions[0].favorite||
       sessions.length!==1||sessions[0].answers.length!==2)
      throw Error('Loss or duplicate after round-trip/repeat')
    await journal.recordStudyAnswer({eventId:'answer-after-recovery',questionId:'cap-q',
      questionnaireId:'hist-a',answer:'B',correct:false})
    if((await db.getAllProgress())[0].attempts!==2||
       (await journal.readJournal()).filter(x=>x.kind==='legacy-baseline').length)
      throw Error('Restored origin failed or fabricated baseline')
    return {questions:a.questions,sessions:a.sessions,events:a.events}
  },{A,original})
  assert.deepEqual(restored,{questions:1,sessions:1,events:2})
  console.log('C31 PASS wipe→restore→retry→continue with no baseline duplication')

  const invalid=await page.evaluate(async({A,original})=>{
    const scope=await import('/src/localScope.ts')
    const db=await import('/src/db.ts')
    const backup=await import('/src/backupRecovery.ts')
    scope.setLocalOwner(A)
    const copy=structuredClone(original)
    copy.progress[0].attempts=9
    let refused=false
    try{await backup.restoreFullBackup(copy)}catch(e){
      refused=String(e).includes('huella de integridad')
    }
    if(!refused)throw Error('Tampered file accepted')
    const oldCount=(await db.getRecentSessions(10)).length
    const conflicting=structuredClone(original)
    conflicting.sessions[0].answers[0].correct=false
    const canonical=x=>Array.isArray(x)?x.map(canonical):
      x&&typeof x==='object'?Object.fromEntries(Object.entries(x)
        .filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b))
        .map(([k,v])=>[k,canonical(v)])):x
    const unsigned={version:conflicting.version,exportedAt:conflicting.exportedAt,
      owner:conflicting.owner,progress:conflicting.progress,
      sessions:conflicting.sessions,journal:conflicting.journal}
    const digest=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(JSON.stringify(canonical(unsigned))))
    conflicting.checksum=[...new Uint8Array(digest)]
      .map(v=>v.toString(16).padStart(2,'0')).join('')
    let collision=false
    try{await backup.restoreFullBackup(conflicting)}catch(e){
      collision=String(e).includes('SESSION_KEY_COLLISION')||
        String(e).includes('Sesión divergente')
    }
    if(!collision||(await db.getRecentSessions(10)).length!==oldCount)
      throw Error('Session collision caused partial write')
    return {tamper:refused,rollback:collision}
  },{A,original})
  assert.deepEqual(invalid,{tamper:true,rollback:true})
  console.log('C31 PASS checksum mismatch, session collision, rollback')

  const legacy=await page.evaluate(async({A,original})=>{
    const scope=await import('/src/localScope.ts')
    const db=await import('/src/db.ts')
    const backup=await import('/src/backupRecovery.ts')
    const oldV2={version:2,exportedAt:'2026-11-17T00:00:00.000Z',
      progress:[{questionId:'old-q',questionnaireId:'old',
        attempts:3,correct:2,incorrect:1,streak:1,lastAnsweredAt:200,favorite:false}],
      sessions:[{id:17,type:'study',label:'Antiguo',startedAt:1,completedAt:2,
        total:1,answered:1,correct:1,incorrect:0,score:100,
        answers:[{questionId:'old-q',questionnaireId:'old',selected:'A',
          correctAnswer:'A',correct:true}]}]}
    scope.setLocalOwner(A)
    let forbidden=false
    try{await backup.restoreFullBackup(oldV2)}catch(e){
      forbidden=String(e).includes('no identifica propietario')
    }
    if(!forbidden)throw Error('Unsigned v2 in account')
    scope.setLocalOwner(null)
    await db.clearAllData()
    const result=await backup.restoreFullBackup(oldV2)
    const first=(await db.getRecentSessions(4))[0].clientId
    if(result.legacy!==true||!first||!first.startsWith('legacy-import-'))
      throw Error('Unsigned guest import incomplete')
    let duplicate=false
    try{await backup.restoreFullBackup(oldV2)}catch(e){
      duplicate=String(e).includes('perfil invitado vacío')
    }
    if(!duplicate)throw Error('Old import repeated into non-empty guest')
    await db.clearAllData()
    const oldV3=structuredClone(original)
    delete oldV3.owner;delete oldV3.checksum
    const v3=await backup.restoreFullBackup(oldV3)
    if(v3.version!==3||!v3.legacy||v3.events!==2)throw Error('Legacy v3 not recovered')
    scope.setLocalOwner(A)
    return {v2Id:first,v3Events:v3.events}
  },{A,original})
  assert.ok(legacy.v2Id.startsWith('legacy-import-'))
  assert.equal(legacy.v3Events,2)
  console.log('C31 PASS v2/v3 unbound recovery guest-only, owner protected')

  const tab=await context.newPage()
  try {
    await tab.goto('http://127.0.0.1:5173/')
    const simultaneous=await Promise.all([
      page.evaluate(async({A,original})=>{
        (await import('/src/localScope.ts')).setLocalOwner(A)
        return (await import('/src/backupRecovery.ts')).restoreFullBackup(original)
      },{A,original}),
      tab.evaluate(async(A)=>{
        (await import('/src/localScope.ts')).setLocalOwner(A)
        return (await import('/src/localJournal.ts')).recordStudyAnswer({
          eventId:'tab-c31',questionId:'new-question',questionnaireId:'hist-a',
          answer:'D',correct:false})
      },A)
    ])
    const counts=await page.evaluate(async(A)=>{
      (await import('/src/localScope.ts')).setLocalOwner(A)
      const db=await import('/src/db.ts')
      return (await db.getAllProgress()).find(x=>x.questionId==='new-question')?.attempts
    },A)
    assert.equal(counts,1,'Concurrent restore lost a second tab write')
    assert.equal(simultaneous[0].sessions,1)
  } finally {await tab.close()}
  console.log('C31 PASS concurrent tab write + restore')

  const switched=await page.evaluate(async({A,B,original})=>{
    const scope=await import('/src/localScope.ts')
    const backup=await import('/src/backupRecovery.ts')
    scope.setLocalOwner(A)
    const pending=backup.restoreFullBackup(original)
    scope.setLocalOwner(B)
    let denied=false
    try{await pending}catch(e){denied=String(e).includes('perfil cambió')}
    scope.setLocalOwner(A)
    return denied
  },{A,B,original})
  assert.equal(switched,true,'Logout/identity change not rejected')
  assert.deepEqual(remote,[],'No Supabase requests allowed')
  console.log('C31 PASS cancelled on identity change, no remote calls')
} finally {await context.close();await browser.close()}
