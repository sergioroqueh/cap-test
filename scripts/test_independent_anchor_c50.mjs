// C50 bounded mock evidence: eight targeted tests, no new database/server.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {generateKeyPairSync,createHash} from 'node:crypto'
import {bootstrapC50Anchor,readC50Anchor,observeC50Anchor}
 from './c50_independent_anchor.mjs'
import {signC48Fixture,C48_ATTEST_DOMAIN,C48_ROTATE_DOMAIN,C48_POP_DOMAIN,
 verifyC48Attestation} from './c48_external_witness_mock.mjs'

const sha=x=>createHash('sha256').update(x).digest('hex')
const pair=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1',
 publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
const fixture=()=>{
 const dir=mkdtempSync(join(tmpdir(),'rutacap-c50-'))
 return {dir,path:join(dir,'pinned-ledger.ndjson'),
  copy:join(dir,'early-ledger.ndjson'),
  cleanup:()=>rmSync(dir,{force:true,recursive:true})}
}
const make=(key,sequence,generation=1,chain=[],extra={})=>{
 const attestation={version:1,issuer:'rutacap-c49-disposable-durable-worker',
  generation,sequence,epoch:sequence>=2?2:1,stateDigest:sha('state-'+sequence),
  localRoot:sha('c47-original-root'),action:sequence===0?'genesis':'checkpoint',
  operationId:'op-'+sequence,receiptDigest:null,...extra}
 return {attestation,chain,
  signature:signC48Fixture(key.privateKey,C48_ATTEST_DOMAIN,attestation)}
}
const setup=()=>{
 const f=fixture(),root=pair(),genesis=make(root,0)
 bootstrapC50Anchor({path:f.path,pinnedRoot:root.publicKey,genesisProof:genesis})
 return {f,root,genesis}
}
const observe=(s,proof)=>observeC50Anchor({path:s.f.path,
 pinnedRoot:s.root.publicKey,proof})
const read=s=>readC50Anchor({path:s.f.path,pinnedRoot:s.root.publicKey})
const rotate=(oldKey,newKey)=>{
 const body={version:1,from:1,to:2,oldRoot:sha(oldKey.publicKey),
  newRoot:sha(newKey.publicKey),newPublicKey:newKey.publicKey,
  atSequence:1,atEpoch:1,reason:'synthetic-rotation'}
 return {body,
  signatureOld:signC48Fixture(oldKey.privateKey,C48_ROTATE_DOMAIN,body),
  signatureNew:signC48Fixture(newKey.privateKey,C48_POP_DOMAIN,body)}
}

test('C50 pinned genesis and signed high-water persist across fresh reader instances',()=>{
 const s=setup()
 try{
  assert.equal(read(s).latest.sequence,0)
  assert.equal(observe(s,make(s.root,1)).status,'observed')
  assert.equal(read(s).latest.sequence,1)
  assert.equal(read(s).entries,2)
 }finally{s.f.cleanup()}
})

test('C50 independently retained high-water rejects signed rollback of all three C49-era databases',()=>{
 const s=setup()
 try{
  const old=make(s.root,1)
  observe(s,old)
  observe(s,make(s.root,2))
  assert.throws(()=>observe(s,old),{code:'OBSERVED_ROLLBACK'})
  assert.equal(read(s).latest.sequence,2)
 }finally{s.f.cleanup()}
})

test('C50 signed fork at identical sequence is rejected despite valid cryptographic signature',()=>{
 const s=setup()
 try{
  observe(s,make(s.root,1))
  const fork=make(s.root,1,1,[],{stateDigest:sha('different-state')})
  assert.throws(()=>observe(s,fork),{code:'SAME_SEQUENCE_FORK'})
 }finally{s.f.cleanup()}
})

test('C50 cross-signed rotation progresses generation; old generation cannot return',()=>{
 const s=setup()
 try{
  const prior=make(s.root,1)
  observe(s,prior)
  const fresh=pair(),cert=rotate(s.root,fresh)
  const post=make(fresh,1,2,[cert],{epoch:1,stateDigest:sha('state-1')})
  assert.equal(observe(s,post).latest.generation,2)
  assert.throws(()=>observe(s,prior),{code:'OBSERVED_ROLLBACK'})
  const invalid={...post,chain:[{...cert,signatureOld:'tampered'}]}
  assert.throws(()=>observe(s,invalid),{code:'UNTRUSTED_ATTESTATION'})
 }finally{s.f.cleanup()}
})

test('C50 duplicates do not append; swapped root cannot validate original pinned history',()=>{
 const s=setup()
 try{
  const next=make(s.root,1)
  observe(s,next)
  assert.equal(observe(s,next).status,'already-observed')
  assert.equal(read(s).entries,2)
  const stranger=pair()
  assert.throws(()=>readC50Anchor({path:s.f.path,pinnedRoot:stranger.publicKey}),
   {code:'UNTRUSTED_ATTESTATION'})
 }finally{s.f.cleanup()}
})

test('C50 truncated log, malformed chain and stale lock fail closed without repair',()=>{
 const s=setup()
 try{
  const text=readFileSync(s.f.path,'utf8')
  writeFileSync(s.f.path,text.trimEnd())
  assert.throws(()=>read(s),{code:'ANCHOR_TRUNCATED'})
  writeFileSync(s.f.path,text.replace('"previousHash":"GENESIS"',
   '"previousHash":"ATTACKER"'))
  assert.throws(()=>read(s),{code:'ANCHOR_HASH_CHAIN_INVALID'})
  writeFileSync(s.f.path,text)
  writeFileSync(s.f.path+'.lock','fixture-crashed')
  assert.throws(()=>read(s),{code:'ANCHOR_LOCK_UNAVAILABLE'})
 }finally{s.f.cleanup()}
})

test('C50 compromise of active signing key remains a bypass: not a hardware root',()=>{
 const s=setup()
 try{
  const stolenPrivate=s.root.privateKey
  const fake=make({...s.root,privateKey:stolenPrivate},999)
  assert.equal(verifyC48Attestation(fake,s.root.publicKey,
   {expectedGeneration:1,minSequence:999}),true)
  assert.equal(observe(s,fake).status,'observed')
  // Deliberately reproduced: independently pinned log alone cannot detect stolen key.
 }finally{s.f.cleanup()}
})

test('C50 rollback INCLUDING independent observer storage restores older high-water: explicit limit',()=>{
 const s=setup()
 try{
  const early=make(s.root,1)
  observe(s,early)
  copyFileSync(s.f.path,s.f.copy)
  observe(s,make(s.root,2))
  copyFileSync(s.f.copy,s.f.path)
  assert.equal(read(s).latest.sequence,1)
  assert.equal(observe(s,early).status,'already-observed')
  // Need truly separate administrative trust domain / non-rollback hardware to resist this.
 }finally{s.f.cleanup()}
})
