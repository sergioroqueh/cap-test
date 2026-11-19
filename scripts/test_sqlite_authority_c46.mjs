// C46 disposable SQLite authority: no real DB, cloud, JWT, browser or Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync,copyFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes} from 'node:crypto'
import {createC46SqliteAuthority} from './c46_sqlite_authority.mjs'

const A='a'.repeat(64),B='b'.repeat(64)
const config={initialTime:1000,maxNonces:128,policyTtl:200000}
const credential=()=>randomBytes(32).toString('hex')
const device=(tenantId='tenant-a',deviceId=randomUUID())=>({tenantId,deviceId,credential:credential()})
const request=(d,jti,{digest=A,challenge=randomUUID(),revision=1,epoch=1}={})=>({
 ...d,action:'transfer',challenge,jti,digest,revision,epoch})
const fresh=(d,challenge=randomUUID())=>({...d,action:'refresh',challenge})
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'rutacap-c46-'))
 return {dir,path:join(dir,'disposable.sqlite'),clean:()=>rmSync(dir,{recursive:true,force:true})}
}
const open=(path,settings={})=>createC46SqliteAuthority({dbPath:path,...config,...settings})
async function worker(dbPath,action,payload={},options={},settings={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',
   fileURLToPath(new URL('./c46_sqlite_worker.mjs',import.meta.url))],
   {stdio:['pipe','pipe','pipe']})
  let out='',err=''
  child.stdout.on('data',c=>out+=c)
  child.stderr.on('data',c=>err+=c)
  child.on('error',reject)
  child.on('close',exit=>{
   let parsed
   try{parsed=out.trim()?JSON.parse(out.trim().split('\n').at(-1)):null}
   catch(e){reject(Error('WORKER_INVALID_JSON '+out+' '+err));return}
   resolve({exit,result:parsed?.result,error:parsed?.error,stderr:err})
  })
  child.stdin.end(JSON.stringify({dbPath,action,payload,options,config:{...config,...settings}}))
 })
}

