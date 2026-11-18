// C49: synthetic durable witness in a separate Node process / SQLite fixture.
// Not a production server, HSM, remotely isolated service, or atomic cross-DB protocol.
import {DatabaseSync} from 'node:sqlite'
import {existsSync,copyFileSync,rmSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto'
import {createC47WitnessAuthority,verifyC47Signature,C47_RECEIPT_DOMAIN}
 from './c47_witness_authority.mjs'
import {signC48Fixture,C48_ATTEST_DOMAIN,C48_ROTATE_DOMAIN,C48_POP_DOMAIN}
 from './c48_external_witness_mock.mjs'

const bad=code=>{const e=Error(code);e.code=code;throw e}
const sha=x=>createHash('sha256').update(x).digest('hex')
const canonical=v=>{
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v)
 if(typeof v==='number'&&Number.isSafeInteger(v))return JSON.stringify(v)
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
 bad('CANONICAL_INVALID')
}
const pair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1',
 publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
const pathCheck=(externalPath,paths)=>{
 if(typeof externalPath!=='string'||!externalPath||
  !paths||typeof paths.dbPath!=='string'||typeof paths.witnessPath!=='string'||
  resolve(paths.dbPath)===resolve(paths.witnessPath)||
  [paths.dbPath,paths.witnessPath].some(x=>resolve(x)===resolve(externalPath))||
  // A fixture-level separate directory only; NOT OS-account isolation.
  dirname(resolve(externalPath))===dirname(resolve(paths.dbPath))||
  dirname(resolve(externalPath))===dirname(resolve(paths.witnessPath)))
  bad('FIXTURE_PATH_ISOLATION_REQUIRED')
}
function localCheckpoint(paths){
 if(!existsSync(paths.dbPath)||!existsSync(paths.witnessPath))bad('LOCAL_PAIR_MISSING')
 let api
 try{
  api=createC47WitnessAuthority(paths)
  const data=api.inspect(),publicKey=api.getPublicKey()
  api.close();api=null
  const db=new DatabaseSync(paths.witnessPath,{readOnly:true})
  let w
  try{w=db.prepare('SELECT * FROM checkpoint WHERE id=1').get()}
  finally{db.close()}
  if(!w||w.seq!==data.sequence||w.epoch!==data.epoch||w.public_pem!==publicKey)
   bad('LOCAL_CHECKPOINT_RACE')
  return {sequence:data.sequence,epoch:data.epoch,revision:data.revision,
   stateDigest:w.state_digest,localRoot:sha(publicKey),publicKey}
 }finally{api?.close()}
}
const equal=(a,b)=>a.sequence===b.sequence&&a.epoch===b.epoch&&
 a.stateDigest===b.stateDigest&&a.localRoot===b.localRoot
function begin(db,fn){
 db.exec('BEGIN IMMEDIATE')
 try{
  const result=fn()
  db.exec('COMMIT')
  return result
 }catch(e){try{db.exec('ROLLBACK')}catch{};throw e}
}
const fetchState=db=>db.prepare('SELECT * FROM anchor WHERE id=1').get()
const fetchPending=db=>db.prepare("SELECT op_id FROM operations WHERE status='pending'").get()
const checkActive=s=>{if(s.compromised)bad('ACTIVE_ROOT_COMPROMISED')}
const checkpoint=s=>({sequence:s.sequence,epoch:s.epoch,revision:s.revision,
 stateDigest:s.state_digest,localRoot:s.local_root,publicKey:s.local_public})
