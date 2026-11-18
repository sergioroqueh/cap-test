// C47: disposable two-file monotonic witness + signed receipt authority.
// Node-only fixture; not a production credential store or distributed transaction.
import {DatabaseSync,backup} from 'node:sqlite'
import {existsSync,copyFileSync,renameSync,rmSync} from 'node:fs'
import {generateKeyPairSync,createHash,sign,verify,timingSafeEqual} from 'node:crypto'

const fail=code=>{const e=Error(code);e.code=code;throw e}
const valid=x=>typeof x==='string'&&x.length>0
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0
const sha=s=>createHash('sha256').update(s).digest('hex')
const domain='RUTACAP-C47-RECEIPT-P256-V1\0'
const backupDomain='RUTACAP-C47-BACKUP-P256-V1\0'
const canonical=value=>{
 if(value===null||['string','boolean'].includes(typeof value))return JSON.stringify(value)
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
 fail('CANONICAL_INVALID')
}
const signPart=(key,prefix,body)=>sign('sha256',Buffer.from(prefix+canonical(body)),
 {key,dsaEncoding:'ieee-p1363'}).toString('base64url')
export const verifyC47Signature=(publicKey,prefix,body,signature)=>{
 try{
  if(!valid(signature)||!/^[A-Za-z0-9_-]{86}$/.test(signature))return false
  return verify('sha256',Buffer.from(prefix+canonical(body)),{
   key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))
 }catch{return false}
}
export const C47_RECEIPT_DOMAIN=domain
export const C47_BACKUP_DOMAIN=backupDomain
const badResult=e=>({ok:false,code:e.code||'AUTHORITY_FAILURE'})
function open(path){
 const db=new DatabaseSync(path,{timeout:10000})
 db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
 return db
}
function initialize(main,witness,initialTime,ttl){
 main.exec("CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL, epoch INTEGER NOT NULL, revision INTEGER NOT NULL, server_time INTEGER NOT NULL, expires INTEGER NOT NULL);")
 main.exec("CREATE TABLE devices(device_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, credential_hash TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);")
 main.exec("CREATE TABLE nonces(tenant TEXT NOT NULL, jti TEXT NOT NULL, device_id TEXT NOT NULL, digest TEXT NOT NULL, epoch INTEGER NOT NULL, PRIMARY KEY(tenant,jti));")
 main.exec("CREATE TABLE challenges(device_id TEXT NOT NULL, challenge TEXT NOT NULL, PRIMARY KEY(device_id,challenge));")
 main.prepare('INSERT INTO state VALUES(1,0,1,1,?,?)').run(initialTime,initialTime+ttl)
 witness.exec("CREATE TABLE checkpoint(id INTEGER PRIMARY KEY CHECK(id=1), seq INTEGER NOT NULL, epoch INTEGER NOT NULL, state_digest TEXT NOT NULL, private_pem TEXT NOT NULL, public_pem TEXT NOT NULL);")
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{
  type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}})
 const digest=stateDigest(main)
 witness.prepare('INSERT INTO checkpoint VALUES(1,0,1,?,?,?)')
  .run(digest,pair.privateKey,pair.publicKey)
}
const stateInfo=db=>db.prepare('SELECT * FROM state WHERE id=1').get()
const checkpointInfo=db=>db.prepare('SELECT * FROM checkpoint WHERE id=1').get()
function stateDigest(db){
 const state=stateInfo(db)
 if(!state)fail('STATE_MISSING')
 const devices=db.prepare('SELECT * FROM devices ORDER BY device_id').all()
 const nonces=db.prepare('SELECT * FROM nonces ORDER BY tenant,jti').all()
 const challenges=db.prepare('SELECT * FROM challenges ORDER BY device_id,challenge').all()
 return sha(canonical({state,devices,nonces,challenges}))
}
function consistent(db,witness){
 const state=stateInfo(db),checkpoint=checkpointInfo(witness)
 if(!state||!checkpoint||state.seq!==checkpoint.seq||
    state.epoch!==checkpoint.epoch||stateDigest(db)!==checkpoint.state_digest)
  fail('WITNESS_DIVERGENCE')
 return {state,checkpoint}
}
const equalHash=(a,b)=>{
 const x=Buffer.from(a,'hex'),y=Buffer.from(sha(b),'hex')
 return x.length===y.length&&timingSafeEqual(x,y)
}
function withLocks(main,witness,fn){
 // Witness lock is always acquired FIRST by every cooperating process.
 // Committing witness BEFORE data is deliberately fail-closed on an interrupted gap.
 witness.exec('BEGIN IMMEDIATE')
 try{
  main.exec('BEGIN IMMEDIATE')
  try{
   const result=fn()
   main.exec('ROLLBACK')
   witness.exec('ROLLBACK')
   return result
  }catch(e){try{main.exec('ROLLBACK')}catch{};throw e}
 }finally{try{witness.exec('ROLLBACK')}catch{}}
}
function mutate(main,witness,fn,{crashAt=null}={}){
 witness.exec('BEGIN IMMEDIATE')
 let witnessCommitted=false
 try{
  main.exec('BEGIN IMMEDIATE')
  const ctx=consistent(main,witness)
  const result=fn(ctx.state)
  main.prepare('UPDATE state SET seq=seq+1 WHERE id=1').run()
  const next=stateInfo(main)
  const digest=stateDigest(main)
  witness.prepare('UPDATE checkpoint SET seq=?,epoch=?,state_digest=? WHERE id=1')
   .run(next.seq,next.epoch,digest)
  if(crashAt==='beforeWitness')process.exit(91)
  witness.exec('COMMIT')
  witnessCommitted=true
  if(crashAt==='afterWitness')process.exit(92)
  main.exec('COMMIT')
  if(crashAt==='afterData')process.exit(93)
  return {result,sequence:next.seq,epoch:next.epoch,stateDigest:digest}
 }catch(e){
  try{main.exec('ROLLBACK')}catch{}
  if(!witnessCommitted)try{witness.exec('ROLLBACK')}catch{}
  throw e
 }
}
export function createC47WitnessAuthority({dbPath,witnessPath,initialTime=1000,ttl=100000,maxNonces=256}={}){
 if(!valid(dbPath)||!valid(witnessPath)||dbPath===witnessPath||
    !nonnegative(initialTime)||!nonnegative(ttl)||ttl<2||
    !nonnegative(maxNonces)||maxNonces<1)fail('C47_CONFIG_INVALID')
 const hasMain=existsSync(dbPath),hasWitness=existsSync(witnessPath)
 if(hasMain!==hasWitness)fail('MISSING_AUTHORITY_PART')
 const witness=open(witnessPath),main=open(dbPath)
 try{
  if(!hasMain)initialize(main,witness,initialTime,ttl)
  withLocks(main,witness,()=>consistent(main,witness))
 }catch(e){main.close();witness.close();throw e}
 const getPublicKey=()=>checkpointInfo(witness).public_pem
 const inspect=()=>withLocks(main,witness,()=>{
  const {state}=consistent(main,witness)
  return {sequence:state.seq,epoch:state.epoch,revision:state.revision,
   serverTime:state.server_time,nonceCount:main.prepare('SELECT COUNT(*) AS n FROM nonces').get().n,
   revoked:main.prepare('SELECT device_id FROM devices WHERE revoked=1 ORDER BY device_id')
    .all().map(x=>x.device_id)}
 })
 const registerDevice=({tenant,deviceId,credential},options={})=>{
  if(!valid(tenant)||!valid(deviceId)||!valid(credential)||credential.length<16)
   fail('DEVICE_INVALID')
  return mutate(main,witness,()=>{
   if(main.prepare('SELECT 1 FROM devices WHERE device_id=?').get(deviceId))
    fail('DEVICE_EXISTS')
   main.prepare('INSERT INTO devices VALUES(?,?,?,0)')
    .run(deviceId,tenant,sha(credential))
   return {tenant,deviceId}
  },options).result
 }
 const revoke=(deviceId,options={})=>{
  if(!valid(deviceId))fail('DEVICE_INVALID')
  return mutate(main,witness,()=>{
   if(!main.prepare('SELECT 1 FROM devices WHERE device_id=?').get(deviceId))
    fail('DEVICE_UNKNOWN')
   main.prepare('UPDATE devices SET revoked=1 WHERE device_id=?').run(deviceId)
   main.prepare('UPDATE state SET epoch=epoch+1,revision=revision+1 WHERE id=1').run()
   const s=stateInfo(main)
   return {epoch:s.epoch,revision:s.revision}
  },options).result
 }
 const advance=(delta,options={})=>{
  if(!nonnegative(delta)||delta===0)fail('CLOCK_INVALID')
  return mutate(main,witness,()=>{
   const s=stateInfo(main)
   if(!nonnegative(s.server_time+delta))fail('CLOCK_INVALID')
   main.prepare('UPDATE state SET server_time=? WHERE id=1').run(s.server_time+delta)
   return s.server_time+delta
  },options).result
 }
 const decide=(r,options={})=>{
  try{
   if(!r||!valid(r.tenant)||!valid(r.deviceId)||!valid(r.credential)||
    !valid(r.challenge)||!['refresh','transfer'].includes(r.action))
    fail('REQUEST_INVALID')
   if(!/^[a-zA-Z0-9-]{8,64}$/.test(r.challenge))fail('CHALLENGE_INVALID')
   const committed=mutate(main,witness,()=>{
    const s=stateInfo(main)
    const d=main.prepare('SELECT * FROM devices WHERE device_id=?').get(r.deviceId)
    if(!d||!equalHash(d.credential_hash,r.credential))fail('AUTH_REQUIRED')
    if(d.tenant!==r.tenant)fail('TENANT_MISMATCH')
    if(d.revoked)fail('DEVICE_REVOKED')
    if(s.server_time>=s.expires)fail('POLICY_EXPIRED')
    if(main.prepare('SELECT 1 FROM challenges WHERE device_id=? AND challenge=?')
       .get(r.deviceId,r.challenge))fail('CHALLENGE_REPLAY')
    let status='fresh'
    if(r.action==='transfer'){
     if(r.revision!==s.revision||r.epoch!==s.epoch)fail('POLICY_STALE')
     if(!valid(r.jti)||r.jti.length>128||!hex(r.digest))fail('TRANSFER_INVALID')
     const old=main.prepare('SELECT * FROM nonces WHERE tenant=? AND jti=?')
      .get(r.tenant,r.jti)
     if(old){
      if(old.device_id!==r.deviceId||old.digest!==r.digest||old.epoch!==s.epoch)
       fail('GLOBAL_REPLAY_REJECTED')
      status='idempotent'
     }else{
      if(main.prepare('SELECT COUNT(*) AS n FROM nonces').get().n>=maxNonces)
       fail('GLOBAL_LEDGER_FULL')
      main.prepare('INSERT INTO nonces VALUES(?,?,?,?,?)')
       .run(r.tenant,r.jti,r.deviceId,r.digest,s.epoch)
      status='accepted'
     }
    }
    main.prepare('INSERT INTO challenges VALUES(?,?)').run(r.deviceId,r.challenge)
    return {version:1,issuer:'rutacap-c47-node-fixture',
     tenant:r.tenant,deviceId:r.deviceId,challenge:r.challenge,
     action:r.action,jti:r.action==='transfer'?r.jti:null,
     digest:r.action==='transfer'?r.digest:null,
     epoch:s.epoch,revision:s.revision,serverTime:s.server_time,status}
   },options)
   const receipt={...committed.result,sequence:committed.sequence,stateDigest:committed.stateDigest}
   const signature=signPart(checkpointInfo(witness).private_pem,domain,receipt)
   return {ok:true,receipt,signature,publicKey:getPublicKey()}
  }catch(e){return badResult(e)}
 }
 const close=()=>{main.close();witness.close()}
 return {getPublicKey,inspect,registerDevice,revoke,advance,decide,close}
}
export async function exportC47Snapshot({dbPath,witnessPath,destination}){
 if(!valid(destination)||existsSync(destination))fail('SNAPSHOT_PATH_INVALID')
 const api=createC47WitnessAuthority({dbPath,witnessPath})
 let database
 try{
  const before=api.inspect()
  database=open(dbPath)
  await backup(database,destination)
  const after=api.inspect()
  if(before.sequence!==after.sequence)fail('SNAPSHOT_RACE')
  const snapshot=open(destination)
  try{
   if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')
    fail('SNAPSHOT_CORRUPT')
   const snapshotState=stateInfo(snapshot)
   if(snapshotState.seq!==after.sequence)fail('SNAPSHOT_RACE')
   const currentWitness=open(witnessPath)
   try{
    if(stateDigest(snapshot)!==checkpointInfo(currentWitness).state_digest)
     fail('SNAPSHOT_RACE')
   }finally{currentWitness.close()}
  }finally{snapshot.close()}
  const witness=open(witnessPath)
  try{
   const current=checkpointInfo(witness)
   if(current.seq!==after.sequence)fail('SNAPSHOT_RACE')
   const manifest={version:1,sequence:current.seq,epoch:current.epoch,
    stateDigest:current.state_digest}
   const signature=signPart(current.private_pem,backupDomain,manifest)
   return {manifest,signature,publicKey:current.public_pem}
  }finally{witness.close()}
 }catch(e){rmSync(destination,{force:true});throw e}
 finally{database?.close();api.close()}
}
export function restoreC47Snapshot({snapshotPath,manifest,signature,
 dbPath,witnessPath,publicKey}){
 if(!valid(snapshotPath)||!valid(dbPath)||!valid(witnessPath)||existsSync(dbPath))
  fail('RESTORE_PATH_INVALID')
 if(!verifyC47Signature(publicKey,backupDomain,manifest,signature))
  fail('BACKUP_SIGNATURE_INVALID')
 const witness=open(witnessPath)
 witness.exec('BEGIN IMMEDIATE') // serializes with all cooperative writers
 try{
  const w=checkpointInfo(witness)
  if(w.public_pem!==publicKey||w.seq!==manifest.sequence||
     w.epoch!==manifest.epoch||w.state_digest!==manifest.stateDigest)
   fail('STALE_SNAPSHOT')
  const snap=open(snapshotPath)
  try{
   if(snap.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||
      stateInfo(snap).seq!==w.seq||stateDigest(snap)!==w.state_digest)
    fail('SNAPSHOT_CORRUPT')
  }finally{snap.close()}
  // Recovery to a NEW file only: never overwrite an active SQLite writer.
  const stage=dbPath+'.staging'
  if(existsSync(stage))fail('RESTORE_STAGE_EXISTS')
  copyFileSync(snapshotPath,stage)
  try{
   const staged=open(stage)
   try{if(stateDigest(staged)!==w.state_digest)fail('SNAPSHOT_CORRUPT')}
   finally{staged.close()}
   renameSync(stage,dbPath)
  }finally{rmSync(stage,{force:true})}
  witness.exec('COMMIT')
  return {sequence:w.seq,epoch:w.epoch}
 }finally{
  try{witness.exec('ROLLBACK')}catch{}
  witness.close()
 }
}
