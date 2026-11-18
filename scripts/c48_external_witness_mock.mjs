// C48: SYNTHETIC, IN-PROCESS trust-domain mock. Never production, remote, or a real HSM.
// The external monotonic state lives in a private closure, outside both C47 SQLite backups.
// This is object-capability isolation, NOT an OS/security boundary or durable external service.
import {DatabaseSync} from 'node:sqlite'
import {existsSync,copyFileSync,rmSync} from 'node:fs'
import {randomUUID,createHash,generateKeyPairSync,sign,verify} from 'node:crypto'
import {createC47WitnessAuthority,verifyC47Signature,C47_RECEIPT_DOMAIN}
 from './c47_witness_authority.mjs'

const fail=code=>{const e=Error(code);e.code=code;throw e}
const sha=x=>createHash('sha256').update(x).digest('hex')
const canonical=v=>{
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v)
 if(typeof v==='number'&&Number.isSafeInteger(v))return JSON.stringify(v)
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>
  JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
 fail('CANONICAL_INVALID')
}
export const C48_ATTEST_DOMAIN='RUTACAP-C48-EXTERNAL-ATTEST-V1\0'
export const C48_ROTATE_DOMAIN='RUTACAP-C48-ROOT-ROTATION-V1\0'
export const C48_POP_DOMAIN='RUTACAP-C48-KEY-POSSESSION-V1\0'
const pair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1',
 publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
export function signC48Fixture(privatePem,domain,payload){
 return sign('sha256',Buffer.from(domain+canonical(payload)),
  {key:privatePem,dsaEncoding:'ieee-p1363'}).toString('base64url')
}
const signed=(key,domain,body,signature)=>{
 try{return typeof signature==='string'&&/^[A-Za-z0-9_-]{86}$/.test(signature)&&
  verify('sha256',Buffer.from(domain+canonical(body)),
   {key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))}
 catch{return false}
}
function localCheckpoint({dbPath,witnessPath}){
 let api
 try{
  api=createC47WitnessAuthority({dbPath,witnessPath})
  const s=api.inspect(),publicKey=api.getPublicKey()
  api.close();api=null
  const db=new DatabaseSync(witnessPath,{readOnly:true})
  let w
  try{w=db.prepare('SELECT * FROM checkpoint WHERE id=1').get()}
  finally{db.close()}
  if(!w||w.seq!==s.sequence||w.epoch!==s.epoch||w.public_pem!==publicKey)
   fail('LOCAL_CHECKPOINT_RACE')
  return {sequence:s.sequence,epoch:s.epoch,revision:s.revision,
   stateDigest:w.state_digest,localRoot:sha(publicKey),publicKey,
   revoked:s.revoked,nonceCount:s.nonceCount}
 }finally{api?.close()}
}
const same=(a,b)=>a.sequence===b.sequence&&a.epoch===b.epoch&&
 a.stateDigest===b.stateDigest&&a.localRoot===b.localRoot
