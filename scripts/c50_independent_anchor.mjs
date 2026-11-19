// C50: deliberately tiny client-side, OUT-OF-THREE-SQLITE high-water fixture.
// Single cooperating writer. No tamper-proof storage, hardware or real isolation.
import {openSync,closeSync,readFileSync,writeSync,fsyncSync,unlinkSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {verifyC48Attestation} from './c48_external_witness_mock.mjs'

const error=code=>{const e=Error(code);e.code=code;throw e}
const sha=x=>createHash('sha256').update(x).digest('hex')
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
const validString=x=>typeof x==='string'&&x.length>0
const safeInt=x=>Number.isSafeInteger(x)&&x>=0
const validAttestation=p=>{
 const a=p?.attestation
 return !!a&&a.version===1&&safeInt(a.sequence)&&safeInt(a.epoch)&&
  safeInt(a.generation)&&a.generation>=1&&digest(a.stateDigest)&&
  digest(a.localRoot)&&validString(p.signature)&&Array.isArray(p.chain)
}
const checkpoint=p=>{
 const a=p.attestation
 return {sequence:a.sequence,epoch:a.epoch,generation:a.generation,
  stateDigest:a.stateDigest,localRoot:a.localRoot}
}
const signed=(p,root)=>{
 if(!validAttestation(p)||!verifyC48Attestation(p,root,{
  expectedGeneration:p.attestation.generation,minSequence:p.attestation.sequence,
  expectedDigest:p.attestation.stateDigest}))error('UNTRUSTED_ATTESTATION')
}
const step=(previous,next)=>{
 if(!previous)return
 if(next.localRoot!==previous.localRoot)error('LOCAL_ROOT_REPLACEMENT')
 if(next.sequence<previous.sequence||next.epoch<previous.epoch||
  next.generation<previous.generation)error('OBSERVED_ROLLBACK')
 if(next.sequence===previous.sequence&&
  (next.epoch!==previous.epoch||next.stateDigest!==previous.stateDigest))
  error('SAME_SEQUENCE_FORK')
}
const line=(previousHash,proof)=>({
 previousHash,proof,hash:sha(previousHash+'\0'+JSON.stringify(proof))
})
function inspectText(data,root){
 if(!data.endsWith('\n'))error('ANCHOR_TRUNCATED')
 const lines=data.trimEnd().split('\n')
 if(lines.length===0||!lines[0])error('ANCHOR_MISSING')
 let hash='GENESIS',previous=null
 for(const entry of lines){
  let item
  try{item=JSON.parse(entry)}catch{error('ANCHOR_CORRUPT')}
  if(!item||item.previousHash!==hash||!item.proof||
   item.hash!==sha(hash+'\0'+JSON.stringify(item.proof)))
   error('ANCHOR_HASH_CHAIN_INVALID')
  signed(item.proof,root)
  const current=checkpoint(item.proof)
  step(previous,current)
  hash=item.hash
  previous=current
 }
 return {latest:previous,hash,entries:lines.length}
}
function lock(path,fn){
 const lockPath=path+'.lock'
 let fd
 try{fd=openSync(lockPath,'wx',0o600)}
 catch{error('ANCHOR_LOCK_UNAVAILABLE')}
 try{return fn()}
 finally{
  try{closeSync(fd)}finally{unlinkSync(lockPath)}
 }
}
function appendSync(path,text,flag){
 const fd=openSync(path,flag,0o600)
 try{writeSync(fd,text);fsyncSync(fd)}finally{closeSync(fd)}
}
export function bootstrapC50Anchor({path,pinnedRoot,genesisProof}){
 if(!validString(path)||!validString(pinnedRoot))error('ANCHOR_CONFIG_INVALID')
 return lock(path,()=>{
  if(existsSync(path))error('ANCHOR_ALREADY_EXISTS')
  signed(genesisProof,pinnedRoot)
  const s=checkpoint(genesisProof)
  if(s.sequence!==0||s.epoch!==1||s.generation!==1)error('GENESIS_REQUIRED')
  const record=line('GENESIS',genesisProof)
  appendSync(path,JSON.stringify(record)+'\n','wx')
  return {pinnedRoot,...s,entries:1}
 })
}
export function readC50Anchor({path,pinnedRoot}){
 if(!validString(path)||!validString(pinnedRoot))error('ANCHOR_CONFIG_INVALID')
 return lock(path,()=>{
  if(!existsSync(path))error('ANCHOR_MISSING')
  return inspectText(readFileSync(path,'utf8'),pinnedRoot)
 })
}
export function observeC50Anchor({path,pinnedRoot,proof}){
 if(!validString(path)||!validString(pinnedRoot))error('ANCHOR_CONFIG_INVALID')
 return lock(path,()=>{
  if(!existsSync(path))error('ANCHOR_MISSING')
  const old=inspectText(readFileSync(path,'utf8'),pinnedRoot)
  signed(proof,pinnedRoot)
  const next=checkpoint(proof)
  step(old.latest,next)
  // No duplicate writes for repeated delivery of an attestation.
  if(next.sequence===old.latest.sequence&&next.generation===old.latest.generation)
   return {status:'already-observed',latest:old.latest,entries:old.entries}
  const record=line(old.hash,proof)
  appendSync(path,JSON.stringify(record)+'\n','a')
  return {status:'observed',latest:next,entries:old.entries+1}
 })
}
