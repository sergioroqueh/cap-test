// C48 adversarial audit. All files, identities and signing material are disposable.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync,copyFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {createC47WitnessAuthority,verifyC47Signature,C47_RECEIPT_DOMAIN}
 from './c47_witness_authority.mjs'
import {createC48ExternalMock,verifyC48Attestation,signC48Fixture,
 C48_ATTEST_DOMAIN} from './c48_external_witness_mock.mjs'

const make=()=>{
 const dir=mkdtempSync(join(tmpdir(),'rutacap-c48-'))
 const paths=name=>({dbPath:join(dir,name+'-main.sqlite'),
  witnessPath:join(dir,name+'-witness.sqlite')})
 return {dir,live:paths('live'),paths,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
const copyPair=(from,to)=>{
 copyFileSync(from.dbPath,to.dbPath)
 copyFileSync(from.witnessPath,to.witnessPath)
}
const person=(tenant='tenant-one')=>({tenant,deviceId:randomUUID(),
 credential:randomBytes(24).toString('hex')})
const request=(p,jti='nonce-'+randomUUID(),more={})=>({...p,
 action:'transfer',challenge:randomUUID(),jti,digest:'a'.repeat(64),
 epoch:1,revision:1,...more})
const refresh=p=>({...p,action:'refresh',challenge:randomUUID()})
const setup=()=>{
 const f=make(),trust=createC48ExternalMock()
 const anchored=trust.anchor(f.live)
 return {f,trust,anchored}
}
const check=(proof,pin,expectedGeneration,minSequence,expectedDigest)=>
 verifyC48Attestation(proof,pin,{expectedGeneration,minSequence,expectedDigest})
async function worker(paths,action,payload={},options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',
   fileURLToPath(new URL('./c47_witness_worker.mjs',import.meta.url))],
   {stdio:['pipe','pipe','pipe']})
  let out='',err=''
  child.stdout.on('data',x=>out+=x)
  child.stderr.on('data',x=>err+=x)
  child.on('error',reject)
  child.on('close',exit=>{
   let data={}
   try{data=JSON.parse(out.trim().split('\n').at(-1)||'{}')}
   catch{return reject(Error('BAD_CHILD_OUTPUT '+out+' '+err))}
   resolve({exit,...data})
  })
  child.stdin.end(JSON.stringify({...paths,action,payload,options}))
 })
}
const approval='I_APPROVE_C48_FIXTURE_RECOVERY'
const register=(trust,f,p)=>trust.execute(f.live,'registerDevice',p)
const revoke=(trust,f,p)=>trust.execute(f.live,'revoke',{deviceId:p.deviceId})

test('C48 genesis is pinned outside local backups; attestation verifies only with external root',()=>{
 const {f,trust,anchored}=setup()
 try{
  assert.equal(trust.inspect(f.live).sequence,0)
  assert.equal(check(anchored.attested,anchored.pinnedRoot,1,0),true)
  const api=createC47WitnessAuthority(f.live)
  assert.notEqual(anchored.pinnedRoot,api.getPublicKey())
  api.close()
  const forged={...anchored.attested,
   attestation:{...anchored.attested.attestation,sequence:10}}
  assert.equal(check(forged,anchored.pinnedRoot,1,0),false)
  assert.equal(check(anchored.attested,anchored.pinnedRoot,1,1),false)
 }finally{f.cleanup()}
})

test('C48 a rollback of BOTH C47 files cannot undo independently witnessed revocation',()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const old=f.paths('old');copyPair(f.live,old)
  revoke(trust,f,p)
  assert.equal(trust.inspect(f.live).epoch,2)
  copyPair(old,f.live)
  assert.throws(()=>trust.inspect(f.live),{code:'ROLLBACK_DETECTED'})
  assert.throws(()=>trust.execute(f.live,'decide',refresh(p)),{code:'ROLLBACK_DETECTED'})
 }finally{f.cleanup()}
})

test('C48 exact high-water backup may recover to NEW paths with explicit fixture approval',()=>{
 const {f,trust,anchored}=setup()
 try{
  const p=person();register(trust,f,p);revoke(trust,f,p)
  const source=f.paths('source'),target=f.paths('recovered');copyPair(f.live,source)
  const result=trust.manualRecover({source,target,failedLocal:f.live,approval})
  assert.equal(result.ok,true)
  assert.equal(trust.inspect(target).epoch,2)
  assert.equal(check(result.proof,anchored.pinnedRoot,1,2),true)
  assert.equal(trust.execute(target,'decide',refresh(p)).local.code,'DEVICE_REVOKED')
  assert.equal(trust.inspect(target).sequence,2)
  assert.equal(existsSync(target.dbPath),true)
 }finally{f.cleanup()}
})