export function verifyC48Attestation({attestation,signature,chain=[]},
 pinnedRoot,{expectedGeneration,minSequence=0,expectedDigest}={}){
 try{
  if(typeof pinnedRoot!=='string'||!attestation||
    !Number.isSafeInteger(expectedGeneration)||!Number.isSafeInteger(minSequence))return false
  let current=pinnedRoot,gen=1
  for(const cert of chain){
   const b=cert.body
   if(!b||b.version!==1||b.from!==gen||b.to!==gen+1||
      b.oldRoot!==sha(current)||typeof b.newPublicKey!=='string'||
      b.newRoot!==sha(b.newPublicKey)||
      !signed(current,C48_ROTATE_DOMAIN,b,cert.signatureOld)||
      !signed(b.newPublicKey,C48_POP_DOMAIN,b,cert.signatureNew))return false
   current=b.newPublicKey;gen++
  }
  return gen===expectedGeneration&&attestation.generation===gen&&
   attestation.sequence>=minSequence&&
   (expectedDigest===undefined||attestation.stateDigest===expectedDigest)&&
   signed(current,C48_ATTEST_DOMAIN,attestation,signature)
 }catch{return false}
}
export function createC48ExternalMock(){
 // All these values are OUTSIDE the C47 pair and never included in a C47 snapshot.
 let key=pair(),generation=1,checkpoint=null,compromised=false
 const initialPublicKey=key.publicKey,chain=[]
 const ledger=new Map(),events=new Map()
 const evidence=(action,operationId,local,receipt=null)=>{
  const body={version:1,issuer:'rutacap-c48-object-capability-fixture',
   generation,sequence:local.sequence,epoch:local.epoch,
   stateDigest:local.stateDigest,localRoot:local.localRoot,
   action,operationId,receiptDigest:receipt?sha(canonical(receipt)):null}
  return {attestation:body,signature:signC48Fixture(key.privateKey,C48_ATTEST_DOMAIN,body),
   chain:chain.map(x=>({...x}))}
 }
 const requireActive=()=>{if(compromised)fail('ACTIVE_ROOT_COMPROMISED')}
 const requireAnchor=()=>{if(!checkpoint)fail('NO_PINNED_CHECKPOINT')}
 const compare=loc=>{
  requireActive();requireAnchor()
  if(loc.localRoot!==checkpoint.localRoot)fail('LOCAL_ROOT_SUBSTITUTION')
  if(loc.sequence<checkpoint.sequence||loc.epoch<checkpoint.epoch)
   fail('ROLLBACK_DETECTED')
  if(loc.sequence>checkpoint.sequence||loc.epoch>checkpoint.epoch)
   fail('UNATTESTED_FORWARD_STATE')
  if(!same(loc,checkpoint))fail('STATE_FORK_DETECTED')
 }
 const anchor=paths=>{
  requireActive()
  if(checkpoint)fail('ANCHOR_ALREADY_PINNED')
  const loc=localCheckpoint(paths)
  if(loc.sequence!==0||loc.epoch!==1)fail('NON_GENESIS_ANCHOR_REQUIRES_OOB')
  checkpoint=loc
  return {pinnedRoot:initialPublicKey,attested:evidence('genesis','genesis',loc),
   checkpoint:{sequence:loc.sequence,epoch:loc.epoch,stateDigest:loc.stateDigest,
    localRoot:loc.localRoot}}
 }
 const inspect=paths=>{
  compare(localCheckpoint(paths))
  return {sequence:checkpoint.sequence,epoch:checkpoint.epoch,
   generation,stateDigest:checkpoint.stateDigest}
 }
 const execute=(paths,action,payload,operationId=randomUUID())=>{
  requireActive();requireAnchor()
  if(typeof operationId!=='string'||!operationId)fail('OPERATION_ID_INVALID')
  if(events.has(operationId))fail('OPERATION_ID_REPLAY')
  const before=localCheckpoint(paths);compare(before)
  const nonceKey=action==='decide'&&payload.action==='transfer'?
   JSON.stringify([payload.tenant,payload.jti]):null
  const previous=nonceKey?ledger.get(nonceKey):null
  if(previous&&(previous.deviceId!==payload.deviceId||
    previous.digest!==payload.digest||previous.epoch!==before.epoch))
   fail('EXTERNAL_NONCE_REPLAY')
  let api,output
  try{
   api=createC47WitnessAuthority(paths)
   if(action==='registerDevice')output=api.registerDevice(payload)
   else if(action==='revoke')output=api.revoke(payload.deviceId)
   else if(action==='advance')output=api.advance(payload.delta)
   else if(action==='decide')output=api.decide(payload)
   else fail('ACTION_INVALID')
  }finally{api?.close()}
  if(action==='decide'&&!output.ok)return {ok:false,local:output}
  // A cooperating writer's operation advances exactly once. Any crash or concurrent bypass
  // between main commit and external attestation is quarantined, not auto-replayed.
  const after=localCheckpoint(paths)
  if(after.sequence!==before.sequence+1||after.epoch<before.epoch||
    after.localRoot!==before.localRoot||after.stateDigest===before.stateDigest)
   fail('UNATTESTED_TRANSITION')
  if(action==='decide'){
   if(!verifyC47Signature(before.publicKey,C47_RECEIPT_DOMAIN,
    output.receipt,output.signature)||output.receipt.sequence!==after.sequence||
    output.receipt.stateDigest!==after.stateDigest||output.receipt.epoch!==after.epoch)
    fail('LOCAL_RECEIPT_INVALID')
   if(nonceKey&&output.receipt.status!==(previous?'idempotent':'accepted'))
    fail('EXTERNAL_NONCE_INCONSISTENT')
  }
  checkpoint=after
  if(nonceKey&&!previous)ledger.set(nonceKey,{deviceId:payload.deviceId,
   digest:payload.digest,epoch:before.epoch})
  const proof=evidence(action,operationId,after,action==='decide'?output.receipt:null)
  events.set(operationId,proof)
  return {ok:true,local:output,proof}
 }
 const rotate=(reason='scheduled-fixture-rotation')=>{
  requireActive();requireAnchor()
  if(typeof reason!=='string'||!reason)fail('ROTATION_REASON_REQUIRED')
  const next=pair(),body={version:1,from:generation,to:generation+1,
   oldRoot:sha(key.publicKey),newRoot:sha(next.publicKey),
   newPublicKey:next.publicKey,atSequence:checkpoint.sequence,
   atEpoch:checkpoint.epoch,reason}
  const cert={body,signatureOld:signC48Fixture(key.privateKey,C48_ROTATE_DOMAIN,body),
   signatureNew:signC48Fixture(next.privateKey,C48_POP_DOMAIN,body)}
  chain.push(cert);key=next;generation++
  return cert
 }
 const manualRecover=({source,target,failedLocal,approval})=>{
  requireActive();requireAnchor()
  // This literal is NOT an operator authentication mechanism.
  if(approval!=='I_APPROVE_C48_FIXTURE_RECOVERY')fail('RECOVERY_APPROVAL_REQUIRED')
  if(existsSync(target.dbPath)||existsSync(target.witnessPath))
   fail('RECOVERY_DESTINATION_NOT_EMPTY')
  if(failedLocal){
   try{
    const current=localCheckpoint(failedLocal)
    if(current.sequence>checkpoint.sequence||current.epoch>checkpoint.epoch)
     fail('UNATTESTED_FORWARD_REQUIRES_INVESTIGATION')
   }catch(e){
    if(e.code!=='WITNESS_DIVERGENCE'&&e.code!=='MISSING_AUTHORITY_PART')throw e
   }
  }
  const candidate=localCheckpoint(source)
  if(!same(candidate,checkpoint))fail('RECOVERY_NOT_EXACT_CHECKPOINT')
  if(candidate.publicKey!==checkpoint.publicKey)fail('RECOVERY_ROOT_MISMATCH')
  try{
   copyFileSync(source.dbPath,target.dbPath)
   copyFileSync(source.witnessPath,target.witnessPath)
   const restored=localCheckpoint(target)
   if(!same(restored,checkpoint))fail('RECOVERY_POSTCOPY_MISMATCH')
   return {ok:true,proof:evidence('manual-recovery',randomUUID(),restored)}
  }catch(e){
   rmSync(target.dbPath,{force:true});rmSync(target.witnessPath,{force:true})
   throw e
  }
 }
 const current=()=>({generation,sequence:checkpoint?.sequence??null,
  epoch:checkpoint?.epoch??null,compromised,chain:chain.map(x=>({...x}))})
 // Deliberate unsafe test hook ONLY: simulates private-key theft for red-team fixtures.
 const leakCurrentKeyForAttackTest=()=>key.privateKey
 const markCurrentKeyCompromisedTest=()=>{compromised=true}
 return {anchor,inspect,execute,rotate,manualRecover,current,
  leakCurrentKeyForAttackTest,markCurrentKeyCompromisedTest}
}