test('C46 durable tenant and credential binding survives independent processes',async()=>{
 const f=fixture();try{
  const a=device(),b=device('tenant-b')
  let db=open(f.path);db.registerDevice(a);db.registerDevice(b);db.close()
  assert.equal((await worker(f.path,'decide',fresh(a))).result.ok,true)
  assert.equal((await worker(f.path,'decide',{...fresh(a),credential:'forged'})).result.code,'AUTH_REQUIRED')
  assert.equal((await worker(f.path,'decide',{...fresh(a),tenantId:'tenant-b'})).result.code,'TENANT_MISMATCH')
  assert.equal((await worker(f.path,'decide',fresh(b))).result.ok,true)
 }finally{f.clean()}
})
test('C46 global nonce is atomic across 12 separate Node processes and survives reboot',async()=>{
 const f=fixture();try{
  const a=device(),b=device('tenant-a')
  let db=open(f.path);db.registerDevice(a);db.registerDevice(b);db.close()
  const batch=Array.from({length:12},(_,i)=>worker(f.path,'decide',request(i%2?a:b,'same-jti')))
  const r=await Promise.all(batch)
  assert.ok(r.every(x=>x.exit===0),JSON.stringify(r.filter(x=>x.exit!==0)))
  assert.equal(r.filter(x=>x.result?.status==='accepted').length,1)
  assert.equal(r.filter(x=>x.result?.code==='GLOBAL_REPLAY_REJECTED').length,6)
  assert.equal(r.filter(x=>x.result?.status==='idempotent').length,5)
  db=open(f.path)
  assert.equal(db.inspect().nonces,1)
  db.close()
 }finally{f.clean()}
})
test('C46 rejected collision cannot consume another tenant nonce',async()=>{
 const f=fixture();try{
  const a=device(),b=device('tenant-b')
  const db=open(f.path);db.registerDevice(a);db.registerDevice(b)
  assert.equal(db.decide(request(a,'same')).status,'accepted')
  assert.equal(db.decide(request(b,'same')).status,'accepted')
  assert.equal(db.inspect().nonces,2)
  db.close()
 }finally{f.clean()}
})
test('C46 same challenge is atomic across independent processes',async()=>{
 const f=fixture();try{
  const a=device(),challenge=randomUUID(),db=open(f.path)
  db.registerDevice(a);db.close()
  const [x,y]=await Promise.all([
   worker(f.path,'decide',fresh(a,challenge)),worker(f.path,'decide',fresh(a,challenge))])
  assert.equal([x,y].filter(x=>x.result?.ok).length,1)
  assert.equal([x,y].filter(x=>x.result?.code==='CHALLENGE_REPLAY').length,1)
 }finally{f.clean()}
})
test('C46 crash before SQLite commit leaves neither nonce nor challenge',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a);db.close()
  const req=request(a,'before', {challenge:randomUUID()})
  const crashed=await worker(f.path,'decide',req,{crashAt:'beforeCommit'})
  assert.equal(crashed.exit,91)
  const recovered=await worker(f.path,'decide',req)
  assert.equal(recovered.result?.status,'accepted')
  const state=await worker(f.path,'inspect')
  assert.equal(state.result.nonces,1)
  assert.equal(state.result.challenges,1)
 }finally{f.clean()}
})
test('C46 crash after SQLite commit gives idempotent retry with new challenge',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a);db.close()
  const req=request(a,'after')
  assert.equal((await worker(f.path,'decide',req,{crashAt:'afterCommit'})).exit,92)
  const sameChallenge=await worker(f.path,'decide',req)
  assert.equal(sameChallenge.result.code,'CHALLENGE_REPLAY')
  const retry=await worker(f.path,'decide',{...req,challenge:randomUUID()})
  assert.equal(retry.result.status,'idempotent')
  assert.equal((await worker(f.path,'inspect')).result.nonces,1)
 }finally{f.clean()}
})
test('C46 revoked device persists after restart and cannot refresh or transfer',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a);db.close()
  const revoked=await worker(f.path,'revokeDevice',a.deviceId)
  assert.equal(revoked.result.epoch,2)
  assert.equal((await worker(f.path,'decide',fresh(a))).result.code,'DEVICE_REVOKED')
  assert.equal((await worker(f.path,'decide',request(a,'new',{epoch:2,revision:2}))).result.code,'DEVICE_REVOKED')
  assert.deepEqual((await worker(f.path,'inspect')).result.revoked,[a.deviceId])
 }finally{f.clean()}
})
test('C46 crashing revocation before commit never leaves half revocation',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a);db.close()
  assert.equal((await worker(f.path,'revokeDevice',a.deviceId,{crashAt:'beforeCommit'})).exit,91)
  const state=await worker(f.path,'inspect')
  assert.equal(state.result.epoch,1)
  assert.deepEqual(state.result.revoked,[])
  assert.equal((await worker(f.path,'decide',fresh(a))).result.ok,true)
  assert.equal((await worker(f.path,'revokeDevice',a.deviceId,{crashAt:'afterCommit'})).exit,92)
  assert.equal((await worker(f.path,'decide',fresh(a))).result.code,'DEVICE_REVOKED')
 }finally{f.clean()}
})
test('C46 revocation and transfer race linearize in SQLite commit order',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a);db.close()
  const [x,y]=await Promise.all([
   worker(f.path,'decide',request(a,'race')),
   worker(f.path,'revokeDevice',a.deviceId)])
  assert.equal(x.exit,0);assert.equal(y.exit,0)
  const d=open(f.path),trail=d.auditTrail()
  const a1=trail.find(x=>x.action==='transfer')
  const r1=trail.find(x=>x.action==='revoke')
  assert.ok(r1)
  if(x.result.ok){assert.equal(x.result.status,'accepted');assert.ok(a1.sequence<r1.sequence)}
  else {assert.ok(['DEVICE_REVOKED','POLICY_STALE'].includes(x.result.code));assert.equal(d.inspect().nonces,0)}
  assert.equal(d.decide(request(a,'post',{epoch:2,revision:2})).code,'DEVICE_REVOKED')
  d.close()
 }finally{f.clean()}
})
test('C46 malicious browser time and request epoch cannot overrule persisted clock',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path);db.registerDevice(a)
  assert.throws(()=>db.advanceTime(-1),{code:'CLOCK_INVALID'})
  assert.equal(db.advanceTime(501),1501)
  assert.equal(db.decide({...fresh(a),clientTime:-999999}).serverTime,1501)
  db.revokeDevice(a.deviceId)
  assert.equal(db.decide(request(a,'old',{epoch:1,revision:1})).code,'DEVICE_REVOKED')
  db.close()
  assert.equal((await worker(f.path,'inspect')).result.serverTime,1501)
 }finally{f.clean()}
})
test('C46 policy expiry and renewal preserve epoch but require latest revision',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path,{policyTtl:20});db.registerDevice(a)
  db.advanceTime(20)
  assert.equal(db.decide(fresh(a)).code,'POLICY_EXPIRED')
  assert.equal(db.renewPolicy(20).revision,2)
  assert.equal(db.decide(request(a,'old')).code,'POLICY_STALE')
  assert.equal(db.decide(request(a,'new',{revision:2})).status,'accepted')
  db.close()
 }finally{f.clean()}
})
test('C46 capacity fail-closed, no eviction of previously durable nonce',async()=>{
 const f=fixture();try{
  const a=device(),db=open(f.path,{maxNonces:2});db.registerDevice(a)
  assert.equal(db.decide(request(a,'one')).status,'accepted')
  assert.equal(db.decide(request(a,'two')).status,'accepted')
  assert.equal(db.decide(request(a,'three')).code,'GLOBAL_LEDGER_FULL')
  assert.equal(db.decide(request(a,'one')).status,'idempotent')
  assert.equal(db.inspect().nonces,2)
  db.close()
 }finally{f.clean()}
})
test('C46 known threat: restoring old valid database can undo revocation without external witness',async()=>{
 const f=fixture();try{
  const a=device(),backup=join(f.dir,'copy.sqlite')
  let db=open(f.path);db.registerDevice(a);db.close()
  copyFileSync(f.path,backup)
  db=open(f.path);db.revokeDevice(a.deviceId);db.close()
  // No open connection during full-file rollback; WAL checkpointed by close.
  copyFileSync(backup,f.path)
  db=open(f.path)
  assert.equal(db.inspect().epoch,1) // intentionally demonstrates untrusted local DB rollback
  assert.equal(db.decide(fresh(a)).ok,true)
  db.close()
  assert.throws(()=>open(f.path,{minimumEpoch:2}),{code:'TRUSTED_WITNESS_ROLLBACK'})
 }finally{f.clean()}
})
test('C46 injected corrupt SQLite bytes fail closed without silently rebuilding state',()=>{
 const f=fixture();try{
  writeFileSync(f.path,'not-a-database')
  assert.throws(()=>open(f.path))
 }finally{f.clean()}
})
