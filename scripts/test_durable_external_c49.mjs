// C49 integration/adversarial tests. Only synthetic temporary files and Node subprocesses.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,mkdirSync,copyFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createC47WitnessAuthority} from './c47_witness_authority.mjs'
import {verifyC48Attestation,signC48Fixture,C48_ATTEST_DOMAIN}
 from './c48_external_witness_mock.mjs'

const eWorker=fileURLToPath(new URL('./c49_external_worker.mjs',import.meta.url))
const lWorker=fileURLToPath(new URL('./c47_witness_worker.mjs',import.meta.url))
const digest='a'.repeat(64), approval='I_APPROVE_C49_SYNTHETIC_RECOVERY'
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'rutacap-c49-')),
  localDir=join(dir,'local-domain'),remoteDir=join(dir,'mock-external-domain')
 mkdirSync(localDir);mkdirSync(remoteDir)
 const paths={dbPath:join(localDir,'main.sqlite'),witnessPath:join(localDir,'witness.sqlite')}
 const externalPath=join(remoteDir,'external.sqlite')
 const api=createC47WitnessAuthority(paths);api.close()
 return {dir,paths,externalPath,
  path:n=>({dbPath:join(localDir,n+'-main.sqlite'),
   witnessPath:join(localDir,n+'-witness.sqlite')}),
  cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
const device=(tenant='tenant-one')=>({tenant,deviceId:randomUUID(),
 credential:randomBytes(24).toString('hex')})
const transfer=(p,jti='nonce-'+randomUUID())=>({...p,action:'transfer',
 challenge:randomUUID(),jti,digest,epoch:1,revision:1})
const refresh=p=>({...p,action:'refresh',challenge:randomUUID()})
async function child(script,input){
 return await new Promise((resolve,reject)=>{
  const job=spawn(process.execPath,['--disable-warning=ExperimentalWarning',script],
   {stdio:['pipe','pipe','pipe']})
  let out='',err=''
  job.stdout.on('data',x=>out+=x)
  job.stderr.on('data',x=>err+=x)
  job.on('error',reject)
  job.on('close',exit=>{
   let body={}
   try{body=JSON.parse(out.trim().split('\n').at(-1)||'{}')}
   catch{return reject(Error('BAD_WORKER_RESPONSE '+out+' '+err))}
   resolve({exit,...body,stderr:err})
  })
  job.stdin.end(JSON.stringify(input))
 })
}
const remote=(f,command,arg={})=>child(eWorker,{
 externalPath:f.externalPath,paths:f.paths,command,...arg})
const local=(f,action,payload,options={})=>child(lWorker,{
 ...f.paths,action,payload,options})
const ok=async prom=>{
 const out=await prom
 assert.equal(out.exit,0,JSON.stringify(out))
 assert.equal(out.error,undefined)
 return out.result
}
const rejected=async(prom,code)=>{
 const out=await prom
 assert.equal(out.exit,1,JSON.stringify(out))
 assert.equal(out.error,code,JSON.stringify(out))
}
const bootstrap=async f=>ok(remote(f,'bootstrap'))
const intent=async(f,kind,payload,opId='op-'+randomUUID())=>{
 await ok(remote(f,'prepare',{kind,payload,opId}))
 return opId
}
const localAction=async(f,kind,payload,options={})=>{
 const x=await local(f,kind,payload,options)
 assert.equal(x.exit,0,JSON.stringify(x))
 return x.result
}
const execute=async(f,kind,payload,opts={})=>{
 const opId=await intent(f,kind,payload,opts.opId)
 const result=await localAction(f,kind,payload)
 const verified=await ok(remote(f,'finalize',{opId,payload,result,
  ...(opts.crashAt?{crashAt:opts.crashAt}:{})}))
 return {opId,result,...verified}
}
const assertProof=(proof,root,generation,minimumSequence)=>assert.equal(
 verifyC48Attestation(proof,root,{expectedGeneration:generation,
  minSequence:minimumSequence}),true)
const copyPair=(from,to)=>{
 copyFileSync(from.dbPath,to.dbPath)
 copyFileSync(from.witnessPath,to.witnessPath)
}
const fence=(b,sequence,generation=1)=>({
 root:b.pinnedRoot,minSequence:sequence,minGeneration:generation})

test('C49 new external process bootstraps once; signature and durable root survive process exit',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f)
  assertProof(b.proof,b.pinnedRoot,1,0)
  assert.notEqual(b.pid,process.pid)
  const s=await ok(remote(f,'inspect'))
  assert.equal(s.sequence,0)
  assert.notEqual(s.pid,b.pid)
  assert.equal(s.pinnedRoot,b.pinnedRoot)
  await rejected(remote(f,'bootstrap'),'EXTERNAL_BOOTSTRAP_FORBIDDEN')
 }finally{f.cleanup()}
})

