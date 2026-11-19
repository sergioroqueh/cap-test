// C40: test-only signed snapshot manifest + crash-resilient local journal.
// This is NODE-ONLY, with synthetic rows and mock transport. NEVER import into web app.
import {createHmac, timingSafeEqual, randomUUID, createHash} from 'node:crypto'
import {mkdirSync, existsSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, unlinkSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {canonical, sha256, createC39Reader} from './c39_snapshot_transfer.mjs'

const HEX64=/^[a-f0-9]{64}$/
const STREAMS=['events','sessions']
const requireText=x=>typeof x==='string' && x.length>0
const fail=(code)=>{const err=new Error(code);err.code=code;throw err}
const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype
const duplicate=x=>structuredClone(x)
const body=e=>({version:e.version,issuer:e.issuer,issuedAt:e.issuedAt,expiresAt:e.expiresAt,manifest:e.manifest})
const hmac=(key,object)=>createHmac('sha256',key).update('RUTACAP-C40-MANIFEST-V1\0').update(canonical(object),'utf8').digest('hex')
const safeEqual=(a,b)=>HEX64.test(a) && HEX64.test(b) && timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))
const checkManifest=(m)=>{
  if(!plain(m)||!requireText(m.ownerId)||!requireText(m.snapshotId)||!requireText(m.checkpoint)||!HEX64.test(m.digest)||
    !plain(m.counts)||!STREAMS.every(s=>Number.isSafeInteger(m.counts[s])&&m.counts[s]>=0))
    fail('MANIFEST_INVALID')
}
export function createC40Authority({secret,issuer='rutacap-c40-fixture',now=()=>Date.now(),ttlMs=60_000}={}) {
  if(!(Buffer.isBuffer(secret)||typeof secret==='string')||Buffer.byteLength(secret)<32||!requireText(issuer)||
    !Number.isSafeInteger(ttlMs)||ttlMs<1)fail('FIXTURE_AUTHORITY_INVALID')
  const key=Buffer.from(secret)
  const sign=manifest=>{
    checkManifest(manifest)
    const issuedAt=now()
    const envelope={version:1,issuer,issuedAt,expiresAt:issuedAt+ttlMs,manifest:duplicate(manifest)}
    return {...envelope,mac:hmac(key,body(envelope))}
  }
  const verify=(envelope,ownerId)=>{
    if(!plain(envelope)||envelope.version!==1||envelope.issuer!==issuer||
      !Number.isSafeInteger(envelope.issuedAt)||!Number.isSafeInteger(envelope.expiresAt)||
      !HEX64.test(envelope.mac)||!plain(envelope.manifest))fail('MANIFEST_AUTH_INVALID')
    const expected=hmac(key,body(envelope))
    if(!safeEqual(expected,envelope.mac))fail('MANIFEST_AUTH_INVALID')
    checkManifest(envelope.manifest)
    if(envelope.manifest.ownerId!==ownerId)fail('OWNER_MISMATCH')
    const time=now()
    if(envelope.issuedAt>time||envelope.expiresAt<=envelope.issuedAt||envelope.expiresAt<=time)
      fail('MANIFEST_EXPIRED')
    return duplicate(envelope.manifest)
  }
  return {sign,verify}
}
export function createC40SignedFixture({provider,manifest,authority}={}) {
  if(!provider?.fixtureOnly||!manifest||!authority?.sign)fail('FIXTURE_ONLY')
  const envelope=authority.sign(manifest)
  return {
    fixtureOnly:true,
    async begin(){return duplicate(envelope)},
    async page(args){return provider.page(args)},
    async finish(args){return provider.finish(args)},
    envelope:duplicate(envelope)
  }
}
export function createC40FileJournal({dir,maxBytes=2_000_000}={}) {
  if(!requireText(dir)||!Number.isSafeInteger(maxBytes)||maxBytes<1)fail('JOURNAL_CONFIG_INVALID')
  mkdirSync(dir,{recursive:true,mode:0o700})
  const path=ownerId=>join(dir,'c40-'+createHash('sha256').update(ownerId).digest('hex').slice(0,32)+'.json')
  const syncDir=()=>{let fd;try{fd=openSync(dir,'r');fsyncSync(fd)}catch{ /* fsync directory not portable */ }finally{if(fd!==undefined)closeSync(fd)}}
  const remove=owner=>{
    const target=path(owner)
    if(existsSync(target)){unlinkSync(target);syncDir()}
  }
  const load=owner=>{
    const target=path(owner)
    if(!existsSync(target))return null
    try{
      const raw=readFileSync(target)
      if(raw.byteLength>maxBytes)fail('JOURNAL_CORRUPT')
      const saved=JSON.parse(raw.toString('utf8'))
      if(!plain(saved)||saved.version!==1||saved.ownerId!==owner||!plain(saved.state)||!HEX64.test(saved.integrity)||
        sha256(saved.state)!==saved.integrity)fail('JOURNAL_CORRUPT')
      return duplicate(saved.state)
    }catch(e){
      if(e.code==='JOURNAL_CORRUPT')throw e
      fail('JOURNAL_CORRUPT')
    }
  }
  const save=(owner,state)=>{
    const saved={version:1,ownerId:owner,state:duplicate(state),integrity:sha256(state)}
    const bytes=Buffer.from(JSON.stringify(saved),'utf8')
    if(bytes.byteLength>maxBytes)fail('JOURNAL_TOO_LARGE')
    const target=path(owner),tmp=target+'.'+randomUUID()+'.tmp'
    let fd
    try{
      fd=openSync(tmp,'wx',0o600)
      writeFileSync(fd,bytes)
      fsyncSync(fd);closeSync(fd);fd=undefined
      renameSync(tmp,target)
      syncDir()
    }catch(e){
      if(fd!==undefined)closeSync(fd)
      if(existsSync(tmp))unlinkSync(tmp)
      throw e
    }
  }
  return {load,save,clear:remove,path}
}
export function createC40Transfer({server,authority,journal,getIdentity,pageSize=2,maxRows=10000}={}) {
  if(!server?.fixtureOnly||!authority?.verify||!journal?.load||!journal?.save||!journal?.clear||
    typeof getIdentity!=='function')fail('MOCK_ONLY')
  const principal=()=>{
    const identity=getIdentity()
    if(!identity?.active||!identity?.consented||!requireText(identity.ownerId)||!requireText(identity.sessionId))
      fail('AUTH_REQUIRED')
    return {ownerId:identity.ownerId,sessionId:identity.sessionId}
  }
  const guard=start=>{
    const current=getIdentity()
    if(!current?.active||!current?.consented||current.ownerId!==start.ownerId||current.sessionId!==start.sessionId){
      journal.clear(start.ownerId)
      fail('ACCOUNT_CHANGED')
    }
  }
  const read=async()=>{
    const start=principal()
    let envelope
    try {
      envelope=await server.begin()
      guard(start)
      authority.verify(envelope,start.ownerId)
    }catch(e){
      if(e.code==='MANIFEST_EXPIRED'||e.code==='OWNER_MISMATCH'||e.code==='MANIFEST_AUTH_INVALID')
        journal.clear(start.ownerId)
      throw e
    }
    const m=envelope.manifest
    let state
    try{state=journal.load(start.ownerId)}catch(e){journal.clear(start.ownerId);throw e}
    if(state){
      if(state.sessionId!==start.sessionId){
        journal.clear(start.ownerId);fail('SESSION_MISMATCH')
      }
      if(canonical(state.envelope)!==canonical(envelope)){
        journal.clear(start.ownerId);fail('RESUME_MISMATCH')
      }
    } else {
      state={sessionId:start.sessionId,envelope:duplicate(envelope),rows:{events:[],sessions:[]}}
      journal.save(start.ownerId,state)
    }
    if(!plain(state.rows)||!STREAMS.every(s=>Array.isArray(state.rows[s]))) {
      journal.clear(start.ownerId);fail('JOURNAL_CORRUPT')
    }
    const verifyCurrent=()=>{
      guard(start)
      authority.verify(envelope,start.ownerId)
    }
    const wrapped={
      fixtureOnly:true,
      async begin(){verifyCurrent();return duplicate(m)},
      async page(args){
        verifyCurrent()
        const p=await server.page(args)
        verifyCurrent()
        const stream=args.stream
        const existing=state.rows[stream]
        const keyField=stream==='events'?'eventId':'clientId'
        if(!STREAMS.includes(stream)||!Number.isSafeInteger(args.offset)||!existing||
          args.offset!==existing.length||!p||p.ownerId!==m.ownerId||p.snapshotId!==m.snapshotId||
          p.checkpoint!==m.checkpoint||p.digest!==m.digest||p.stream!==stream||
          p.offset!==args.offset||p.total!==m.counts[stream]||!Array.isArray(p.items)||
          p.items.length===0||p.items.length>args.limit||p.items.length+existing.length>m.counts[stream])
          fail('PAGE_INVALID')
        const ids=new Set(existing.map(row=>row?.[keyField]))
        for(const item of p.items){
          if(!plain(item)||!requireText(item[keyField])||ids.has(item[keyField]))fail('KEY_INVALID')
          ids.add(item[keyField])
        }
        const newState={...state,rows:{...state.rows,[stream]:[...existing,...duplicate(p.items)]}}
        journal.save(start.ownerId,newState) // fsync + atomic rename BEFORE page acknowledgment
        state=newState
        return p
      },
      async finish(args){
        verifyCurrent()
        const response=await server.finish(args)
        verifyCurrent()
        return response
      }
    }
    try {
      const result=await createC39Reader({provider:wrapped,pageSize,maxRows}).read({
        ownerId:start.ownerId,
        resume:{identity:{ownerId:m.ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,counts:m.counts,digest:m.digest},
          rows:duplicate(state.rows)}
      })
      verifyCurrent()
      journal.clear(start.ownerId)
      return result
    }catch(e){
      if(e.code!=='NETWORK_INTERRUPTED')journal.clear(start.ownerId)
      throw e
    }
  }
  return {read,invalidate:ownerId=>journal.clear(ownerId)}
}
