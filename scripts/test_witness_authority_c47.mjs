// C47 synthetic witness security audit. No production data, endpoints or cloud.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync,copyFileSync,existsSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes,generateKeyPairSync,createPublicKey,webcrypto} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createC47WitnessAuthority,exportC47Snapshot,restoreC47Snapshot,
 verifyC47Signature,C47_RECEIPT_DOMAIN,C47_BACKUP_DOMAIN} from './c47_witness_authority.mjs'

const digest='a'.repeat(64)
const credential=()=>randomBytes(24).toString('hex')
const person=(tenant='tenant-alpha')=>({tenant,deviceId:randomUUID(),credential:credential()})
const request=(person,jti='nonce-'+randomUUID(),extras={})=>({
 ...person,action:'transfer',challenge:randomUUID(),jti,digest,epoch:1,revision:1,...extras})
const refresh=(person,extras={})=>({
 ...person,action:'refresh',challenge:randomUUID(),...extras})
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'rutacap-c47-'))
 return {dir,dbPath:join(dir,'authority.sqlite'),witnessPath:join(dir,'witness.sqlite'),
  path:name=>join(dir,name),cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
const open=f=>createC47WitnessAuthority(f)
async function worker(f,action,payload={},options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',
   fileURLToPath(new URL('./c47_witness_worker.mjs',import.meta.url))],
   {stdio:['pipe','pipe','pipe']})
  let output='',err=''
  child.stdout.on('data',d=>output+=d)
  child.stderr.on('data',d=>err+=d)
  child.on('error',reject)
  child.on('close',code=>{
   let body={}
   try{body=JSON.parse(output.trim().split('\n').at(-1)||'{}')}
   catch{reject(Error('WORKER_RESPONSE_INVALID '+output+' '+err));return}
   resolve({exit:code,...body,stderr:err})
  })
  child.stdin.end(JSON.stringify({dbPath:f.dbPath,witnessPath:f.witnessPath,
   action,payload,options}))
 })
}
const assertSigned=(out,key)=>{
 assert.equal(out.ok,true,JSON.stringify(out))
 assert.equal(verifyC47Signature(key,C47_RECEIPT_DOMAIN,out.receipt,out.signature),true)
}

