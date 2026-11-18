// C45 Node-only synthetic authority. Never serve this module to a browser.
// Ephemeral P-256 private signing key and bearer fixtures stay in the Node harness.
import {generateKeyPairSync,randomBytes,sign,createHash} from 'node:crypto'
import {canonical} from './c39_snapshot_transfer.mjs'

const ISSUER='rutacap-c45-node-mock'
const AUDIENCE='rutacap-c45-offline-fixture'
const POLICY_DOMAIN='RUTACAP-C45-POLICY-V1\0'
const RECEIPT_DOMAIN='RUTACAP-C45-RECEIPT-V1\0'
const fail=code=>{const err=Error(code);err.code=code;throw err}
const str=x=>typeof x==='string'&&x.length>0
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const signBody=(key,domain,body)=>sign('sha256',Buffer.from(domain+canonical(body)),{
 key,dsaEncoding:'ieee-p1363'}).toString('base64url')
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex')
const validTime=t=>Number.isSafeInteger(t)&&t>=0
const response=(ok,rest)=>({ok,...rest})

export function createC45MockAuthority({initialTime=1000,maxNonces=128,
 leaseMs=500,policyTtl=200000}={}){
 if(!validTime(initialTime)||!Number.isSafeInteger(maxNonces)||maxNonces<2||
 !Number.isSafeInteger(leaseMs)||leaseMs<1||
 !Number.isSafeInteger(policyTtl)||policyTtl<=leaseMs)fail('AUTHORITY_CONFIG_INVALID')
 const root=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
 const rootPublicJwk=root.publicKey.export({format:'jwk'})
 let tick=initialTime,revision=1,epoch=1,issuedAt=tick,expiry=tick+policyTtl
 const devices=new Map(),nonces=new Map(),challenges=new Set(),revoked=new Set()
 const policy=()=>({version:1,revision,epoch,issuer:ISSUER,audience:AUDIENCE,
  issuedAt,expiresAt:expiry,revokedDevices:[...revoked].sort()})
 function registerDevice(ownerId,deviceId){
  if(!str(ownerId)||!str(deviceId)||devices.has(deviceId))fail('DEVICE_INVALID')
  const credential=randomBytes(24).toString('hex')
  devices.set(deviceId,{ownerId,credential})
  return {ownerId,deviceId,credential}
 }
 function updatePolicy({revokeDevice=null,rotateEpoch=false,extend=false}={}){
  if(revokeDevice!==null){
   if(!devices.has(revokeDevice))fail('DEVICE_UNKNOWN')
   revoked.add(revokeDevice)
  }
  revision++
  if(rotateEpoch)epoch++
  issuedAt=tick
  if(extend)expiry=tick+policyTtl
  return policy()
 }
 function advance(ms){
  if(!Number.isSafeInteger(ms)||ms<0||!validTime(tick+ms))fail('CLOCK_INVALID')
  tick+=ms
  return tick
 }
 // All decisions below are synchronous: no JS await between nonce check and record.
 function handle(req){
  try {
   if(!req||typeof req!=='object')fail('REQUEST_INVALID')
   const identity=devices.get(req.deviceId)
   if(!identity||req.credential!==identity.credential)fail('AUTH_REQUIRED')
   if(req.ownerId!==identity.ownerId)fail('OWNER_MISMATCH')
   if(revoked.has(req.deviceId))fail('DEVICE_REVOKED')
   if(tick>=expiry)fail('POLICY_EXPIRED')
   if(!str(req.challenge)||! /^[0-9a-f-]{36}$/.test(req.challenge))
    fail('CHALLENGE_INVALID')
   const challengeKey=req.deviceId+'\0'+req.challenge
   if(challenges.has(challengeKey))fail('CHALLENGE_REPLAY')
   if(challenges.size>=2048)fail('CHALLENGE_CAPACITY')
   if(!['refresh','transfer'].includes(req.action))fail('ACTION_INVALID')
   let result='fresh'
   if(req.action==='transfer'){
    if(req.revision!==revision||req.epoch!==epoch)fail('POLICY_STALE')
    if(!str(req.jti)||req.jti.length>128||!hex(req.digest))fail('TRANSFER_INVALID')
    const nonceKey=identity.ownerId+'\0'+req.jti
    const existing=nonces.get(nonceKey)
    if(existing){
     if(existing.deviceId!==req.deviceId||existing.digest!==req.digest||
      existing.epoch!==epoch)fail('GLOBAL_REPLAY_REJECTED')
     result='idempotent'
    }else if(nonces.size>=maxNonces)fail('GLOBAL_LEDGER_FULL')
    else result='accepted'
   }
   // The challenge and nonce decision are committed atomically within this
   // single-threaded deterministic mock. This is NOT distributed SQL atomicity.
   challenges.add(challengeKey)
   if(req.action==='transfer'&&result==='accepted')
    nonces.set(identity.ownerId+'\0'+req.jti,{deviceId:req.deviceId,
     digest:req.digest,epoch,revision,serverTime:tick})
   const p=policy()
   const r={version:1,issuer:ISSUER,audience:AUDIENCE,action:req.action,
    ownerId:identity.ownerId,deviceId:req.deviceId,challenge:req.challenge,
    jti:req.action==='transfer'?req.jti:null,
    digest:req.action==='transfer'?req.digest:null,
    status:result,revision,epoch,serverTime:tick,
    validUntil:Math.min(tick+leaseMs,expiry),policyDigest:digest(p)}
   return response(true,{policy:p,policySignature:signBody(root.privateKey,POLICY_DOMAIN,p),
    receipt:r,receiptSignature:signBody(root.privateKey,RECEIPT_DOMAIN,r)})
  }catch(e){return response(false,{code:e.code||'AUTHORITY_FAILURE'})}
 }
 function inspect(){
  return {revision,epoch,serverTime:tick,expiresAt:expiry,
   nonceCount:nonces.size,challengeCount:challenges.size,revoked:[...revoked].sort()}
 }
 return {rootPublicJwk,registerDevice,updatePolicy,advance,handle,inspect}
}
