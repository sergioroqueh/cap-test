// C41 isolated browser-only IndexedDB journal fixture. NO production imports or secrets.
// All records, accounts and digests used by its tests are synthetic.
const STREAMS = ['events', 'sessions']
const fail = code => { const e = Error(code); e.code = code; throw e }
const isText = x => typeof x === 'string' && x.length > 0
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const hex64 = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)
const clone = x => structuredClone(x)
const streamId = s => s === 'events' ? 'eventId' : 'clientId'
const enc = new TextEncoder()

export function canonical(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (isObj(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  fail('CANONICAL_INVALID')
}
export async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', enc.encode(canonical(value)))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function checkManifest(m, owner) {
  if (!isObj(m) || m.ownerId !== owner || !isText(owner) || !isText(m.snapshotId) ||
    !isText(m.checkpoint) || !hex64(m.digest) || !isObj(m.counts) ||
    !STREAMS.every(s => Number.isSafeInteger(m.counts[s]) && m.counts[s] >= 0)) fail('MANIFEST_INVALID')
}
const identity = m => ({ownerId:m.ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,counts:m.counts,digest:m.digest})
const same = (a,b) => canonical(a) === canonical(b)

function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2)
    req.onupgradeneeded = e => {
      const db = req.result
      if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', {keyPath:'ownerId'})
      if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases', {keyPath:'ownerId'})
      // Legacy v1 fixture did not bind a journal to an authenticated generation.
      // Fail closed by discarding it, never interpreting v1 records as verified.
      if (e.oldVersion === 1) req.transaction.objectStore('jobs').clear()
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(Error('DB_UPGRADE_BLOCKED'))
  })
}
function transact(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let tx, value, failure
    try { tx = db.transaction(stores, mode) } catch (e) { reject(e); return }
    const stop = code => {
      failure = Error(code); failure.code = code
      try { tx.abort() } catch { /* transaction may already have ended */ }
    }
    const set = v => { value = v }
    tx.oncomplete = () => resolve(value)
    tx.onabort = () => reject(failure || Object.assign(Error(tx.error?.name || 'IDB_ABORT'), {
      code: tx.error?.name === 'QuotaExceededError' ? 'IDB_QUOTA_EXCEEDED' : 'IDB_ABORT'
    }))
    tx.onerror = () => { /* allow abort event to preserve native quota information */ }
    try { action(tx, set, stop) } catch (e) { failure = e; tx.abort() }
  })
}

