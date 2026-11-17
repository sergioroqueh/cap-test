import { openDb, requestAsPromise } from './db'
import { localBackupOwner, localOwnerGeneration, type BackupOwner } from './localScope'
import { unionRecords, replayProgress } from './syncCore.mjs'
import type { QuestionProgress, StudySessionRecord, AnswerKey } from './types'
import type { JournalEvent } from './localJournal'

// C31: all data remains in the currently selected LOCAL IndexedDB.
// The SHA-256 checksum detects accidental corruption; it is NOT a signature,
// does NOT authenticate the user, and is NEVER an entitlement credential.
const P='progress', S='sessions', J='progressEvents', M='syncMeta'
const stores=[P,S,J,M]
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const letter=(x:unknown):x is AnswerKey=>['A','B','C','D'].includes(x as string)
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const str=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=200
const nat=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0
const canonical=(x:unknown):unknown=>Array.isArray(x)?x.map(canonical):
  obj(x)?Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const fail=(message:string):never=>{throw new Error(message)}
function ownerMatches(a:BackupOwner,b:BackupOwner):boolean {
  return a.kind===b.kind && (a.kind!=='user'||(b.kind==='user'&&a.userId===b.userId))
}
function ownerValid(x:unknown):x is BackupOwner {
  return obj(x) && (x.kind==='guest'||x.kind==='preview'||
    (x.kind==='user' && typeof x.userId==='string' && uuid.test(x.userId)))
}
function assertProfile(rows:unknown):asserts rows is QuestionProgress[] {
  if(!Array.isArray(rows)) throw Error('Lista de progreso ausente.')
  if(rows.length>200000) throw Error('Lista de progreso demasiado grande.')
  const seen=new Set<string>()
  for(const row of rows){
    if(!obj(row)||!str(row.questionId)||!str(row.questionnaireId)||
        !nat(row.attempts)||!nat(row.correct)||!nat(row.incorrect)||!nat(row.streak)||
        Number(row.correct)+Number(row.incorrect)!==Number(row.attempts) ||
        !nat(row.lastAnsweredAt)||typeof row.favorite!=='boolean'||
        (row.updatedAt!==undefined&&!nat(row.updatedAt))||
        (row.lastAnswer!==undefined&&!letter(row.lastAnswer))||
        (row.lastCorrect!==undefined&&typeof row.lastCorrect!=='boolean'))
      fail('Copia con progreso inválido o incompleto.')
    if(seen.has(row.questionId as string))fail('Copia con preguntas duplicadas.')
    seen.add(row.questionId as string)
    if(JSON.stringify(row).length>16384)fail('Progreso individual demasiado grande.')
  }
}
function assertSessions(rows:unknown):asserts rows is StudySessionRecord[] {
  if(!Array.isArray(rows)) throw Error('Historial de sesiones ausente.')
  if(rows.length>100000) throw Error('Historial de sesiones demasiado grande.')
  for(const row of rows){
    if(!obj(row)||!['study','exam'].includes(row.type as string)||!str(row.label)||
       !nat(row.startedAt)||!nat(row.completedAt)||!nat(row.total)||!nat(row.answered)||
       !nat(row.correct)||!nat(row.incorrect)||typeof row.score!=='number'||
       !Number.isFinite(row.score)||!Array.isArray(row.answers)||
       (row.clientId!==undefined&&!str(row.clientId))||
       (row.id!==undefined&&(!Number.isSafeInteger(row.id)||Number(row.id)<1)))
      fail('Copia con sesión inválida o sin respuestas.')
    for(const a of row.answers){
      if(!obj(a)||!str(a.questionId)||!str(a.questionnaireId)||
         !letter(a.correctAnswer)||typeof a.correct!=='boolean'||
         (a.selected!==undefined&&!letter(a.selected))||
         (a.scoringEligible!==undefined&&typeof a.scoringEligible!=='boolean'))
        fail('Copia con detalle de respuesta inválido.')
    }
    if(JSON.stringify(row).length>524288)fail('Una sesión supera el tamaño permitido.')
  }
}
function assertJournal(rows:unknown):asserts rows is JournalEvent[] {
  if(!Array.isArray(rows)||rows.length>200000)fail('Diario de operaciones ausente o excesivo.')
}
type Snapshot={progress:QuestionProgress[];sessions:StudySessionRecord[];journal:JournalEvent[]}
type RawBackup={version:number;exportedAt?:string;owner?:BackupOwner;checksum?:string;
  progress:QuestionProgress[];sessions:StudySessionRecord[];journal?:JournalEvent[]}
