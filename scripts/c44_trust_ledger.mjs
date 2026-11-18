// C44 offline security fixture ONLY: root-pinned public trust policy and anti-replay ledger.
// Not imported by production. No secret, signing key, external URL, or cloud client.
import {canonical,sha256} from './c41_browser_journal.mjs'

const utf8=new TextEncoder()
const STREAMS=['events','sessions']
const DOMAIN_POLICY='RUTACAP-C44-TRUST-P256-V1\0'
const DOMAIN_GRANT='RUTACAP-C44-GRANT-P256-V2\0'
const bad=code=>{const e=Error(code);e.code=code;throw e}
const str=x=>typeof x==='string'&&x.length>0
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
const clone=x=>structuredClone(x)
const MAX_LEDGER_ROWS=128
const MAX_CLEANUP_PER_CALL=32
const validLedger=x=>obj(x)&&str(x.jti)&&str(x.ownerId)&&str(x.sessionId)&&
 str(x.kid)&&hex(x.fingerprint)&&Number.isSafeInteger(x.revision)&&x.revision>=1&&
 Number.isSafeInteger(x.epoch)&&x.epoch>=1&&Number.isSafeInteger(x.issuedAt)&&
 Number.isSafeInteger(x.expiresAt)&&x.issuedAt<x.expiresAt
const rootOk=x=>obj(x)&&x.kty==='EC'&&x.crv==='P-256'&&str(x.x)&&str(x.y)&&!('d' in x)
const bodyPolicy=x=>({version:x.version,revision:x.revision,epoch:x.epoch,issuer:x.issuer,
 audience:x.audience,issuedAt:x.issuedAt,expiresAt:x.expiresAt,keys:x.keys})
const bodyGrant=x=>({version:x.version,kid:x.kid,epoch:x.epoch,issuer:x.issuer,
 audience:x.audience,ownerId:x.ownerId,sessionId:x.sessionId,jti:x.jti,
 issuedAt:x.issuedAt,notBefore:x.notBefore,expiresAt:x.expiresAt,manifest:x.manifest})