export function createC41Journal({namespace, clock=()=>Date.now(), leaseMs=5000, maxBytes=100_000}={}) {
  if (!isText(namespace) || !/^[a-z0-9-]{1,60}$/.test(namespace) ||
    !Number.isSafeInteger(leaseMs) || leaseMs < 1 ||
    !Number.isSafeInteger(maxBytes) || maxBytes < 1) fail('CONFIG_INVALID')
  const name = 'rutacap-c41-fixture-' + namespace
  const holder = crypto.randomUUID()
  let dbPromise = openDb(name)
  const db = () => dbPromise
  const now = () => clock()
  const expired = m => m.expiresAt !== undefined && (!Number.isSafeInteger(m.expiresAt) || m.expiresAt <= now())
  const enforce = (job, owner, sessionId, m) => {
    if (!job || job.ownerId !== owner || job.sessionId !== sessionId ||
      !same(job.identity, identity(m))) fail('RESUME_MISMATCH')
  }
  const acquire = async ({ownerId,sessionId,manifest}={}) => {
    checkManifest(manifest, ownerId)
    if (!isText(sessionId)) fail('SESSION_INVALID')
    if (expired(manifest)) fail('SNAPSHOT_EXPIRED')
    const conn = await db()
    const result = await transact(conn, ['jobs','leases'], 'readwrite', (tx,set,stop) => {
      const leaseStore = tx.objectStore('leases'), jobStore = tx.objectStore('jobs')
      const lreq = leaseStore.get(ownerId)
      lreq.onsuccess = () => {
        const current=lreq.result
        if (current && current.until > now() && current.holder !== holder) { stop('LEASE_HELD'); return }
        const jreq=jobStore.get(ownerId)
        jreq.onsuccess=()=>{
          const old = jreq.result
          if (old && (old.sessionId !== sessionId || !same(old.identity,identity(manifest)))) {
            jobStore.delete(ownerId); leaseStore.delete(ownerId)
            set({error:'RESUME_MISMATCH'})
            return
          }
          const lease={ownerId,holder,fencing:(current?.fencing||0)+1,until:now()+leaseMs}
          leaseStore.put(lease)
          if (!old) jobStore.put({ownerId,sessionId,identity:clone(identity(manifest)),
            rows:{events:[],sessions:[]},revision:0,finished:false})
          set({fencing:lease.fencing,resumed:Boolean(old)})
        }
      }
    })
    if (result?.error) fail(result.error)
    return result
  }
  const read = async ({ownerId,sessionId,manifest}={}) => {
    checkManifest(manifest, ownerId)
    if (expired(manifest)) fail('SNAPSHOT_EXPIRED')
    const conn=await db()
    const job=await transact(conn,['jobs'],'readonly',(tx,set)=>{
      tx.objectStore('jobs').get(ownerId).onsuccess=e=>set(e.target.result)
    })
    enforce(job,ownerId,sessionId,manifest)
    return clone(job)
  }
  const append = async ({ownerId,sessionId,manifest,fencing,stream,offset,items,signal}={}) => {
    checkManifest(manifest,ownerId)
    if(expired(manifest))fail('SNAPSHOT_EXPIRED')
    if(signal?.aborted)fail('CANCELLED')
    if(!STREAMS.includes(stream)||!Number.isSafeInteger(offset)||offset<0||
      !Array.isArray(items)||items.length<1||items.length>50)fail('PAGE_INVALID')
    const conn=await db()
    return transact(conn,['jobs','leases'],'readwrite',(tx,set,stop)=>{
      const lreq=tx.objectStore('leases').get(ownerId)
      lreq.onsuccess=()=>{
        const lease=lreq.result
        if (!lease||lease.holder!==holder||lease.fencing!==fencing||lease.until<=now()) {
          stop('LEASE_INVALID');return
        }
        const jreq=tx.objectStore('jobs').get(ownerId)
        jreq.onsuccess=()=>{
          const j=jreq.result
          if(!j||j.sessionId!==sessionId||!same(j.identity,identity(manifest))) {
            stop('RESUME_MISMATCH');return
          }
          if(j.finished){stop('ALREADY_FINISHED');return}
          if(signal?.aborted){stop('CANCELLED');return}
          const previous=j.rows[stream]
          if(offset!==previous.length||offset+items.length>manifest.counts[stream]){
            stop('PAGE_INVALID');return
          }
          const keys=new Set(previous.map(r=>r?.[streamId(stream)]))
          for(const item of items) {
            const key=item?.[streamId(stream)]
            if(!isText(key)||keys.has(key)){stop('KEY_INVALID');return}
            keys.add(key)
          }
          const next=clone(j)
          next.rows[stream].push(...clone(items));next.revision++
          if(enc.encode(JSON.stringify(next)).byteLength>maxBytes){
            stop('STORAGE_QUOTA');return
          }
          tx.objectStore('jobs').put(next)
          set({revision:next.revision,offset:next.rows[stream].length})
        }
      }
    })
  }
  const finish = async ({ownerId,sessionId,manifest,fencing}={}) => {
    const job=await read({ownerId,sessionId,manifest})
    if(!STREAMS.every(s=>job.rows[s].length===manifest.counts[s]))fail('INCOMPLETE')
    const rows=STREAMS.flatMap(s=>job.rows[s].map((item,i)=>({stream:s,ordinal:i+1,item})))
    const digest=await sha256({ownerId,snapshotId:manifest.snapshotId,checkpoint:manifest.checkpoint,rows})
    if(digest!==manifest.digest)fail('DIGEST_MISMATCH')
    const conn=await db()
    return transact(conn,['jobs','leases'],'readwrite',(tx,set,stop)=>{
      tx.objectStore('leases').get(ownerId).onsuccess=e=>{
        const l=e.target.result
        if(!l||l.holder!==holder||l.fencing!==fencing||l.until<=now()) {
          stop('LEASE_INVALID');return
        }
        tx.objectStore('jobs').get(ownerId).onsuccess=e2=>{
          const current=e2.target.result
          if(!current||current.revision!==job.revision||!same(current.identity,identity(manifest))||
            current.sessionId!==sessionId){stop('REVISION_CHANGED');return}
          current.finished=true
          tx.objectStore('jobs').put(current)
          set({finished:true,digest})
        }
      }
    })
  }
  const logout = async ({ownerId,sessionId}={}) => {
    if(!isText(ownerId)||!isText(sessionId))fail('AUTH_REQUIRED')
    const conn=await db()
    return transact(conn,['jobs','leases'],'readwrite',(tx,set,stop)=>{
      tx.objectStore('jobs').get(ownerId).onsuccess=e=>{
        const job=e.target.result
        if(job&&job.sessionId!==sessionId){stop('ACCOUNT_CHANGED');return}
        tx.objectStore('jobs').delete(ownerId)
        tx.objectStore('leases').delete(ownerId)
        set(true)
      }
    })
  }
  const close=async()=>{(await db()).close()}
  return {name,acquire,read,append,finish,logout,close}
}