test('C49 missing external file fails closed rather than silently creating a new root',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  rmSync(f.externalPath)
  await rejected(remote(f,'inspect'),'EXTERNAL_MISSING')
  await rejected(remote(f,'prepare',{kind:'registerDevice',payload:device(),opId:randomUUID()}),
   'EXTERNAL_MISSING')
 }finally{f.cleanup()}
})

test('C49 rollback of BOTH C47 files is rejected after witnessed revocation and fresh processes',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device()
  await execute(f,'registerDevice',p)
  const old=f.path('pre-revoke');copyPair(f.paths,old)
  await execute(f,'revoke',{deviceId:p.deviceId})
  const confirmed=await ok(remote(f,'inspect'))
  assert.equal(confirmed.sequence,2);assert.equal(confirmed.epoch,2)
  copyPair(old,f.paths)
  await rejected(remote(f,'inspect'),'ROLLBACK_DETECTED')
  await rejected(remote(f,'prepare',{kind:'decide',payload:refresh(p),opId:randomUUID()}),
   'ROLLBACK_DETECTED')
 }finally{f.cleanup()}
})

test('C49 crash after durable prepare leaves pending intent; explicit abort only if no local write',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device(),opId='pre-'+randomUUID()
  const crashed=await remote(f,'prepare',{kind:'registerDevice',payload:p,
   opId,crashAt:'afterPrepare'})
  assert.equal(crashed.exit,94)
  assert.equal((await ok(remote(f,'status',{opId}))).status,'pending')
  await rejected(remote(f,'inspect'),'OPERATION_PENDING')
  assert.equal((await ok(remote(f,'abortPending',{opId}))).status,'aborted')
  await rejected(remote(f,'prepare',{kind:'registerDevice',payload:p,opId}),
   'OPERATION_ID_REPLAY')
  await execute(f,'registerDevice',p)
  assert.equal((await ok(remote(f,'inspect'))).sequence,1)
 }finally{f.cleanup()}
})

test('C49 after local commit but before external finalize refuses un-attested state',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device(),opId=await intent(f,'registerDevice',p)
  await localAction(f,'registerDevice',p)
  await rejected(remote(f,'inspect'),'UNATTESTED_FORWARD_STATE')
  await rejected(remote(f,'abortPending',{opId}),'UNATTESTED_FORWARD_STATE')
  await rejected(remote(f,'rotate',{payload:{reason:'unsafe'}}),'OPERATION_PENDING')
  assert.equal((await ok(remote(f,'status',{opId}))).status,'pending')
 }finally{f.cleanup()}
})

test('C49 crash BEFORE external COMMIT leaves only pending intent and quarantined C47 state',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device(),opId=await intent(f,'registerDevice',p)
  const result=await localAction(f,'registerDevice',p)
  const crashed=await remote(f,'finalize',{
   opId,payload:p,result,crashAt:'beforeExternalCommit'})
  assert.equal(crashed.exit,96)
  assert.equal((await ok(remote(f,'status',{opId}))).status,'pending')
  await rejected(remote(f,'inspect'),'UNATTESTED_FORWARD_STATE')
 }finally{f.cleanup()}
})

test('C49 crash AFTER external COMMIT and before reply retains proof and idempotent status',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f)
  const p=device(),opId=await intent(f,'registerDevice',p)
  const result=await localAction(f,'registerDevice',p)
  const crash=await remote(f,'finalize',{opId,payload:p,result,
   crashAt:'afterExternalCommit'})
  assert.equal(crash.exit,97)
  const recovered=await ok(remote(f,'status',{opId}))
  assert.equal(recovered.status,'committed')
  assertProof(recovered.proof,b.pinnedRoot,1,1)
  assert.equal((await ok(remote(f,'inspect'))).sequence,1)
  await rejected(remote(f,'prepare',{kind:'registerDevice',payload:p,opId}),
   'OPERATION_ID_REPLAY')
 }finally{f.cleanup()}
})

