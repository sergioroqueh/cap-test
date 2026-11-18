// C45 browser-only synthetic verification gate. No app import, HTTP or cloud.
// All privileged operations require a fresh signed Node authority exchange.
import {canonical,sha256} from './c41_browser_journal.mjs'
const utf8=new TextEncoder()
const ISSUER='rutacap-c45-node-mock'
const AUDIENCE='rutacap-c45-offline-fixture'
const POLICY_DOMAIN='RUTACAP-C45-POLICY-V1\0'
const RECEIPT_DOMAIN='RUTACAP-C45-RECEIPT-V1\0'
const bad=code=>{const e=Error(code);e.code=code;throw e}
const str=x=>typeof x==='string'&&x.length>0
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const validPublic=x=>obj(x)&&x.kty==='EC'&&x.crv==='P-256'&&
 str(x.x)&&str(x.y)&&!('d' in x)
const clone=x=>structuredClone(x)
function signatureBytes(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(value))bad('BAD_SIGNATURE')
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'==')
 if(raw.length!==64)bad('BAD_SIGNATURE')
 return Uint8Array.from(raw,c=>c.charCodeAt(0))
}
async function verified(key,domain,body,signature){
 try{
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,
   signatureBytes(signature),utf8.encode(domain+canonical(body))))bad('BAD_SIGNATURE')
 }catch(e){if(e.code==='BAD_SIGNATURE')throw e;bad('BAD_SIGNATURE')}
}
function openDb(namespace,deviceId){
 return new Promise((resolve,reject)=>{
  const q=indexedDB.open('rutacap-c45-fixture-'+namespace+'-'+deviceId,1)
  q.onupgradeneeded=()=>q.result.createObjectStore('attestations',{keyPath:'id'})
  q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result)}
  q.onerror=()=>reject(q.error)
  q.onblocked=()=>reject(Error('DB_BLOCKED'))
 })
}
function transact(db,mode,fn){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['attestations'],mode)
  let result,problem
  const set=x=>result=x
  const stop=code=>{problem=Object.assign(Error(code),{code});tx.abort()}
  tx.oncomplete=()=>resolve(result)
  tx.onabort=()=>reject(problem||Object.assign(Error('DB_ABORT'),{code:'DB_ABORT'}))
  try{fn(tx,set,stop)}catch(e){problem=e;tx.abort()}
 })
}
export function createC45Gate({namespace,ownerId,deviceId,credential,rootPublicJwk,
 rpc,challenge=()=>crypto.randomUUID()}={}){
 if(!str(namespace)||!/^[a-z0-9-]{1,40}$/.test(namespace)||!str(ownerId)||
 !str(deviceId)||!str(credential)||!validPublic(rootPublicJwk)||
 typeof rpc!=='function'||typeof challenge!=='function')bad('GATE_CONFIG_INVALID')
 const anchor=clone(rootPublicJwk) // NOT read from IndexedDB
 const dbPromise=openDb(namespace,deviceId)
 let online=true,verifiedOnline=null
 async function attest(action,fields={},options={}){
  if(!online)bad('OFFLINE_NO_AUTHORITY')
  if(action==='transfer'&&!verifiedOnline)bad('ONLINE_REFRESH_REQUIRED')
  if(action==='transfer'&&(!str(fields.jti)||!hex(fields.digest)))bad('TRANSFER_INVALID')
  const nonce=challenge()
  if(typeof nonce!=='string'||!/^[0-9a-f-]{36}$/.test(nonce))
   bad('CHALLENGE_INVALID')
  const req={action,credential,ownerId,deviceId,challenge:nonce}
  if(action==='transfer')Object.assign(req,{jti:fields.jti,digest:fields.digest,
   revision:verifiedOnline.revision,epoch:verifiedOnline.epoch})
  let answer
  try{answer=await rpc(req)}catch{bad('AUTHORITY_UNAVAILABLE')}
  if(!obj(answer))bad('AUTHORITY_RESPONSE_INVALID')
  if(answer.ok!==true){
   if(answer.ok===false&&str(answer.code))bad(answer.code)
   bad('AUTHORITY_RESPONSE_INVALID')
  }
  const p=answer.policy,r=answer.receipt
  if(!obj(p)||p.version!==1||p.issuer!==ISSUER||p.audience!==AUDIENCE||
   !Number.isSafeInteger(p.revision)||p.revision<1||
   !Number.isSafeInteger(p.epoch)||p.epoch<1||
   !Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||
   !Array.isArray(p.revokedDevices)||!p.revokedDevices.every(str))
   bad('POLICY_INVALID')
  if(!obj(r)||r.version!==1||r.issuer!==ISSUER||r.audience!==AUDIENCE||
   r.action!==action||r.ownerId!==ownerId||r.deviceId!==deviceId||
   r.challenge!==nonce||r.revision!==p.revision||r.epoch!==p.epoch||
   !Number.isSafeInteger(r.serverTime)||!Number.isSafeInteger(r.validUntil)||
   r.serverTime<p.issuedAt||r.serverTime>=p.expiresAt||
   r.validUntil<=r.serverTime||r.validUntil>p.expiresAt||
   p.revokedDevices.includes(deviceId)||
   r.jti!==(action==='transfer'?fields.jti:null)||
   r.digest!==(action==='transfer'?fields.digest:null)||
   !(['fresh'].includes(r.status)&&action==='refresh')&&
   !(action==='transfer'&&['accepted','idempotent'].includes(r.status)))
   bad('RECEIPT_INVALID')
  if(r.policyDigest!==await sha256(p))bad('POLICY_DIGEST_MISMATCH')
  const key=await crypto.subtle.importKey('jwk',anchor,{name:'ECDSA',
   namedCurve:'P-256'},false,['verify'])
  await verified(key,POLICY_DOMAIN,p,answer.policySignature)
  await verified(key,RECEIPT_DOMAIN,r,answer.receiptSignature)
  if(verifiedOnline&&(p.revision<verifiedOnline.revision||
   p.epoch<verifiedOnline.epoch||
   r.serverTime<verifiedOnline.serverTime))bad('AUTHORITY_ROLLBACK')
  // Store only a signed audit snapshot. Local data is NEVER an authorization source.
  const db=await dbPromise
  await transact(db,'readwrite',(tx,set,stop)=>{
   tx.objectStore('attestations').put({id:'last',policy:clone(p),
    policySignature:answer.policySignature,receipt:clone(r),
    receiptSignature:answer.receiptSignature})
   if(options.abortBeforeCommit){stop('INJECTED_ABORT');return}
   set(true)
  })
  verifiedOnline={revision:p.revision,epoch:p.epoch,serverTime:r.serverTime}
  return {action,status:r.status,revision:p.revision,epoch:p.epoch,
   serverTime:r.serverTime,validUntil:r.validUntil,jti:r.jti}
 }
 const refresh=options=>attest('refresh',{},options)
 const transfer=(fields,options)=>attest('transfer',fields,options)
 const readOffline=async()=>{
  const db=await dbPromise
  const cached=await transact(db,'readonly',(tx,set)=>{
   tx.objectStore('attestations').get('last').onsuccess=e=>set(e.target.result)
  })
  // Even a valid cached signature cannot establish fresh policy, time, or nonce.
  return {mode:'read-only',trustedForTransfer:false,serverVerified:false,
   hasCachedData:!!cached,reason:'FRESH_AUTHORITY_REQUIRED'}
 }
 const setOnline=value=>{online=value===true;if(!online)verifiedOnline=null}
 const close=async()=>{(await dbPromise).close()}
 return {refresh,transfer,readOffline,setOnline,close}
}