const compare=(local,s)=>{
 if(local.localRoot!==s.local_root)bad('LOCAL_ROOT_SUBSTITUTION')
 if(local.sequence<s.sequence||local.epoch<s.epoch)bad('ROLLBACK_DETECTED')
 if(local.sequence>s.sequence||local.epoch>s.epoch)bad('UNATTESTED_FORWARD_STATE')
 if(!equal(local,checkpoint(s)))bad('STATE_FORK_DETECTED')
}
const fence=(s,observed)=>{
 if(observed===undefined)return
 if(!observed||typeof observed.root!=='string'||observed.root!==s.genesis_root||
  !Number.isSafeInteger(observed.minSequence)||observed.minSequence<0||
  !Number.isSafeInteger(observed.minGeneration)||observed.minGeneration<1)
  bad('TRUST_PIN_MISMATCH')
 if(s.sequence<observed.minSequence||s.generation<observed.minGeneration)
  bad('EXTERNAL_ROLLBACK_FENCE')
}
const proof=(s,kind,opId,local,result=null)=>{
 const body={version:1,issuer:'rutacap-c49-disposable-durable-worker',
  generation:s.generation,sequence:local.sequence,epoch:local.epoch,
  stateDigest:local.stateDigest,localRoot:local.localRoot,
  action:kind,operationId:opId,
  receiptDigest:result?.receipt?sha(canonical(result.receipt)):null}
 return {attestation:body,signature:signC48Fixture(s.active_private,C48_ATTEST_DOMAIN,body),
  chain:JSON.parse(s.certs_json)}
}
function createSchema(db){
 db.exec(`CREATE TABLE anchor (
 id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL,
 epoch INTEGER NOT NULL,revision INTEGER NOT NULL,state_digest TEXT NOT NULL,
 local_root TEXT NOT NULL,local_public TEXT NOT NULL,
 generation INTEGER NOT NULL,genesis_root TEXT NOT NULL,
 active_private TEXT NOT NULL,active_public TEXT NOT NULL,
 certs_json TEXT NOT NULL,compromised INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE operations (
 op_id TEXT PRIMARY KEY,kind TEXT NOT NULL,request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','committed','aborted')),
 before_seq INTEGER NOT NULL,before_epoch INTEGER NOT NULL,
 proof_json TEXT);
 CREATE UNIQUE INDEX single_pending ON operations(status) WHERE status='pending';
 CREATE TABLE nonces (
 tenant TEXT NOT NULL,jti TEXT NOT NULL,device_id TEXT NOT NULL,
 digest TEXT NOT NULL,epoch INTEGER NOT NULL,PRIMARY KEY(tenant,jti));`)
}
function validateAction(a){
 if(!['registerDevice','revoke','advance','decide'].includes(a))bad('ACTION_INVALID')
}
function validateId(id){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(id))bad('OPERATION_ID_INVALID')
}
function verifyResult(db,op,payload,result,before,after){
 if(after.sequence!==before.sequence+1||after.epoch<before.epoch||
  after.localRoot!==before.localRoot||after.stateDigest===before.stateDigest)
  bad('UNATTESTED_TRANSITION')
 if(op.kind!=='decide'){
  if(op.kind==='registerDevice'&&
   (result.tenant!==payload.tenant||result.deviceId!==payload.deviceId))bad('RESULT_MISMATCH')
  if(op.kind==='revoke'&&(result.epoch!==after.epoch||after.epoch!==before.epoch+1))
   bad('RESULT_MISMATCH')
  if(op.kind==='advance'&&
   (typeof result!=='number'||result<0||after.epoch!==before.epoch))
   bad('RESULT_MISMATCH')
  return null
 }
 if(!result?.ok||!result.receipt||!verifyC47Signature(before.publicKey,
    C47_RECEIPT_DOMAIN,result.receipt,result.signature))
  bad('LOCAL_RECEIPT_INVALID')
 const r=result.receipt
 if(r.sequence!==after.sequence||r.stateDigest!==after.stateDigest||
  r.epoch!==after.epoch||r.tenant!==payload.tenant||
  r.deviceId!==payload.deviceId||r.challenge!==payload.challenge||
  r.action!==payload.action||
  r.jti!==(payload.action==='transfer'?payload.jti:null)||
  r.digest!==(payload.action==='transfer'?payload.digest:null))
  bad('LOCAL_RECEIPT_MISMATCH')
 if(payload.action!=='transfer')return null
 const previous=db.prepare('SELECT * FROM nonces WHERE tenant=? AND jti=?')
  .get(payload.tenant,payload.jti)
 if(previous&&(previous.device_id!==payload.deviceId||
  previous.digest!==payload.digest||previous.epoch!==before.epoch))
  bad('EXTERNAL_NONCE_REPLAY')
 if(r.status!==(previous?'idempotent':'accepted'))bad('EXTERNAL_NONCE_INCONSISTENT')
 return previous?null:{tenant:payload.tenant,jti:payload.jti,
  device_id:payload.deviceId,digest:payload.digest,epoch:before.epoch}
}
export function runC49DurableCommand(input){
 const {externalPath,paths,command,payload={},kind,opId,result,observed,crashAt}=input||{}
 pathCheck(externalPath,paths)
 if(command==='bootstrap'){
  if(existsSync(externalPath))bad('EXTERNAL_BOOTSTRAP_FORBIDDEN')
  const local=localCheckpoint(paths)
  if(local.sequence!==0||local.epoch!==1)bad('NON_GENESIS_ANCHOR_REQUIRES_OOB')
  const keys=pair()
  const db=new DatabaseSync(externalPath,{timeout:10000})
  try{
   db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000')
   createSchema(db)
   db.prepare('INSERT INTO anchor VALUES(1,?,?,?,?,?,?,?,?,?,?,?,0)')
    .run(local.sequence,local.epoch,local.revision,local.stateDigest,
     local.localRoot,local.publicKey,1,keys.publicKey,keys.privateKey,
     keys.publicKey,'[]')
   const s=fetchState(db)
   return {pinnedRoot:keys.publicKey,checkpoint:{sequence:0,epoch:1},
    proof:proof(s,'genesis','genesis',local),pid:process.pid}
  }finally{db.close()}
 }
 if(!existsSync(externalPath))bad('EXTERNAL_MISSING')
 const db=new DatabaseSync(externalPath,{timeout:10000})
 try{
  db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL')
  // Explicit read of schema: never auto-create a new root on missing/corrupt database.
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='anchor'").get())
   bad('EXTERNAL_SCHEMA_MISSING')
  return begin(db,()=>{
   const s=fetchState(db)
   if(!s)bad('EXTERNAL_ANCHOR_MISSING')
   fence(s,observed)
   if(command==='status'){
    validateId(opId)
    const op=db.prepare('SELECT * FROM operations WHERE op_id=?').get(opId)
    if(!op)bad('OPERATION_UNKNOWN')
    return {status:op.status,kind:op.kind,proof:op.proof_json?JSON.parse(op.proof_json):null,pid:process.pid}
   }
   if(command==='inspect'){
    checkActive(s)
    const local=localCheckpoint(paths)
    compare(local,s)
    if(fetchPending(db))bad('OPERATION_PENDING')
    return {sequence:s.sequence,epoch:s.epoch,generation:s.generation,
     stateDigest:s.state_digest,pinnedRoot:s.genesis_root,pid:process.pid}
   }
   if(command==='markCompromised'){
    db.prepare('UPDATE anchor SET compromised=1 WHERE id=1').run()
    return {blocked:true,pid:process.pid}
   }
   checkActive(s)
   if(command==='prepare'){
    validateId(opId);validateAction(kind)
    if(fetchPending(db))bad('OPERATION_PENDING')
    if(db.prepare('SELECT 1 FROM operations WHERE op_id=?').get(opId))
     bad('OPERATION_ID_REPLAY')
    const local=localCheckpoint(paths);compare(local,s)
    if(kind==='decide'&&payload.action==='transfer'){
     const used=db.prepare('SELECT * FROM nonces WHERE tenant=? AND jti=?')
      .get(payload.tenant,payload.jti)
     if(used&&(used.device_id!==payload.deviceId||
       used.digest!==payload.digest||used.epoch!==s.epoch))
      bad('EXTERNAL_NONCE_REPLAY')
    }
    db.prepare("INSERT INTO operations VALUES(?,?,?,'pending',?,?,NULL)")
     .run(opId,kind,sha(canonical({kind,payload})),s.sequence,s.epoch)
    if(crashAt==='afterPrepare') {
     // CRASH occurs AFTER commit; caller gets no acknowledgment.
     // Deferred special exit outside transaction through a distinct command.
    }
    return {status:'pending',sequence:s.sequence,pid:process.pid}
   }
   if(command==='abortPending'){
    validateId(opId)
    const op=db.prepare('SELECT * FROM operations WHERE op_id=?').get(opId)
    if(!op||op.status!=='pending')bad('PENDING_OPERATION_REQUIRED')
    const local=localCheckpoint(paths);compare(local,s)
    db.prepare("UPDATE operations SET status='aborted' WHERE op_id=?").run(opId)
    return {status:'aborted',sequence:s.sequence,pid:process.pid}
   }
   if(command==='finalize'){
    validateId(opId)
    const op=db.prepare('SELECT * FROM operations WHERE op_id=?').get(opId)
    if(!op||op.status!=='pending')bad('PENDING_OPERATION_REQUIRED')
    if(op.request_hash!==sha(canonical({kind:op.kind,payload})))
     bad('INTENT_DIGEST_MISMATCH')
    if(op.before_seq!==s.sequence||op.before_epoch!==s.epoch)
     bad('INTENT_STALE')
    const local=localCheckpoint(paths)
    if(result?.ok===false){
     compare(local,s)
     db.prepare("UPDATE operations SET status='aborted' WHERE op_id=?").run(opId)
     return {status:'aborted',result,pid:process.pid}
    }
    const before=checkpoint(s)
    const nonce=verifyResult(db,op,payload,result,before,local)
    const next={...s,sequence:local.sequence,epoch:local.epoch,
     revision:local.revision,state_digest:local.stateDigest}
    const attested=proof(next,op.kind,opId,local,result)
    db.prepare('UPDATE anchor SET sequence=?,epoch=?,revision=?,state_digest=? WHERE id=1')
     .run(local.sequence,local.epoch,local.revision,local.stateDigest)
    if(nonce)db.prepare('INSERT INTO nonces VALUES(?,?,?,?,?)').run(
     nonce.tenant,nonce.jti,nonce.device_id,nonce.digest,nonce.epoch)
    db.prepare("UPDATE operations SET status='committed',proof_json=? WHERE op_id=?")
     .run(JSON.stringify(attested),opId)
    if(crashAt==='beforeExternalCommit')process.exit(96)
    // Crash after durable commit is triggered by wrapper, not inside transaction.
    return {status:'committed',proof:attested,pid:process.pid}
   }
   if(command==='rotate'){
    if(fetchPending(db))bad('OPERATION_PENDING')
    const local=localCheckpoint(paths);compare(local,s)
    if(typeof payload.reason!=='string'||!payload.reason)bad('ROTATION_REASON_REQUIRED')
    const next=pair(),body={version:1,from:s.generation,to:s.generation+1,
     oldRoot:sha(s.active_public),newRoot:sha(next.publicKey),
     newPublicKey:next.publicKey,atSequence:s.sequence,atEpoch:s.epoch,reason:payload.reason}
    const cert={body,
     signatureOld:signC48Fixture(s.active_private,C48_ROTATE_DOMAIN,body),
     signatureNew:signC48Fixture(next.privateKey,C48_POP_DOMAIN,body)}
    const chain=[...JSON.parse(s.certs_json),cert]
    db.prepare('UPDATE anchor SET generation=?,active_private=?,active_public=?,certs_json=? WHERE id=1')
     .run(s.generation+1,next.privateKey,next.publicKey,JSON.stringify(chain))
    return {generation:s.generation+1,cert,pid:process.pid}
   }
   if(command==='recover'){
    if(payload.approval!=='I_APPROVE_C49_SYNTHETIC_RECOVERY')bad('RECOVERY_APPROVAL_REQUIRED')
    if(fetchPending(db))bad('OPERATION_PENDING')
    const {source,target,failedLocal}=payload
    if(!source||!target||!source.dbPath||!source.witnessPath||
     !target.dbPath||!target.witnessPath)bad('RECOVERY_PATH_INVALID')
    if(existsSync(target.dbPath)||existsSync(target.witnessPath))bad('RECOVERY_TARGET_EXISTS')
    if(failedLocal){
     try{
      const failed=localCheckpoint(failedLocal)
      if(failed.sequence>s.sequence||failed.epoch>s.epoch)
       bad('UNATTESTED_FORWARD_REQUIRES_INVESTIGATION')
     }catch(e){if(!['WITNESS_DIVERGENCE','LOCAL_PAIR_MISSING'].includes(e.code))throw e}
    }
    const candidate=localCheckpoint(source)
    if(!equal(candidate,checkpoint(s))||candidate.publicKey!==s.local_public)
     bad('RECOVERY_NOT_LAST_ATTESTED')
    try{
     copyFileSync(source.dbPath,target.dbPath)
     copyFileSync(source.witnessPath,target.witnessPath)
     const recovered=localCheckpoint(target)
     if(!equal(recovered,checkpoint(s)))bad('RECOVERY_VERIFY_FAILED')
     return {status:'recovered',sequence:s.sequence,pid:process.pid,
      proof:proof(s,'manual-recovery',randomUUID(),recovered)}
    }catch(e){
     rmSync(target.dbPath,{force:true});rmSync(target.witnessPath,{force:true})
     throw e
    }
   }
   bad('COMMAND_INVALID')
  })
 }finally{db.close()}
}