test('C49 external nonce binding and C47 idempotency survive process restarts and root rotation',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f),p=device(),other=device()
  await execute(f,'registerDevice',p)
  await execute(f,'registerDevice',other)
  const first=await execute(f,'decide',transfer(p,'shared-jti'))
  assert.equal(first.result.receipt.status,'accepted')
  const rotated=await ok(remote(f,'rotate',{payload:{reason:'durability-test'}}))
  assert.equal(rotated.generation,2)
  await rejected(remote(f,'prepare',{
   kind:'decide',payload:transfer(other,'shared-jti'),opId:randomUUID()}),
   'EXTERNAL_NONCE_REPLAY')
  const retry=await execute(f,'decide',transfer(p,'shared-jti'))
  assert.equal(retry.result.receipt.status,'idempotent')
  assertProof(retry.proof,b.pinnedRoot,2,4)
  assert.equal((await ok(remote(f,'inspect'))).sequence,4)
 }finally{f.cleanup()}
})

test('C49 rotation rejects pending intents and persists cross-signature chain after restart',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f),p=device()
  const opId=await intent(f,'registerDevice',p)
  await rejected(remote(f,'rotate',{payload:{reason:'blocked'}}),'OPERATION_PENDING')
  await ok(remote(f,'abortPending',{opId}))
  await ok(remote(f,'rotate',{payload:{reason:'allowed-after-abort'}}))
  const completed=await execute(f,'registerDevice',p)
  const s=await ok(remote(f,'inspect'))
  assert.equal(s.generation,2)
  assertProof(completed.proof,b.pinnedRoot,2,1)
  const committed=await ok(remote(f,'status',{opId:completed.opId}))
  assert.equal(committed.status,'committed')
 }finally{f.cleanup()}
})

test('C49 exact high-water source can recover to a NEW target, without changing witness',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f),p=device()
  await execute(f,'registerDevice',p)
  await execute(f,'revoke',{deviceId:p.deviceId})
  const backup=f.path('backup'),target=f.path('recovered')
  copyPair(f.paths,backup)
  const recovered=await ok(remote(f,'recover',{payload:{source:backup,target,
   failedLocal:f.paths,approval}}))
  assert.equal(recovered.sequence,2)
  assertProof(recovered.proof,b.pinnedRoot,1,2)
  const checked=await ok(remote({...f,paths:target},'inspect'))
  assert.equal(checked.epoch,2)
  const localDenied=await local({...f,paths:target},'decide',refresh(p))
  assert.equal(localDenied.result.code,'DEVICE_REVOKED')
 }finally{f.cleanup()}
})

test('C49 older snapshot and lack of fixture approval cannot recover',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device();await execute(f,'registerDevice',p)
  const old=f.path('old'),target=f.path('dest');copyPair(f.paths,old)
  await execute(f,'revoke',{deviceId:p.deviceId})
  await rejected(remote(f,'recover',{payload:{source:old,target,approval}}),
   'RECOVERY_NOT_LAST_ATTESTED')
  const same=f.path('same');copyPair(f.paths,same)
  await rejected(remote(f,'recover',{payload:{source:same,target}}),
   'RECOVERY_APPROVAL_REQUIRED')
  assert.equal(existsSync(target.dbPath),false)
 }finally{f.cleanup()}
})

test('C49 separate C47 witness/data gap permits only audited exact-checkpoint recovery',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device();await execute(f,'registerDevice',p)
  const backup=f.path('before-gap'),target=f.path('recovered')
  copyPair(f.paths,backup)
  const crashed=await local(f,'decide',transfer(p,'gap'),
   {crashAt:'afterWitness'})
  assert.equal(crashed.exit,92)
  await rejected(remote(f,'inspect'),'WITNESS_DIVERGENCE')
  assert.equal((await ok(remote(f,'recover',{payload:{source:backup,target,
   failedLocal:f.paths,approval}}))).status,'recovered')
  assert.equal((await ok(remote({...f,paths:target},'inspect'))).sequence,1)
 }finally{f.cleanup()}
})