function withoutLocalId(s:StudySessionRecord):StudySessionRecord {
  const {id: _numeric, ...rest}=s;return rest
}
function scopeCapture(){
  const owner=localBackupOwner(),generation=localOwnerGeneration()
  const verify=()=>{
    if(generation!==localOwnerGeneration()||!ownerMatches(owner,localBackupOwner()))
      fail('El perfil cambió durante la operación. No se ha aplicado la copia.')
  }
  return {owner,verify}
}
function done(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve()
    tx.onabort=()=>reject(tx.error||new Error('Transacción local cancelada.'))
    tx.onerror=()=>reject(tx.error||new Error('Error del almacenamiento local.'))
  })
}
async function readAll(tx:IDBTransaction):Promise<Snapshot>{
  const [progress,sessions,journal]=await Promise.all([
    requestAsPromise(tx.objectStore(P).getAll()),
    requestAsPromise(tx.objectStore(S).getAll()),
    requestAsPromise(tx.objectStore(J).getAll())
  ])
  return {progress:progress as QuestionProgress[],sessions:sessions as StudySessionRecord[],
    journal:journal as JournalEvent[]}
}
async function digest(payload:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(JSON.stringify(canonical(payload)))
  const hash=await crypto.subtle.digest('SHA-256',bytes)
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')
}
function unsigned(backup:RawBackup){
  return {version:backup.version,exportedAt:backup.exportedAt,owner:backup.owner,
    progress:backup.progress,sessions:backup.sessions,journal:backup.journal}
}
async function normalizeSessions(rows:StudySessionRecord[],format:number):Promise<StudySessionRecord[]>{
  const result:StudySessionRecord[]=[]
  for(const session of rows){
    const value=withoutLocalId(session)
    if(value.clientId){result.push(value);continue}
    if(!nat(session.id)||Number(session.id)<1)
      fail('Una sesión antigua no tiene ID estable ni identificador numérico recuperable.')
    const hashed=await digest({format,session})
    result.push({...value,clientId:'legacy-import-'+hashed})
  }
  return result
}
function progressReplayed(progress:QuestionProgress[],events:JournalEvent[]):Map<string,QuestionProgress>{
  const records=replayProgress(events) as QuestionProgress[]
  const map=new Map(records.map(x=>[x.questionId,x]))
  const input=new Map(progress.map(x=>[x.questionId,x]))
  for(const row of records){
    const saved=input.get(row.questionId)
    if(!saved||!same(saved,row))
      fail('El progreso no coincide con su diario de operaciones: '+row.questionId)
  }
  return map
}
function validateSnapshot(s:Snapshot):Snapshot{
  assertProfile(s.progress);assertSessions(s.sessions);assertJournal(s.journal)
  // C29 core checks event ownership keys, types, baselines, immutable sessions
  // and duplicate ID collision (without uploading anything).
  unionRecords({events:[],sessions:[]},{events:s.journal,sessions:s.sessions})
  progressReplayed(s.progress,s.journal)
  return s
}
export async function exportFullBackup(){
  const scope=scopeCapture()
  const {ensureLegacySessionIds}=await import('./db')
  scope.verify()
  await ensureLegacySessionIds()
  scope.verify()
  const db=await openDb()
  let snapshot:Snapshot
  try {
    const tx=db.transaction(stores,'readonly')
    snapshot=await readAll(tx)
  } finally {db.close()}
  scope.verify()
  validateSnapshot(snapshot)
  const backup:RawBackup={
    version:3,exportedAt:new Date().toISOString(),owner:scope.owner,
    progress:snapshot.progress,
    sessions:snapshot.sessions.map(withoutLocalId),
    journal:snapshot.journal
  }
  const checksum=await digest(unsigned(backup))
  scope.verify()
  return {...backup,checksum}
}
async function prepareBackup(input:unknown, currentOwner:BackupOwner):Promise<{
  snapshot:Snapshot; legacy:boolean; version:number
}>{
  if(!obj(input)||![2,3].includes(input.version as number))
    fail('Formato de copia no compatible (solo versiones 2 o 3).')
  if(JSON.stringify(input).length>50_000_000)
    fail('Archivo de copia demasiado grande.')
  const row=input as RawBackup
  const version=row.version
  const owned=row.owner!==undefined||row.checksum!==undefined
  if(owned){
    if(version!==3)fail('Las copias identificadas deben usar el formato v3.')
    if(!ownerValid(row.owner))fail('El propietario de la copia es inválido.')
    if(typeof row.checksum!=='string'||!/^[0-9a-f]{64}$/.test(row.checksum))
      fail('La huella SHA-256 de la copia no es válida.')
    if(!ownerMatches(row.owner as BackupOwner,currentOwner))
      fail('Esta copia pertenece a otro perfil. No se pueden mezclar cuentas.')
    if(await digest(unsigned(row))!==row.checksum)
      fail('La huella de integridad de la copia no coincide (archivo alterado o dañado).')
  }else if(currentOwner.kind==='user'){
    fail('La copia antigua no identifica propietario: solo se admite en un perfil invitado vacío.')
  }
  assertProfile(row.progress);assertSessions(row.sessions)
  const sessions=await normalizeSessions(row.sessions,version)
  const snapshot={progress:row.progress,sessions,
    journal:version===3?(row.journal as JournalEvent[]):[]}
  validateSnapshot(snapshot)
  return {snapshot,legacy:!owned,version}
}
/** Read-only preview: validate ownership, checksum and full content before asking
 * for confirmation. Restore revalidates everything inside its own transaction.
 */
