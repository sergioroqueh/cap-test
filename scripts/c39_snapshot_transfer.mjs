// C39 mock-only complete snapshot transfer draft. Never imported by production UI.
// No URL, fetch, Supabase client or real cloud transport.
import {createHash} from 'node:crypto'

export const canonical = value => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('NON_FINITE')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
  throw Error('UNSUPPORTED_VALUE')
}
export const sha256 = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex')
const streamOrder=['events','sessions']
const die=(code)=>{const e=Error(code);e.code=code;throw e}
const requireString=(v)=>typeof v==='string'&&v.length>0
const requireHex=(v)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const identity=(m)=>({ownerId:m.ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,counts:m.counts,digest:m.digest})
export function fixtureProvider({ownerId,streams,checkpoint='checkpoint-c39',snapshotId='snapshot-c39',mutatePage,mutateFinish,failAt}={}) {
  if(!requireString(ownerId)||!streams||!streamOrder.every(s=>Array.isArray(streams[s])))die('FIXTURE_INVALID')
  const pinned=Object.fromEntries(streamOrder.map(s=>[s,structuredClone(streams[s])]))
  const counts=Object.fromEntries(streamOrder.map(s=>[s,pinned[s].length]))
  const fullRows=streamOrder.flatMap(s=>pinned[s].map((item,i)=>({stream:s,ordinal:i+1,item})))
  const digest=sha256({ownerId,snapshotId,checkpoint,rows:fullRows})
  let calls=0,finished=0
  const manifest={ownerId,snapshotId,checkpoint,counts,digest}
  const provider={
    fixtureOnly:true,
    async begin(){return structuredClone(manifest)},
    async page({stream,offset,limit}){
      calls++
      if(failAt?.({stream,offset,calls}))die('NETWORK_INTERRUPTED')
      const p={...identity(manifest),stream,offset,total:counts[stream],items:structuredClone(pinned[stream].slice(offset,offset+limit))}
      return mutatePage?.(p)??p
    },
    async finish(){
      finished++
      const f={...identity(manifest),committed:true}
      return mutateFinish?.(f)??f
    }
  }
  return {provider,manifest,stats:()=>({calls,finished})}
}
export function createC39Reader({provider,pageSize=2,maxRows=10000}={}) {
  if(!provider?.fixtureOnly||typeof provider.begin!=='function'||typeof provider.page!=='function'||typeof provider.finish!=='function')die('MOCK_ONLY')
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>50||!Number.isInteger(maxRows)||maxRows<1)die('BOUNDS_INVALID')
  const read=async({ownerId,resume}={})=>{
    if(!requireString(ownerId))die('OWNER_INVALID')
    const m=await provider.begin()
    if(m.ownerId!==ownerId||!requireString(m.snapshotId)||!requireString(m.checkpoint)||!requireHex(m.digest))die('MANIFEST_INVALID')
    if(!streamOrder.every(s=>Number.isSafeInteger(m.counts?.[s])&&m.counts[s]>=0))die('MANIFEST_INVALID')
    if(streamOrder.reduce((n,s)=>n+m.counts[s],0)>maxRows)die('MANIFEST_INVALID')
    const initial=resume??{identity:identity(m),rows:{events:[],sessions:[]}}
    if(canonical(initial.identity)!==canonical(identity(m)))die('RESUME_MISMATCH')
    if(!streamOrder.every(s=>Array.isArray(initial.rows?.[s])&&initial.rows[s].length<=m.counts[s]))die('RESUME_INVALID')
    const collected=structuredClone(initial.rows)
    const immutableKeys=new Set()
    for(const s of streamOrder)for(let i=0;i<collected[s].length;i++){
      const key=collected[s][i]?.[s==='events'?'eventId':'clientId']
      if(!requireString(key)||immutableKeys.has(s+':'+key))die('RESUME_INVALID')
      immutableKeys.add(s+':'+key)
    }
    for(const stream of streamOrder){
      while(collected[stream].length<m.counts[stream]){
        const offset=collected[stream].length
        let p
        try {p=await provider.page({ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,stream,offset,limit:pageSize})}
        catch(e){
          if(e?.code==='NETWORK_INTERRUPTED') {
            const x=Error('NETWORK_INTERRUPTED');x.code='NETWORK_INTERRUPTED'
            x.resume={identity:identity(m),rows:structuredClone(collected)}
            throw x
          }
          throw e
        }
        if(!p||p.ownerId!==ownerId||p.snapshotId!==m.snapshotId||p.checkpoint!==m.checkpoint||p.digest!==m.digest||p.stream!==stream||p.offset!==offset||p.total!==m.counts[stream]||!Array.isArray(p.items)||p.items.length===0||p.items.length>pageSize||offset+p.items.length>m.counts[stream])die('PAGE_INVALID')
        for(const item of p.items){
          const key=item?.[stream==='events'?'eventId':'clientId']
          if(!requireString(key)||immutableKeys.has(stream+':'+key))die('KEY_INVALID')
          immutableKeys.add(stream+':'+key)
          collected[stream].push(structuredClone(item))
        }
      }
    }
    const fullRows=streamOrder.flatMap(s=>collected[s].map((item,i)=>({stream:s,ordinal:i+1,item})))
    if(sha256({ownerId,m:snapshotPlaceholder(m),rows:[]})==='unused')die('UNREACHABLE')
    const digest=sha256({ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,rows:fullRows})
    if(digest!==m.digest)die('DIGEST_MISMATCH')
    const f=await provider.finish({ownerId,snapshotId:m.snapshotId,checkpoint:m.checkpoint,digest,counts:m.counts})
    if(!f?.committed||f.ownerId!==ownerId||f.snapshotId!==m.snapshotId||f.checkpoint!==m.checkpoint||f.digest!==m.digest||canonical(f.counts)!==canonical(m.counts))die('FINISH_INVALID')
    return {manifest:structuredClone(m),rows:collected}
  }
  return {read}
}
function snapshotPlaceholder(m){return m.snapshotId}