test('C49 un-attested forward progress cannot be discarded using a stale backup',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const p=device();await execute(f,'registerDevice',p)
  const backup=f.path('last'),target=f.path('target');copyPair(f.paths,backup)
  const crashed=await local(f,'decide',transfer(p,'late'),
   {crashAt:'afterData'})
  assert.equal(crashed.exit,93)
  await rejected(remote(f,'recover',{payload:{source:backup,target,
   failedLocal:f.paths,approval}}),'UNATTESTED_FORWARD_REQUIRES_INVESTIGATION')
 }finally{f.cleanup()}
})

test('C49 separate external SQLite rollback is detected against unmodified advanced C47 pair',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const early=join(f.dir,'early-external.sqlite')
  copyFileSync(f.externalPath,early)
  await execute(f,'registerDevice',device())
  copyFileSync(early,f.externalPath)
  await rejected(remote(f,'inspect'),'UNATTESTED_FORWARD_STATE')
 }finally{f.cleanup()}
})

test('C49 rollback of ALL three files is undetectable without retained external client fence',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f)
  const p=device();await execute(f,'registerDevice',p)
  const early=f.path('early');copyPair(f.paths,early)
  const earlyRemote=join(f.dir,'early-external.sqlite')
  copyFileSync(f.externalPath,earlyRemote)
  await execute(f,'revoke',{deviceId:p.deviceId})
  copyPair(early,f.paths);copyFileSync(earlyRemote,f.externalPath)
  // A client with NO out-of-band high-water can be fooled; explicitly not production-safe.
  assert.equal((await ok(remote(f,'inspect'))).sequence,1)
  await rejected(remote(f,'inspect',{observed:fence(b,2)}),
   'EXTERNAL_ROLLBACK_FENCE')
  await rejected(remote(f,'prepare',{kind:'decide',payload:refresh(p),
   opId:randomUUID(),observed:fence(b,2)}),'EXTERNAL_ROLLBACK_FENCE')
 }finally{f.cleanup()}
})

test('C49 durable compromise flag blocks new operations and rotation after worker restart',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  assert.equal((await ok(remote(f,'markCompromised'))).blocked,true)
  await rejected(remote(f,'inspect'),'ACTIVE_ROOT_COMPROMISED')
  await rejected(remote(f,'rotate',{payload:{reason:'not-allowed'}}),
   'ACTIVE_ROOT_COMPROMISED')
  await rejected(remote(f,'prepare',{kind:'registerDevice',
   payload:device(),opId:randomUUID()}),'ACTIVE_ROOT_COMPROMISED')
 }finally{f.cleanup()}
})

test('C49 stolen active external PEM can forge a valid proof despite process separation',async()=>{
 const f=fixture()
 try{
  const b=await bootstrap(f)
  const db=new DatabaseSync(f.externalPath,{readOnly:true})
  let key
  try{key=db.prepare('SELECT active_private FROM anchor').get().active_private}
  finally{db.close()}
  const fake={version:1,issuer:'rutacap-c49-disposable-durable-worker',
   generation:1,sequence:999,epoch:999,stateDigest:'a'.repeat(64),
   localRoot:'b'.repeat(64),action:'forged',operationId:'forged',receiptDigest:null}
  const signature=signC48Fixture(key,C48_ATTEST_DOMAIN,fake)
  assert.equal(verifyC48Attestation({attestation:fake,signature,chain:[]},
   b.pinnedRoot,{expectedGeneration:1,minSequence:999}),true)
 }finally{f.cleanup()}
})

test('C49 concurrent prepares serialize: one pending, others fail closed',async()=>{
 const f=fixture()
 try{
  await bootstrap(f)
  const attempts=await Promise.all(Array.from({length:6},(_,i)=>
   remote(f,'prepare',{kind:'registerDevice',payload:device(),
    opId:'race-'+i+'-'+randomUUID()})))
  assert.equal(attempts.filter(x=>x.exit===0).length,1)
  assert.ok(attempts.filter(x=>x.exit===1).every(x=>x.error==='OPERATION_PENDING'))
  await rejected(remote(f,'inspect'),'OPERATION_PENDING')
  const success=attempts.find(x=>x.exit===0)
  // The pending op-id is not returned in prepare response; no implicit recovery.
  assert.equal(success.result.status,'pending')
 }finally{f.cleanup()}
})