test('C48 stale local backup, missing approval and occupied recovery target are rejected',()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const old=f.paths('old');copyPair(f.live,old)
  revoke(trust,f,p)
  assert.throws(()=>trust.manualRecover({source:old,target:f.paths('new'),approval}),
   {code:'RECOVERY_NOT_EXACT_CHECKPOINT'})
  const same=f.paths('exact');copyPair(f.live,same)
  assert.throws(()=>trust.manualRecover({source:same,target:f.paths('new')}),
   {code:'RECOVERY_APPROVAL_REQUIRED'})
  assert.throws(()=>trust.manualRecover({source:same,target:f.live,approval}),
   {code:'RECOVERY_DESTINATION_NOT_EMPTY'})
  assert.equal(existsSync(f.paths('new').dbPath),false)
 }finally{f.cleanup()}
})

test('C48 crashed C47 BEFORE witness commit keeps prior external checkpoint valid',async()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const crash=await worker(f.live,'decide',request(p,'before'),{crashAt:'beforeWitness'})
  assert.equal(crash.exit,91)
  assert.equal(trust.inspect(f.live).sequence,1)
  const done=trust.execute(f.live,'decide',request(p,'before'))
  assert.equal(done.local.receipt.status,'accepted')
  assert.equal(trust.inspect(f.live).sequence,2)
 }finally{f.cleanup()}
})

test('C48 C47 witness/data gap fails closed; explicit exact-checkpoint recovery is possible',async()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const backup=f.paths('last-confirmed'),dest=f.paths('recovered')
  copyPair(f.live,backup)
  const crash=await worker(f.live,'decide',request(p,'gap'),{crashAt:'afterWitness'})
  assert.equal(crash.exit,92)
  assert.throws(()=>trust.inspect(f.live),{code:'WITNESS_DIVERGENCE'})
  const recovered=trust.manualRecover({
   source:backup,target:dest,failedLocal:f.live,approval})
  assert.equal(recovered.ok,true)
  assert.equal(trust.inspect(dest).sequence,1)
  assert.equal(trust.execute(dest,'decide',request(p,'gap')).local.receipt.status,'accepted')
 }finally{f.cleanup()}
})

test('C48 C47 after-data crash is quarantined as un-attested forward progress',async()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const backup=f.paths('last-confirmed');copyPair(f.live,backup)
  const crash=await worker(f.live,'decide',request(p,'unconfirmed'),
   {crashAt:'afterData'})
  assert.equal(crash.exit,93)
  assert.throws(()=>trust.inspect(f.live),{code:'UNATTESTED_FORWARD_STATE'})
  assert.throws(()=>trust.manualRecover({
   source:backup,target:f.paths('recovered'),failedLocal:f.live,approval}),
   {code:'UNATTESTED_FORWARD_REQUIRES_INVESTIGATION'})
 }finally{f.cleanup()}
})

test('C48 bypassing gate in a separate process never earns an external attestation',async()=>{
 const {f,trust}=setup()
 try{
  const p=person();register(trust,f,p)
  const raw=await worker(f.live,'decide',request(p,'raw'))
  assert.equal(raw.exit,0);assert.equal(raw.result.ok,true)
  assert.throws(()=>trust.inspect(f.live),{code:'UNATTESTED_FORWARD_STATE'})
  assert.throws(()=>trust.execute(f.live,'decide',request(p,'another')),
   {code:'UNATTESTED_FORWARD_STATE'})
 }finally{f.cleanup()}
})

test('C48 key rotation is cross-signed; pinned root and current generation gate new proofs',()=>{
 const {f,trust,anchored}=setup()
 try{
  const p=person()
  const before=register(trust,f,p)
  assert.equal(check(before.proof,anchored.pinnedRoot,1,1),true)
  const cert=trust.rotate('planned-test')
  assert.equal(cert.body.from,1);assert.equal(cert.body.to,2)
  const after=trust.execute(f.live,'decide',request(p,'rotated'))
  assert.equal(check(after.proof,anchored.pinnedRoot,2,2),true)
  assert.equal(check(before.proof,anchored.pinnedRoot,2,2),false)
  assert.equal(check(after.proof,anchored.pinnedRoot,1,2),false)
  const broken={...after.proof,chain:[{...cert,signatureOld:'altered'}]}
  assert.equal(check(broken,anchored.pinnedRoot,2,2),false)
  assert.equal(check(after.proof,anchored.pinnedRoot+'corrupt',2,2),false)
  assert.equal(check(after.proof,anchored.pinnedRoot,2,2,'b'.repeat(64)),false)
 }finally{f.cleanup()}
})

