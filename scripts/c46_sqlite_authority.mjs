// C46 disposable Node-only SQLite authority / transaction fixture.
// NEVER import from src/, never use a cloud connection or real credentials.
import { DatabaseSync } from 'node:sqlite'
import {createHash, timingSafeEqual} from 'node:crypto'

const fail = code => { const e = new Error(code); e.code=code; throw e }
const str = x => typeof x === 'string' && x.length > 0
const hex64 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)
const safe = x => Number.isSafeInteger(x) && x >= 0
const hash = x => createHash('sha256').update(x).digest()
const digestHex = x => hash(x).toString('hex')
const sameHash = (expected, presented) => {
  const a=Buffer.from(expected,'hex'), b=hash(presented)
  return a.length===b.length && timingSafeEqual(a,b)
}
const errorResult = e => ({ok:false,code:e.code||'AUTHORITY_FAILURE'})

export function createC46SqliteAuthority({dbPath,initialTime=1000,maxNonces=128,
 policyTtl=200000,minimumEpoch=1}={}) {
 if(!str(dbPath)||!safe(initialTime)||!safe(policyTtl)||policyTtl<2||
 !safe(maxNonces)||maxNonces<1||!safe(minimumEpoch)||minimumEpoch<1)
  fail('CONFIG_INVALID')
 // The DB path is supplied ONLY by the isolated harness under a temporary folder.
 const db=new DatabaseSync(dbPath,{timeout:10000})
 db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
 db.exec(`CREATE TABLE IF NOT EXISTS metadata(
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    revision INTEGER NOT NULL CHECK(revision>=1),
    epoch INTEGER NOT NULL CHECK(epoch>=1),
    clock_ms INTEGER NOT NULL CHECK(clock_ms>=0),
    expires_ms INTEGER NOT NULL CHECK(expires_ms>=0));
  CREATE TABLE IF NOT EXISTS devices(
    device_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
    credential_hash TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)));
  CREATE TABLE IF NOT EXISTS nonces(
    tenant_id TEXT NOT NULL, jti TEXT NOT NULL, device_id TEXT NOT NULL,
    digest TEXT NOT NULL, epoch INTEGER NOT NULL, revision INTEGER NOT NULL,
    server_time INTEGER NOT NULL, PRIMARY KEY(tenant_id,jti));
  CREATE TABLE IF NOT EXISTS challenges(
    device_id TEXT NOT NULL, nonce TEXT NOT NULL, PRIMARY KEY(device_id,nonce));
  CREATE TABLE IF NOT EXISTS audit(
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL,
    epoch INTEGER NOT NULL, detail TEXT NOT NULL);`)
 db.prepare('INSERT OR IGNORE INTO metadata(singleton,revision,epoch,clock_ms,expires_ms) VALUES(1,1,1,?,?)')
  .run(initialTime,initialTime+policyTtl)
 const meta=()=>db.prepare('SELECT * FROM metadata WHERE singleton=1').get()
 const checkWitness=()=>{
  const m=meta()
  // The trusted minimum must be supplied OUTSIDE the rollbackable database.
  if(m.epoch<minimumEpoch)fail('TRUSTED_WITNESS_ROLLBACK')
  return m
 }
 checkWitness()
 const audit=(action,m,detail)=>db.prepare('INSERT INTO audit(action,epoch,detail) VALUES(?,?,?)')
  .run(action,m.epoch,detail)
 function write(fn){
  db.exec('BEGIN IMMEDIATE')
  try {const value=fn();db.exec('COMMIT');return value}
  catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 }
 function registerDevice({tenantId,deviceId,credential}){
  if(!str(tenantId)||!str(deviceId)||!str(credential)||credential.length<16)
   fail('DEVICE_INVALID')
  return write(()=>{
   const m=checkWitness()
   if(db.prepare('SELECT 1 FROM devices WHERE device_id=?').get(deviceId))
    fail('DEVICE_EXISTS')
   db.prepare('INSERT INTO devices(device_id,tenant_id,credential_hash) VALUES(?,?,?)')
    .run(deviceId,tenantId,digestHex(credential))
   audit('register',m,deviceId)
   return {tenantId,deviceId}
  })
 }
 function revokeDevice(deviceId,{crashAt=null}={}){
  if(!str(deviceId))fail('DEVICE_INVALID')
  const result=write(()=>{
   const m=checkWitness()
   const row=db.prepare('SELECT * FROM devices WHERE device_id=?').get(deviceId)
   if(!row)fail('DEVICE_UNKNOWN')
   db.prepare('UPDATE devices SET revoked=1 WHERE device_id=?').run(deviceId)
   db.prepare('UPDATE metadata SET revision=revision+1,epoch=epoch+1 WHERE singleton=1').run()
   const latest=meta()
   audit('revoke',latest,deviceId)
   if(crashAt==='beforeCommit')process.exit(91)
   return {revision:latest.revision,epoch:latest.epoch}
  })
  if(crashAt==='afterCommit')process.exit(92)
  return result
 }
 function advanceTime(delta){
  if(!safe(delta)||delta===0)fail('CLOCK_INVALID')
  return write(()=>{
   const m=checkWitness()
   if(!safe(m.clock_ms+delta))fail('CLOCK_INVALID')
   db.prepare('UPDATE metadata SET clock_ms=? WHERE singleton=1').run(m.clock_ms+delta)
   audit('clock',meta(),String(delta))
   return m.clock_ms+delta
  })
 }
 function renewPolicy(ttl=policyTtl){
  if(!safe(ttl)||ttl<2)fail('POLICY_TTL_INVALID')
  return write(()=>{
   const m=checkWitness()
   db.prepare('UPDATE metadata SET revision=revision+1,expires_ms=? WHERE singleton=1')
    .run(m.clock_ms+ttl)
   const latest=meta()
   audit('renew',latest,String(ttl))
   return {revision:latest.revision,epoch:latest.epoch}
  })
 }
 function decide(req,{crashAt=null}={}){
  try {
   if(!req||typeof req!=='object'||!str(req.tenantId)||!str(req.deviceId)||
      !str(req.credential)||!str(req.challenge)||!['refresh','transfer'].includes(req.action))
    fail('REQUEST_INVALID')
   if(!/^[a-zA-Z0-9-]{8,64}$/.test(req.challenge))fail('CHALLENGE_INVALID')
   const result=write(()=>{
    const m=checkWitness()
    const d=db.prepare('SELECT * FROM devices WHERE device_id=?').get(req.deviceId)
    if(!d||!sameHash(d.credential_hash,req.credential))fail('AUTH_REQUIRED')
    if(d.tenant_id!==req.tenantId)fail('TENANT_MISMATCH')
    if(d.revoked)fail('DEVICE_REVOKED')
    if(m.clock_ms>=m.expires_ms)fail('POLICY_EXPIRED')
    if(db.prepare('SELECT 1 FROM challenges WHERE device_id=? AND nonce=?')
      .get(req.deviceId,req.challenge))fail('CHALLENGE_REPLAY')
    let status='fresh'
    if(req.action==='transfer'){
     if(req.revision!==m.revision||req.epoch!==m.epoch)fail('POLICY_STALE')
     if(!str(req.jti)||req.jti.length>128||!hex64(req.digest))fail('TRANSFER_INVALID')
     const old=db.prepare('SELECT * FROM nonces WHERE tenant_id=? AND jti=?')
      .get(req.tenantId,req.jti)
     if(old){
      if(old.device_id!==req.deviceId||old.digest!==req.digest||old.epoch!==m.epoch)
       fail('GLOBAL_REPLAY_REJECTED')
      status='idempotent'
     } else {
      if(db.prepare('SELECT COUNT(*) AS n FROM nonces').get().n>=maxNonces)
       fail('GLOBAL_LEDGER_FULL')
      db.prepare(`INSERT INTO nonces(tenant_id,jti,device_id,digest,epoch,revision,server_time)
       VALUES(?,?,?,?,?,?,?)`).run(req.tenantId,req.jti,req.deviceId,req.digest,
        m.epoch,m.revision,m.clock_ms)
      status='accepted'
     }
    }
    db.prepare('INSERT INTO challenges(device_id,nonce) VALUES(?,?)')
     .run(req.deviceId,req.challenge)
    audit(req.action,m,req.deviceId+':'+status)
    if(crashAt==='beforeCommit')process.exit(91)
    return {ok:true,action:req.action,status,revision:m.revision,epoch:m.epoch,
     serverTime:m.clock_ms,deviceId:req.deviceId,tenantId:req.tenantId,
     jti:req.action==='transfer'?req.jti:null,challenge:req.challenge}
   })
   if(crashAt==='afterCommit')process.exit(92)
   return result
  }catch(e){return errorResult(e)}
 }
 function inspect(){
  const m=checkWitness()
  return {revision:m.revision,epoch:m.epoch,serverTime:m.clock_ms,
   expiresAt:m.expires_ms,nonces:db.prepare('SELECT COUNT(*) AS n FROM nonces').get().n,
   challenges:db.prepare('SELECT COUNT(*) AS n FROM challenges').get().n,
   audit:db.prepare('SELECT COUNT(*) AS n FROM audit').get().n,
   revoked:db.prepare('SELECT device_id FROM devices WHERE revoked=1 ORDER BY device_id')
    .all().map(x=>x.device_id)}
 }
 function auditTrail(){return db.prepare('SELECT * FROM audit ORDER BY sequence').all()}
 return {registerDevice,revokeDevice,advanceTime,renewPolicy,decide,inspect,auditTrail,
  close:()=>db.close()}
}
