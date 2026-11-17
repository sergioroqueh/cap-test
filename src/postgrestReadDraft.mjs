// C32 MOCK-ONLY PostgREST draft. No runtime import by the UI.
// A mandatory .invalid origin and injected fetch prevent live cloud access.
import {unionRecords,replayProgress} from './syncCore.mjs'
const ORIGIN='https://rutacap-fixture.invalid'
const TABLES=[
  {name:'rc_progress_events',key:'event_id',payloadKey:'eventId'},
  {name:'rc_study_sessions',key:'session_key',payloadKey:'clientId'}
]
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class PostgrestReadDraftError extends Error{
  constructor(code,message){super(message);this.name='PostgrestReadDraftError';this.code=code}
}
const fail=(code,message)=>{throw new PostgrestReadDraftError(code,message)}
const validKey=x=>typeof x==='string'&&x.length>0&&x.length<=200
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
export function createPostgrestReadDraft({
  enabled=false,origin=ORIGIN,lease,fetchImpl,getAccessToken,pageSize=200,maxRows=20000
}={}){
  if(origin!==ORIGIN)fail('LIVE_ORIGIN_BLOCKED','Fixture .invalid origin only')
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500||
     !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>50000)
    fail('BOUNDS_INVALID','Page/row bounds invalid')
  async function readTable(table){
    const rows=[],seen=new Set()
    let expectedTotal=null
    for(let offset=0;;offset+=pageSize){
      // Recheck verified JWT identity before and after EACH page.
      const page=await lease.execute(async({userId,signal})=>{
        if(!uuid.test(userId))fail('OWNER_INVALID','Bad authenticated owner')
        if(typeof fetchImpl!=='function'||typeof getAccessToken!=='function')
          fail('ADAPTER_MISSING','A mock transport and token provider are mandatory')
        const jwt=await getAccessToken({userId,signal})
        if(typeof jwt!=='string'||jwt.length<12||jwt.length>8192||
           !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))
          fail('TOKEN_INVALID','Missing JWT-shaped token')
        if(signal.aborted)fail('CANCELLED','Lease revoked before GET')
        const url=new URL('/rest/v1/'+table.name,ORIGIN)
        url.searchParams.set('select','user_id,'+table.key+',payload')
        url.searchParams.set('user_id','eq.'+userId)
        url.searchParams.set('order',table.key+'.asc')
        const start=offset,end=offset+pageSize-1
        const response=await fetchImpl(url.toString(),{
          method:'GET',redirect:'error',credentials:'omit',mode:'cors',signal,
          headers:{
            Accept:'application/json',
            apikey:'sb_publishable_fixture_only',
            Authorization:'Bearer '+jwt,
            'Range-Unit':'items',
            Range:start+'-'+end,
            Prefer:'count=exact',
            'Cache-Control':'no-store'
          }
        })
        if(signal.aborted)fail('CANCELLED','Lease revoked during GET')
        if(!response||![200,206].includes(response.status)||response.redirected===true)
          fail('HTTP_ERROR','GET rejected or redirected')
        const header=response.headers?.get('Content-Range')
        if(typeof header!=='string')fail('RANGE_MISSING','Exact Content-Range required')
        if(header==='*/0'){
          if(offset!==0)fail('RANGE_INVALID','Unexpected empty page')
          return {userId,items:[],start:0,total:0}
        }
        const match=/^(\d+)-(\d+)\/(\d+)$/.exec(header)
        if(!match)fail('RANGE_INVALID','Invalid/wildcard Content-Range')
        const from=Number(match[1]),to=Number(match[2]),total=Number(match[3])
        if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
           !Number.isSafeInteger(total)||from!==start||to<from||to>=total||
           to>=start+pageSize||total>maxRows)
          fail('RANGE_INVALID','Unstable or oversized page')
        const items=await response.json()
        if(!Array.isArray(items)||items.length!==to-from+1)
          fail('PAGE_INCOMPLETE','Payload size differs from Content-Range')
        for(const item of items){
          if(!obj(item)||item.user_id!==userId||
             !validKey(item[table.key])||!obj(item.payload)||
             item.payload[table.payloadKey]!==item[table.key])
            fail('ROW_INVALID','Owner, key or payload mismatch')
        }
        return {items,start:from,total}
      })
      if(expectedTotal===null)expectedTotal=page.total
      if(expectedTotal!==page.total||offset!==page.start)
        fail('SNAPSHOT_CHANGED','Page total or offset changed')
      for(const item of page.items){
        if(seen.has(item[table.key]))fail('DUPLICATE_KEY','Duplicate immutable key')
        seen.add(item[table.key])
        rows.push(item.payload)
      }
      if(rows.length>maxRows)fail('ROW_LIMIT','Too many rows')
      if(rows.length===expectedTotal)break
      if(page.items.length!==pageSize)
        fail('PAGE_INCOMPLETE','Missing items before last page')
    }
    return rows
  }
  return {
    async readOwnerSnapshot(){
      if(!enabled)fail('CLOUD_OFF','This draft is disabled by default')
      if(!lease||typeof lease.execute!=='function')
        fail('LEASE_MISSING','Require per-request verified account lease')
      const events=await readTable(TABLES[0]),sessions=await readTable(TABLES[1])
      const validated=unionRecords({events:[],sessions:[]},{events,sessions})
      replayProgress(validated.events)
      return validated
    }
  }
}