export async function inspectFullBackup(input:unknown):Promise<{
 version:number; legacy:boolean; questions:number; sessions:number; events:number
}>{
  const scope=scopeCapture()
  const prepared=await prepareBackup(input,scope.owner)
  scope.verify()
  return {
    version:prepared.version,legacy:prepared.legacy,
    questions:prepared.snapshot.progress.length,
    sessions:prepared.snapshot.sessions.length,
    events:prepared.snapshot.journal.length
  }
}
function mergeExisting(local:Snapshot, incoming:Snapshot):Snapshot{
  const current=validateSnapshot(local), source=validateSnapshot(incoming)
  const localReplay=progressReplayed(current.progress,current.journal)
  const remoteReplay=progressReplayed(source.progress,source.journal)
  // O(1) provenance checks: O(n^2) Array.some became prohibitive for large backups.
  const localIds=new Set(current.progress.map(row=>row.questionId))
  const incomingIds=new Set(source.progress.map(row=>row.questionId))
  const union=unionRecords(
    {events:current.journal,sessions:current.sessions},
    {events:source.journal,sessions:source.sessions})
  const journal=union.events as JournalEvent[]
  const sessions=union.sessions as StudySessionRecord[]
  const replay= new Map((replayProgress(journal) as QuestionProgress[]).map(x=>[x.questionId,x]))
  const merged=new Map<string,QuestionProgress>()
  for(const row of [...current.progress,...source.progress]){
    const prior=merged.get(row.questionId)
    if(replay.has(row.questionId)){
      if((localIds.has(row.questionId)&&!localReplay.has(row.questionId))||
         (incomingIds.has(row.questionId)&&!remoteReplay.has(row.questionId)))
        fail('Conflicto con progreso histórico sin operaciones verificables: '+row.questionId)
      merged.set(row.questionId,replay.get(row.questionId)!)
    }else{
      if(prior&&!same(prior,row))
        fail('Dos instantáneas antiguas se contradicen. No se suman contadores.')
      merged.set(row.questionId,row)
    }
  }
  return {progress:[...merged.values()],sessions,journal}
}
export async function restoreFullBackup(input:unknown):Promise<{
  version:number; legacy:boolean;questions:number;sessions:number;events:number
}>{
  const scope=scopeCapture()
  const prepared=await prepareBackup(input,scope.owner)
  scope.verify()
  const db=await openDb()
  const tx=db.transaction(stores,'readwrite')
  const completed=done(tx)
  try {
    const existing=await readAll(tx)
    scope.verify()
    if(prepared.legacy&&(existing.progress.length||existing.sessions.length||existing.journal.length))
      fail('Las copias antiguas sin propietario solo se restauran en un perfil invitado vacío.')
    // Assign IDs to older local sessions inside the SAME rollback-able transaction.
    const withIds:Snapshot={...existing,
      sessions:existing.sessions.map(s=>s.clientId?s:{...s,clientId:crypto.randomUUID()})}
    const merged=mergeExisting(withIds,prepared.snapshot)
    scope.verify()
    const progressStore=tx.objectStore(P),sessionStore=tx.objectStore(S)
    const journalStore=tx.objectStore(J),metaStore=tx.objectStore(M)
    const previousSessions=new Map(withIds.sessions.map(s=>[s.clientId!,s]))
    for(const session of withIds.sessions)if(!existing.sessions.find(s=>s.id===session.id)?.clientId)
      sessionStore.put(session)
    for(const row of merged.progress)progressStore.put(row)
    for(const session of merged.sessions){
      if(!previousSessions.has(session.clientId!))
        sessionStore.add(withoutLocalId(session))
    }
    for(const ev of merged.journal)journalStore.put(ev)
    const eventsByQuestion=new Map<string,JournalEvent[]>()
    for(const event of merged.journal){
      const group=eventsByQuestion.get(event.questionId)||[]
      group.push(event);eventsByQuestion.set(event.questionId,group)
    }
    for(const [questionId,events] of eventsByQuestion){
      const baseline=events.find(e=>e.kind==='legacy-baseline')
      metaStore.put({key:'origin:'+questionId,baselineId:baseline?.eventId||null})
    }
    // Never copy the source device ID; restored events keep their original
    // immutable deviceId, but subsequent operations belong to this browser.
    const previousClock=await requestAsPromise(metaStore.get('clock')) as {value?:number}|undefined
    // Avoid Math.max(...largeArray): spreading >100k events can overflow the stack.
    let maxClock=previousClock?.value||0
    for(const event of merged.journal){
      if(!nat(event.clock)) fail('Reloj lógico de evento inválido.')
      if(event.clock>maxClock) maxClock=event.clock
    }
    if(!nat(maxClock)||maxClock>=Number.MAX_SAFE_INTEGER)
      fail('Reloj lógico fuera de rango.')
    metaStore.put({key:'clock',value:maxClock})
    if(!await requestAsPromise(metaStore.get('deviceId')))
      metaStore.put({key:'deviceId',value:crypto.randomUUID()})
    scope.verify()
    await completed
    return {version:prepared.version,legacy:prepared.legacy,
      questions:merged.progress.length,sessions:merged.sessions.length,
      events:merged.journal.length}
  } catch(error){
    try {tx.abort()}catch{/* no active transaction */}
    await completed.catch(()=>{})
    throw error
  } finally {db.close()}
}