function bytes(signature) {
 if(typeof signature!=='string'||! /^[A-Za-z0-9_-]{86}$/.test(signature))bad('SIGNATURE_INVALID')
 const padded=signature.replace(/-/g,'+').replace(/_/g,'/')+'=='
 const b=atob(padded)
 if(b.length!==64)bad('SIGNATURE_INVALID')
 return Uint8Array.from(b,c=>c.charCodeAt(0))
}
async function verifyJwk(jwk,domain,body,signature) {
 if(!rootOk(jwk))bad('UNTRUSTED_KEY')
 try{
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
  const result=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,
   bytes(signature),utf8.encode(domain+canonical(body)))
  if(!result)bad('SIGNATURE_INVALID')
 }catch(e){if(e.code==='SIGNATURE_INVALID')throw e;bad('SIGNATURE_INVALID')}
}
function validatePolicy(p,now) {
 if(!obj(p)||p.version!==1||!Number.isSafeInteger(p.revision)||p.revision<1||
 !Number.isSafeInteger(p.epoch)||p.epoch<1||p.issuer!=='rutacap-c44-fixture'||
 p.audience!=='rutacap-c43-offline'||!Number.isSafeInteger(p.issuedAt)||
 !Number.isSafeInteger(p.expiresAt)||p.issuedAt>now||p.expiresAt<=now||
 !Array.isArray(p.keys)||p.keys.length<1||p.keys.length>8)bad('POLICY_INVALID')
 const seen=new Set()
 for(const k of p.keys){
  if(!obj(k)||!str(k.kid)||seen.has(k.kid)||!rootOk(k.publicJwk)||
   !Number.isSafeInteger(k.notBefore)||!Number.isSafeInteger(k.notAfter)||
   k.notBefore>=k.notAfter||!['active','retired','revoked'].includes(k.status)||
   (k.status==='retired'&&(!Number.isSafeInteger(k.retiredAt)||
    k.retiredAt<k.notBefore||k.retiredAt>k.notAfter)))bad('POLICY_INVALID')
  seen.add(k.kid)
 }
}
function validateGrant(g,owner,session,now) {
 const m=g?.manifest
 if(!obj(g)||g.version!==2||!str(g.kid)||!Number.isSafeInteger(g.epoch)||
 g.issuer!=='rutacap-c44-fixture'||g.audience!=='rutacap-c43-offline'||
 g.ownerId!==owner||g.sessionId!==session||!str(g.jti)||g.jti.length>128||
 !Number.isSafeInteger(g.issuedAt)||!Number.isSafeInteger(g.notBefore)||
 !Number.isSafeInteger(g.expiresAt)||g.issuedAt>now||g.notBefore>now||
 g.expiresAt<=now||g.notBefore>=g.expiresAt||g.expiresAt-g.issuedAt>60000||
 !obj(m)||m.ownerId!==owner||!str(m.snapshotId)||!str(m.checkpoint)||
 !hex(m.digest)||!obj(m.counts)||
 !STREAMS.every(s=>Number.isSafeInteger(m.counts[s])&&m.counts[s]>=0)||
 m.expiresAt!==g.expiresAt)bad('GRANT_CLAIMS_INVALID')
}
function connect(name) {
 return new Promise((resolve,reject)=>{
  const q=indexedDB.open(name,1)
  q.onupgradeneeded=()=>{
   q.result.createObjectStore('trust',{keyPath:'id'})
   q.result.createObjectStore('grants',{keyPath:'jti'})
  }
  q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result)}
  q.onerror=()=>reject(q.error)
  q.onblocked=()=>reject(Error('UPGRADE_BLOCKED'))
 })
}
function transaction(db,names,mode,fn) {
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(names,mode)
  let value, failure
  const set=x=>{value=x}
  const stop=code=>{failure=Error(code);failure.code=code;tx.abort()}
  tx.oncomplete=()=>resolve(value)
  tx.onabort=()=>reject(failure||Object.assign(Error('IDB_ABORT'),{code:'IDB_ABORT'}))
  try{fn(tx,set,stop)}catch(e){failure=e;tx.abort()}
 })
}
export function createC44Trust({namespace,rootPublicJwk,now=()=>Date.now()}={}){
 if(!str(namespace)||! /^[a-z0-9-]{1,60}$/.test(namespace)||!rootOk(rootPublicJwk)||
 typeof now!=='function')bad('TRUST_CONFIG_INVALID')
 const anchor=clone(rootPublicJwk) // bootstrap-supplied pinned root, never fetched from a policy
 const dbPromise=connect('rutacap-c44-fixture-'+namespace)
 const channel=new BroadcastChannel('rutacap-c44-trust-'+namespace)
 let hintedRevision=0
 channel.onmessage=e=>{
  if(e.data?.type==='policy'&&Number.isSafeInteger(e.data.revision))
   hintedRevision=Math.max(hintedRevision,e.data.revision)
 }
 const getPolicy=async()=>{
  const db=await dbPromise
  const entry=await transaction(db,['trust'],'readonly',(tx,set)=>{
   tx.objectStore('trust').get('pinned').onsuccess=e=>set(e.target.result)
  })
  if(!entry)bad('NO_TRUST_POLICY')
  if((await sha256(entry.policy))!==entry.fingerprint)bad('TRUST_CORRUPT')
  const verified=bodyPolicy(entry.policy)
  validatePolicy(verified,now())
  await verifyJwk(anchor,DOMAIN_POLICY,verified,entry.policy.signature)
  if(entry.revision!==verified.revision||entry.epoch!==verified.epoch)bad('TRUST_CORRUPT')
  return entry
 }
 const applyPolicy=async(envelope,{abortBeforeCommit=false}={})=>{
  const p=bodyPolicy(envelope)
  validatePolicy(p,now())
  await verifyJwk(anchor,DOMAIN_POLICY,p,envelope.signature)
  const fingerprint=await sha256(envelope)
  const db=await dbPromise
  const result=await transaction(db,['trust'],'readwrite',(tx,set,stop)=>{
   tx.objectStore('trust').get('pinned').onsuccess=e=>{
    const previous=e.target.result
    if(previous&& (p.revision<previous.revision||p.epoch<previous.epoch||
      (p.revision===previous.revision&&previous.fingerprint!==fingerprint))){
      stop('POLICY_ROLLBACK');return
    }
    if(previous&&p.revision===previous.revision){
     set({revision:p.revision,idempotent:true});return
    }
    tx.objectStore('trust').put({id:'pinned',revision:p.revision,epoch:p.epoch,
     fingerprint,policy:clone(envelope)})
    if(abortBeforeCommit){stop('INJECTED_ABORT');return}
    set({revision:p.revision,idempotent:false})
   }
  })
  if(!result.idempotent)channel.postMessage({type:'policy',revision:p.revision})
  return result
 }
 const accept=async({envelope,ownerId,sessionId,abortBeforeCommit=false}={})=>{
  if(!str(ownerId)||!str(sessionId))bad('AUTH_REQUIRED')
  const trust=await getPolicy()
  if(hintedRevision>trust.revision)bad('TRUST_CHANGED')
  const policy=bodyPolicy(trust.policy)
  validatePolicy(policy,now())
  const grant=bodyGrant(envelope)
  validateGrant(grant,ownerId,sessionId,now())
  if(grant.epoch!==policy.epoch)bad('EPOCH_REVOKED')
  const signingKey=policy.keys.find(k=>k.kid===grant.kid)
  if(!signingKey||signingKey.status==='revoked')bad('KEY_REVOKED')
  if(now()<signingKey.notBefore||now()>=signingKey.notAfter||
   (signingKey.status==='retired'&&(grant.issuedAt>=signingKey.retiredAt||now()>=signingKey.retiredAt)))
   bad('KEY_INACTIVE')
  if(grant.expiresAt>signingKey.notAfter)bad('KEY_INACTIVE')
  await verifyJwk(signingKey.publicJwk,DOMAIN_GRANT,grant,envelope.signature)
  const fingerprint=await sha256(envelope)
  const db=await dbPromise
  return transaction(db,['trust','grants'],'readwrite',(tx,set,stop)=>{
   tx.objectStore('trust').get('pinned').onsuccess=e=>{
    const latest=e.target.result
    if(!latest||latest.revision!==trust.revision||latest.fingerprint!==trust.fingerprint){
     stop('TRUST_CHANGED');return
    }
    if(now()>=policy.expiresAt||now()>=grant.expiresAt||
     (signingKey.status==='retired'&&now()>=signingKey.retiredAt)){
     stop('GRANT_EXPIRED_OR_RETIRED');return
    }
    tx.objectStore('grants').get(grant.jti).onsuccess=ev=>{
     const old=ev.target.result
     if(old&&!validLedger(old)){stop('LEDGER_CORRUPT');return}
     if(old){
      if(old.fingerprint!==fingerprint||old.ownerId!==ownerId||
       old.sessionId!==sessionId||old.epoch!==grant.epoch||
       old.kid!==grant.kid||old.expiresAt!==grant.expiresAt){
       stop('REPLAY_REJECTED');return
      }
      set({resumed:true,revision:trust.revision,jti:grant.jti});return
     }
     tx.objectStore('grants').count().onsuccess=ec=>{
      if(ec.target.result>=MAX_LEDGER_ROWS){stop('LEDGER_FULL');return}
      tx.objectStore('grants').put({jti:grant.jti,ownerId,sessionId,
       kid:grant.kid,revision:trust.revision,epoch:grant.epoch,
       issuedAt:grant.issuedAt,expiresAt:grant.expiresAt,fingerprint})
      if(abortBeforeCommit){stop('INJECTED_ABORT');return}
      set({resumed:false,revision:trust.revision,jti:grant.jti})
     }
    }
   }
  })
 }
 const checkBeforePage=async({revision,wait}={})=>{
  if(wait)await wait()
  const current=await getPolicy()
  if(hintedRevision>revision||current.revision!==revision)bad('TRUST_CHANGED')
  validatePolicy(bodyPolicy(current.policy),now())
  return true
 }
 // Bounded local cache maintenance, not a globally unique nonce ledger.
 const pruneExpiredGrants=async({limit=16,abortBeforeCommit=false}={})=>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_CLEANUP_PER_CALL)
   bad('CLEANUP_LIMIT_INVALID')
  const pinned=await getPolicy()
  const db=await dbPromise
  return transaction(db,['trust','grants'],'readwrite',(tx,set,stop)=>{
   tx.objectStore('trust').get('pinned').onsuccess=e=>{
    const latest=e.target.result
    if(!latest||latest.revision!==pinned.revision||
      latest.fingerprint!==pinned.fingerprint){stop('TRUST_CHANGED');return}
    let scanned=0,deleted=0
    const req=tx.objectStore('grants').openCursor()
    req.onsuccess=ev=>{
     const cursor=ev.target.result
     if(!cursor){if(abortBeforeCommit)stop('INJECTED_ABORT')
      else set({deleted,scanned});return}
     const row=cursor.value
     if(!validLedger(row)||row.jti!==cursor.key){stop('LEDGER_CORRUPT');return}
     scanned++
     if(row.expiresAt<=now()){
      cursor.delete()
      deleted++
     }
     if(deleted>=limit){
      if(abortBeforeCommit)stop('INJECTED_ABORT')
      else set({deleted,scanned})
      return
     }
     cursor.continue()
    }
   }
  })
 }
 const countGrants=async()=>{
  const db=await dbPromise
  return transaction(db,['grants'],'readonly',(tx,set)=>{
   tx.objectStore('grants').count().onsuccess=e=>set(e.target.result)
  })
 }
 const close=async()=>{channel.close();(await dbPromise).close()}
 return {applyPolicy,accept,checkBeforePage,getPolicy,countGrants,pruneExpiredGrants,close}
}