test('C47 signed P-256 receipt verifies in Node and WebCrypto and survives restart',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person()
  a.registerDevice(p)
  const pub=a.getPublicKey()
  const decision=a.decide(request(p,'signed'))
  assertSigned(decision,pub)
  const jwk=createPublicKey(pub).export({format:'jwk'})
  const key=await webcrypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
  const canonical=value=>{
   if(value===null||['string','boolean'].includes(typeof value))return JSON.stringify(value)
   if(typeof value==='number')return JSON.stringify(value)
   if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
   return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
  }
  assert.equal(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,
   Buffer.from(decision.signature,'base64url'),
   Buffer.from(C47_RECEIPT_DOMAIN+canonical(decision.receipt))),true)
  a.close()
  a=open(f)
  assert.equal(a.getPublicKey(),pub)
  assertSigned(a.decide(request(p,'signed')),pub)
  assert.equal(a.inspect().nonceCount,1)
  a.close()
 }finally{f.cleanup()}
})
test('C47 forged, replayed or wrong-root receipt is rejected cryptographically',()=>{
 const f=fixture()
 try{
  const a=open(f),p=person();a.registerDevice(p)
  const signed=a.decide(request(p,'n1'));assertSigned(signed,a.getPublicKey())
  assert.equal(verifyC47Signature(a.getPublicKey(),C47_RECEIPT_DOMAIN,
   {...signed.receipt,epoch:999},signed.signature),false)
  assert.equal(verifyC47Signature(a.getPublicKey(),C47_RECEIPT_DOMAIN,
   {...signed.receipt,challenge:randomUUID()},signed.signature),false)
  const wrong=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey
  assert.equal(verifyC47Signature(wrong,C47_RECEIPT_DOMAIN,signed.receipt,signed.signature),false)
  a.close()
 }finally{f.cleanup()}
})
test('C47 10 independent Node processes serialize nonce and witness high-water',async()=>{
 const f=fixture()
 try{
  const a=open(f),left=person(),right=person()
  a.registerDevice(left);a.registerDevice(right);a.close()
  const attempts=await Promise.all(Array.from({length:10},(_,i)=>
   worker(f,'decide',request(i%2?left:right,'same-nonce'))))
  assert.ok(attempts.every(x=>x.exit===0),JSON.stringify(attempts))
  assert.equal(attempts.filter(x=>x.result?.receipt?.status==='accepted').length,1)
  assert.equal(attempts.filter(x=>x.result?.receipt?.status==='idempotent').length,4)
  assert.equal(attempts.filter(x=>x.result?.code==='GLOBAL_REPLAY_REJECTED').length,5)
  a=open(f)
  assert.equal(a.inspect().nonceCount,1)
  assert.equal(a.inspect().sequence,7) // two registrations, five successful transfers
  a.close()
 }finally{f.cleanup()}
})
test('C47 tenant isolation and challenge replay fail closed under witness lock',()=>{
 const f=fixture()
 try{
  const a=open(f),left=person(),other=person('tenant-beta')
  a.registerDevice(left);a.registerDevice(other)
  assertSigned(a.decide(request(left,'same')) ,a.getPublicKey())
  assertSigned(a.decide(request(other,'same')),a.getPublicKey())
  const req=request(left,'nonce-two')
  assert.equal(a.decide(req).ok,true)
  assert.equal(a.decide(req).code,'CHALLENGE_REPLAY')
  assert.equal(a.decide(request(left,'spoof',{tenant:'tenant-beta'})).code,'TENANT_MISMATCH')
  a.close()
 }finally{f.cleanup()}
})
test('C47 crash before witness commit leaves both files at previous checkpoint',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p);a.close()
  const req=request(p,'pre-crash')
  assert.equal((await worker(f,'decide',req,{crashAt:'beforeWitness'})).exit,91)
  a=open(f)
  assert.equal(a.inspect().sequence,1)
  assert.equal(a.inspect().nonceCount,0)
  assertSigned(a.decide(req),a.getPublicKey())
  a.close()
 }finally{f.cleanup()}
})
test('C47 crash after witness commit but before data commit triggers fail-closed gap',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p);a.close()
  const crashed=await worker(f,'decide',request(p,'gap'),{crashAt:'afterWitness'})
  assert.equal(crashed.exit,92,JSON.stringify(crashed))
  assert.throws(()=>open(f),{code:'WITNESS_DIVERGENCE'})
  const refused=await worker(f,'inspect')
  assert.equal(refused.error,'WITNESS_DIVERGENCE')
 }finally{f.cleanup()}
})
test('C47 crash after both commits but before signed reply permits only idempotent retry',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p);a.close()
  assert.equal((await worker(f,'decide',request(p,'after'),{crashAt:'afterData'})).exit,93)
  a=open(f)
  const out=a.decide(request(p,'after'))
  assert.equal(out.receipt.status,'idempotent')
  assertSigned(out,a.getPublicKey())
  assert.equal(a.inspect().nonceCount,1)
  a.close()
 }finally{f.cleanup()}
})
test('C47 revocation survives restarts, stale token and tenant spoof remain rejected',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p);a.close()
  const rev=await worker(f,'revoke',{deviceId:p.deviceId})
  assert.equal(rev.result.epoch,2)
  a=open(f)
  assert.deepEqual(a.inspect().revoked,[p.deviceId])
  assert.equal(a.decide(refresh(p)).code,'DEVICE_REVOKED')
  assert.equal(a.decide(request(p,'new',{revision:2,epoch:2})).code,'DEVICE_REVOKED')
  a.close()
 }finally{f.cleanup()}
})
test('C47 revoked device and concurrent transfer linearize via witness-first locking',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p);a.close()
  const [tx,rev]=await Promise.all([
   worker(f,'decide',request(p,'race')),worker(f,'revoke',{deviceId:p.deviceId})
  ])
  assert.equal(tx.exit,0);assert.equal(rev.exit,0)
  a=open(f)
  if(tx.result?.ok)assert.equal(tx.result.receipt.status,'accepted')
  else assert.ok(['DEVICE_REVOKED','POLICY_STALE'].includes(tx.result?.code))
  assert.deepEqual(a.inspect().revoked,[p.deviceId])
  assert.equal(a.decide(refresh(p)).code,'DEVICE_REVOKED')
  a.close()
 }finally{f.cleanup()}
})
test('C47 restoring older main SQLite only is detected by separate witness',()=>{
 const f=fixture()
 try{
  const p=person(),old=f.path('old-primary.sqlite')
  let a=open(f);a.registerDevice(p);a.close()
  copyFileSync(f.dbPath,old)
  a=open(f);a.revoke(p.deviceId);a.close()
  copyFileSync(old,f.dbPath)
  assert.throws(()=>open(f),{code:'WITNESS_DIVERGENCE'})
 }finally{f.cleanup()}
})
test('C47 locally editing primary row without witness commit fails closed',()=>{
 const f=fixture()
 try{
  const a=open(f),p=person();a.registerDevice(p);a.close()
  const db=new DatabaseSync(f.dbPath)
  db.prepare("UPDATE state SET server_time=server_time+1").run()
  db.close()
  assert.throws(()=>open(f),{code:'WITNESS_DIVERGENCE'})
 }finally{f.cleanup()}
})
test('C47 restoring BOTH files remains a demonstrated trust-boundary failure',()=>{
 const f=fixture()
 try{
  const p=person(),mainBackup=f.path('old-main'),wBackup=f.path('old-witness')
  let a=open(f);a.registerDevice(p);a.close()
  copyFileSync(f.dbPath,mainBackup);copyFileSync(f.witnessPath,wBackup)
  a=open(f);a.revoke(p.deviceId);a.close()
  copyFileSync(mainBackup,f.dbPath);copyFileSync(wBackup,f.witnessPath)
  a=open(f)
  assert.equal(a.inspect().epoch,1)
  assertSigned(a.decide(refresh(p)),a.getPublicKey())
  a.close()
 }finally{f.cleanup()}
})
test('C47 signed snapshot restores ONLY to fresh path at exact witness checkpoint',async()=>{
 const f=fixture()
 try{
  let a=open(f),p=person();a.registerDevice(p)
  const result=a.decide(request(p,'retained'))
  assertSigned(result,a.getPublicKey())
  a.close()
  const snapshotPath=f.path('snapshot.sqlite')
  const proof=await exportC47Snapshot({...f,destination:snapshotPath})
  assert.equal(verifyC47Signature(proof.publicKey,C47_BACKUP_DOMAIN,
   proof.manifest,proof.signature),true)
  const restoredPath=f.path('restored.sqlite')
  const recovered=restoreC47Snapshot({snapshotPath,dbPath:restoredPath,
   witnessPath:f.witnessPath,...proof})
  assert.equal(recovered.sequence,proof.manifest.sequence)
  const restored=createC47WitnessAuthority({dbPath:restoredPath,witnessPath:f.witnessPath})
  assert.equal(restored.inspect().nonceCount,1)
  assert.equal(restored.decide(request(p,'retained')).receipt.status,'idempotent')
  restored.close()
 }finally{f.cleanup()}
})
test('C47 stale signed backup and tampered manifest are rejected',async()=>{
 const f=fixture()
 try{
  const p=person();let a=open(f);a.registerDevice(p);a.close()
  const snapshotPath=f.path('snapshot.sqlite')
  const proof=await exportC47Snapshot({...f,destination:snapshotPath})
  assert.throws(()=>restoreC47Snapshot({snapshotPath,dbPath:f.path('bad'),witnessPath:f.witnessPath,
   ...proof,manifest:{...proof.manifest,epoch:999}}),{code:'BACKUP_SIGNATURE_INVALID'})
  a=open(f);a.decide(request(p,'after-snapshot'));a.close()
  assert.throws(()=>restoreC47Snapshot({snapshotPath,dbPath:f.path('stale'),
   witnessPath:f.witnessPath,...proof}),{code:'STALE_SNAPSHOT'})
  assert.equal(existsSync(f.path('stale')),false)
 }finally{f.cleanup()}
})
test('C47 concurrent snapshot is consistent or rejects race, never claims stale valid',async()=>{
 const f=fixture()
 try{
  const a=open(f),p=person();a.registerDevice(p);a.close()
  const jobs=Array.from({length:6},(_,i)=>worker(f,'decide',request(p,'race-'+i)))
  const destination=f.path('racing-snapshot.sqlite')
  const snap=exportC47Snapshot({...f,destination})
   .then(proof=>({ok:true,proof}),e=>({ok:false,code:e.code}))
  const [result,writes]=await Promise.all([snap,Promise.all(jobs)])
  assert.ok(writes.every(x=>x.exit===0),JSON.stringify(writes))
  assert.ok(result.ok||['SNAPSHOT_RACE','WITNESS_DIVERGENCE'].includes(result.code),
   JSON.stringify(result))
  if(result.ok){
   assert.equal(verifyC47Signature(result.proof.publicKey,C47_BACKUP_DOMAIN,
    result.proof.manifest,result.proof.signature),true)
   const a=open(f)
   assert.ok(result.proof.manifest.sequence<=a.inspect().sequence)
   a.close()
  }
  const a=open(f);assert.equal(a.inspect().nonceCount,6);a.close()
 }finally{f.cleanup()}
})
test('C47 broken or missing witness never silently creates replacement trust root',()=>{
 const f=fixture()
 try{
  const a=open(f);a.close()
  rmSync(f.witnessPath)
  assert.throws(()=>open(f),{code:'MISSING_AUTHORITY_PART'})
 }finally{f.cleanup()}
})