test('C48 nonce binding and C47 idempotence survive mock witness key rotation',()=>{
 const {f,trust,anchored}=setup()
 try{
  const p=person(),other=person()
  register(trust,f,p);register(trust,f,other)
  const first=trust.execute(f.live,'decide',request(p,'shared-nonce'))
  assert.equal(first.local.receipt.status,'accepted')
  trust.rotate('nonce-ledger-test')
  assert.throws(()=>trust.execute(f.live,'decide',request(other,'shared-nonce')),
   {code:'EXTERNAL_NONCE_REPLAY'})
  const retry=trust.execute(f.live,'decide',request(p,'shared-nonce'))
  assert.equal(retry.local.receipt.status,'idempotent')
  assert.equal(trust.inspect(f.live).sequence,4)
  assert.equal(check(retry.proof,anchored.pinnedRoot,2,4),true)
 }finally{f.cleanup()}
})

test('C48 operation identifiers cannot be replayed even with a new C47 challenge',()=>{
 const {f,trust}=setup()
 try{
  const p=person()
  trust.execute(f.live,'registerDevice',p,'only-once')
  assert.throws(()=>trust.execute(f.live,'decide',request(p,'j2'),'only-once'),
   {code:'OPERATION_ID_REPLAY'})
  assert.equal(trust.inspect(f.live).sequence,1)
 }finally{f.cleanup()}
})

test('C48 stolen C47 private key can forge local signature but not external attestation',()=>{
 const {f,trust,anchored}=setup()
 try{
  const p=person();register(trust,f,p)
  const genuine=trust.execute(f.live,'decide',request(p,'genuine'))
  const db=new DatabaseSync(f.live.witnessPath,{readOnly:true})
  let row
  try{row=db.prepare('SELECT private_pem,public_pem FROM checkpoint').get()}
  finally{db.close()}
  const forged={...genuine.local.receipt,epoch:999}
  const fakeLocalSignature=signC48Fixture(row.private_pem,C47_RECEIPT_DOMAIN,forged)
  assert.equal(verifyC47Signature(row.public_pem,C47_RECEIPT_DOMAIN,
   forged,fakeLocalSignature),true)
  const forgedExternal={...genuine.proof,
   attestation:{...genuine.proof.attestation,epoch:999},
   signature:signC48Fixture(row.private_pem,C48_ATTEST_DOMAIN,
    {...genuine.proof.attestation,epoch:999})}
  assert.equal(check(forgedExternal,anchored.pinnedRoot,1,2),false)
 }finally{f.cleanup()}
})

test('C48 compromised retired root cannot authorize new generation; active root theft freezes fixture',()=>{
 const {f,trust,anchored}=setup()
 try{
  const p=person();register(trust,f,p)
  const stolenOld=trust.leakCurrentKeyForAttackTest()
  trust.rotate('retire-exposed-key')
  const fresh=trust.execute(f.live,'decide',request(p,'fresh'))
  const forged={...fresh.proof.attestation,sequence:1000,epoch:1000}
  const oldProof={attestation:{...forged,generation:1},
   signature:signC48Fixture(stolenOld,C48_ATTEST_DOMAIN,
    {...forged,generation:1}),chain:[]}
  assert.equal(check(oldProof,anchored.pinnedRoot,1,0),true) // old key was stolen!
  assert.equal(check(oldProof,anchored.pinnedRoot,2,2),false)
  // Compromising the ACTIVE root cannot be cryptographically repaired by self-rotation.
  const currentStolen=trust.leakCurrentKeyForAttackTest()
  const nextFake={...fresh.proof.attestation,sequence:1000}
  const fakeActive={attestation:nextFake,
   signature:signC48Fixture(currentStolen,C48_ATTEST_DOMAIN,nextFake),
   chain:fresh.proof.chain}
  assert.equal(check(fakeActive,anchored.pinnedRoot,2,2),true)
  trust.markCurrentKeyCompromisedTest()
  assert.throws(()=>trust.rotate(),{code:'ACTIVE_ROOT_COMPROMISED'})
  assert.throws(()=>trust.inspect(f.live),{code:'ACTIVE_ROOT_COMPROMISED'})
  assert.throws(()=>trust.execute(f.live,'decide',request(p,'blocked')),
   {code:'ACTIVE_ROOT_COMPROMISED'})
 }finally{f.cleanup()}
})

test('C48 replacement local signing root is not a trusted bootstrap',()=>{
 const {f,trust}=setup()
 try{
  const fresh=f.paths('fresh-local')
  const api=createC47WitnessAuthority(fresh);api.close()
  assert.throws(()=>trust.inspect(fresh),{code:'LOCAL_ROOT_SUBSTITUTION'})
  assert.throws(()=>trust.execute(fresh,'registerDevice',person()),
   {code:'LOCAL_ROOT_SUBSTITUTION'})
 }finally{f.cleanup()}
})
