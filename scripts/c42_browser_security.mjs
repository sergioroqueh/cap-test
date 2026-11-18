// C42 synthetic browser security harness. Never imported by the PWA.
// No signing credentials in the browser: public WebCrypto verification only.
// BroadcastChannel coordinates cancellation, not authentication or authorization.
import {canonical} from './c41_browser_journal.mjs'

const PREFIX='RUTACAP-C42-MANIFEST-P256-V1\0'
const utf8=new TextEncoder()
const TEXT=x=>typeof x==='string'&&x.length>0
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
const reject=code=>{const e=new Error(code);e.code=code;throw e}
const same=(a,b)=>canonical(a)===canonical(b)
const streamKeys=['events','sessions']
const signedPart=e=>({version:e.version,issuer:e.issuer,audience:e.audience,
  kid:e.kid,issuedAt:e.issuedAt,expiresAt:e.expiresAt,manifest:e.manifest})
const sigBytes=s=>{
  if(typeof s!=='string'||! /^(?:[A-Za-z0-9_-]{4}){21}[A-Za-z0-9_-]{2}$/.test(s))
    reject('SIGNATURE_INVALID') // exactly 64 P1363 bytes encoded base64url
  const base64=s.replace(/-/g,'+').replace(/_/g,'/')+'=='
  const text=atob(base64)
  if(text.length!==64)reject('SIGNATURE_INVALID')
  return Uint8Array.from(text,c=>c.charCodeAt(0))
}
export async function verifyC42Envelope({
  envelope, trustedPublicKeys, expectedOwner, expectedIssuer='rutacap-c42-fixture',
  expectedAudience='rutacap-c42-offline',now=()=>Date.now()
}={}) {
  if(!obj(envelope)||envelope.version!==1||!TEXT(envelope.kid)||
    !TEXT(expectedOwner)||envelope.issuer!==expectedIssuer||
    envelope.audience!==expectedAudience||!Number.isSafeInteger(envelope.issuedAt)||
    !Number.isSafeInteger(envelope.expiresAt)||
    envelope.issuedAt>now()||envelope.expiresAt<=now()||
    envelope.expiresAt<=envelope.issuedAt)reject('MANIFEST_CLAIMS_INVALID')
  const m=envelope.manifest
  if(!obj(m)||m.ownerId!==expectedOwner||!TEXT(m.snapshotId)||!TEXT(m.checkpoint)||
    !hex(m.digest)||!obj(m.counts)||
    !streamKeys.every(s=>Number.isSafeInteger(m.counts[s])&&m.counts[s]>=0)||
    (m.expiresAt!==undefined&&m.expiresAt!==envelope.expiresAt))reject('MANIFEST_CLAIMS_INVALID')
  const jwk=trustedPublicKeys?.[envelope.kid]
  if(!obj(jwk)||jwk.kty!=='EC'||jwk.crv!=='P-256'||!TEXT(jwk.x)||!TEXT(jwk.y)||
    'd' in jwk)reject('UNTRUSTED_KEY')
  let key,valid
  try{
    key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
    valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sigBytes(envelope.signature),
      utf8.encode(PREFIX+canonical(signedPart(envelope))))
  }catch{reject('SIGNATURE_INVALID')}
  if(!valid)reject('SIGNATURE_INVALID')
  return structuredClone(m)
}
export function classifyC42StorageFailure(e){
  if(e?.name==='QuotaExceededError'||e?.code==='IDB_QUOTA_EXCEEDED')return 'IDB_QUOTA_EXCEEDED'
  if(e?.name==='AbortError'||e?.code==='IDB_ABORT')return 'IDB_ABORT'
  return 'STORAGE_UNKNOWN'
}
export function createC42Coordinator({journal,namespace,ownerId,sessionId,now=()=>Date.now()}={}){
  if(!journal?.acquire||!journal?.append||!journal?.logout||
    !TEXT(namespace)||!/^[-a-z0-9]{1,60}$/.test(namespace)||
    !TEXT(ownerId)||!TEXT(sessionId)||!('BroadcastChannel' in globalThis))reject('COORDINATOR_INVALID')
  const channel=new BroadcastChannel('rutacap-c42-fixture-'+namespace)
  let revoked=false,closed=false,manifest=null,fencing=null
  const pending=new Set()
  let resolveRevoked
  const revokedPromise=new Promise(resolve=>resolveRevoked=resolve)
  const revokeLocal=()=>{
    if(revoked)return
    revoked=true
    for(const c of pending)c.abort()
    resolveRevoked()
  }
  channel.onmessage=e=>{
    const message=e.data
    if(!obj(message)||message.type!=='logout'||message.ownerId!==ownerId||
      message.sessionId!==sessionId||message.version!==1)return
    // Signal is only a hygiene notification; authoritative deletion happens via IDB.
    revokeLocal()
  }
  const guard=()=>{
    if(closed||revoked)reject('ACCOUNT_REVOKED')
    if(manifest?.expiresAt!==undefined&&manifest.expiresAt<=now())reject('MANIFEST_EXPIRED')
  }
  const authorize=async(args)=>{
    guard()
    if(!args?.envelope)reject('MANIFEST_CLAIMS_INVALID')
    const m=await verifyC42Envelope({...args,expectedOwner:ownerId,now})
    guard()
    manifest=m
    return structuredClone(m)
  }
  const acquire=async()=>{
    guard()
    if(!manifest)reject('NOT_AUTHORIZED')
    const out=await journal.acquire({ownerId,sessionId,manifest})
    guard()
    fencing=out.fencing
    return out
  }
  const append=async({stream,offset,items,waitForPage}={})=>{
    guard()
    if(!manifest||fencing===null)reject('NOT_AUTHORIZED')
    const controller=new AbortController()
    pending.add(controller)
    try{
      if(waitForPage)await waitForPage()
      guard()
      const result=await journal.append({ownerId,sessionId,manifest,fencing,stream,offset,items,
        signal:controller.signal})
      guard()
      return result
    }finally{pending.delete(controller)}
  }
  const logout=async()=>{
    if(closed)reject('COORDINATOR_CLOSED')
    revokeLocal()
    await journal.logout({ownerId,sessionId})
    channel.postMessage({version:1,type:'logout',ownerId,sessionId})
  }
  const finish=async()=>{
    guard()
    if(!manifest||fencing===null)reject('NOT_AUTHORIZED')
    const result=await journal.finish({ownerId,sessionId,manifest,fencing})
    guard()
    return result
  }
  const close=async()=>{
    closed=true;revokeLocal()
    channel.close()
    await journal.close()
  }
  return {authorize,acquire,append,finish,logout,close,isRevoked:()=>revoked,
    whenRevoked:()=>revokedPromise}
}
