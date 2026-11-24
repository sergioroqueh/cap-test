// R92: transactional RPC only; generation-pinned pagination, fail closed.
export function createCommercialSyncTransport({enabled=false,expectedUserId,verifyIdentity,ownerCurrent,request,validateRecords}={}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const fail = code => { throw new Error('R92_'+code) }
  const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ?
    Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,canonical(x[k])])) : x
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
  const cap=100000,byteCap=64*1024*1024
  const bytes=x=>{let n=0;for(const c of JSON.stringify(x)){const v=c.codePointAt(0);n+=v<128?1:v<2048?2:v<65536?3:4}return n}
  const validGeneration=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(x)&&BigInt(x)<=9223372036854775807n
  const args=()=>({p_revision:pinnedRevision,p_session:pinnedSession})
  let pinnedSession=null,pinnedRevision=null,closed=false
  const check=()=>{if(!enabled||closed||!uuid.test(expectedUserId||'')||ownerCurrent?.()!==true) fail('SCOPE_DENIED')}
  async function identity(){
    check()
    const i=await verifyIdentity()
    check()
    if(i?.verified!==true||i.isAnonymous!==false||i.userId!==expectedUserId||
       !uuid.test(i.sessionId||'')||typeof i.accessToken!=='string'||!i.accessToken) fail('IDENTITY_DENIED')
    if(pinnedSession!==null&&pinnedSession!==i.sessionId) fail('SESSION_CHANGED')
    pinnedSession=i.sessionId
    return i
  }
  async function send(path,method='GET',body){
    const i=await identity()
    const result=await request({path,method,body,accessToken:i.accessToken})
    await identity()
    return result
  }
  async function consent(){
    const rows=await send('rc_sync_consents?select=user_id,purpose,notice_version,granted,revision,revoked_at&user_id=eq.'+expectedUserId+'&purpose=eq.progress-sync')
    const c=Array.isArray(rows)&&rows.length===1?rows[0]:null
    if(!c||c.user_id!==expectedUserId||c.purpose!=='progress-sync'||c.notice_version!=='progress-sync-v1'||
       c.granted!==true||c.revoked_at!==null||!Number.isSafeInteger(c.revision)||c.revision<1) fail('CONSENT_DENIED')
    if(pinnedRevision!==null&&pinnedRevision!==c.revision) fail('CONSENT_CHANGED')
    pinnedRevision=c.revision
    return c
  }
  function records(value){
    if(!value||!Array.isArray(value.events)||!Array.isArray(value.sessions)||
       value.events.length>cap||value.sessions.length>cap||
       value.sessions.some(s=>!s||s.id!==undefined)) fail('RECORDS_INVALID')
    if(bytes(value)>byteCap) fail('SNAPSHOT_BUDGET')
    const validated=validateRecords(value)
    if(!validated||!Array.isArray(validated.events)||!Array.isArray(validated.sessions)) fail('VALIDATOR_INVALID')
    return validated
  }
  async function snapshot(userId){
    check()
    if(userId!==expectedUserId) fail('OWNER_MISMATCH')
    await consent()
    for(let attempt=0;attempt<3;attempt++){
      let generation=null,totalBytes=0,changed=false
      const result={events:[],sessions:[]}
      for(const kind of ['events','sessions']){
        let cursor=null
        const seen=new Set(),key=kind==='events'?'eventId':'clientId',limit=kind==='events'?100:4
        do{
          const page=await send('rpc/rc_sync_page_v1','POST',{...args(),p_generation:generation,p_kind:kind,p_after:cursor,p_limit:limit})
          if(page?.status==='changed'){changed=true;break}
          if(!page||page.status!=='ok'||page.schemaVersion!==2||page.userId!==expectedUserId||page.kind!==kind||!validGeneration(page.generation)||!Array.isArray(page.records)||page.records.length>limit)fail('SNAPSHOT_DENIED')
          if(generation!==null&&page.generation!==generation)fail('GENERATION_MISMATCH')
          generation=page.generation
          for(const row of page.records){
            if(!row||typeof row[key]!=='string'||!row[key]||row[key].length>200||seen.has(row[key]))fail('CURSOR_INVALID')
            seen.add(row[key]);result[kind].push(row);totalBytes+=bytes(row)
            if(result[kind].length>cap||totalBytes>byteCap)fail('SNAPSHOT_BUDGET')
          }
          const next=page.nextCursor
          if(next!==null&&(typeof next!=='string'||next===cursor||page.records.length!==limit||page.records[page.records.length-1]?.[key]!==next))fail('CURSOR_INVALID')
          cursor=next
        }while(cursor!==null)
        if(changed)break
      }
      await consent()
      if(!changed)return {generation,data:records(result)}
    }
    fail('SNAPSHOT_BUSY')
  }
  async function pull(userId){return (await snapshot(userId)).data}
  function missing(wanted,existing,key){
    const map=new Map(existing.map(r=>[r[key],r]))
    return wanted.filter(r=>{
      if(!map.has(r[key])) return true
      if(!equal(r,map.get(r[key]))) fail('RECORD_COLLISION')
      return false
    })
  }
  async function insertMissing(userId,input){
    check()
    if(userId!==expectedUserId) fail('OWNER_MISMATCH')
    const wanted=records(input)
    const before=await snapshot(userId)
    const e=missing(wanted.events,before.data.events,'eventId')
    const s=missing(wanted.sessions,before.data.sessions,'clientId')
    records({events:[...before.data.events,...e],sessions:[...before.data.sessions,...s]})
    let generation=before.generation
    const time=n=>Number.isSafeInteger(n)&&n>=0&&n<=253402300799999
    if(e.some(r=>!time(r.occurredAt))||s.some(r=>!time(r.completedAt)))fail('TIME_INVALID')
    let i=0,j=0
    while(i<e.length||j<s.length){
      const events=e.slice(i,i+25),sessions=s.slice(j,j+4)
      await consent()
      const reply=await send('rpc/rc_sync_ingest_v1','POST',{...args(),p_generation:generation,p_events:events,p_sessions:sessions})
      if(reply?.status==='changed')fail('WRITE_STALE')
      if(!reply||reply.status!=='ok'||reply.userId!==expectedUserId||!validGeneration(reply.generation)||!Number.isSafeInteger(reply.inserted)||reply.inserted<0||reply.inserted>events.length+sessions.length||BigInt(reply.generation)!==BigInt(generation)+BigInt(reply.inserted>0))fail('WRITE_NOT_CONFIRMED')
      generation=reply.generation;i+=events.length;j+=sessions.length
      await consent()
    }
    const after=await snapshot(userId)
    if(missing(wanted.events,after.data.events,'eventId').length||missing(wanted.sessions,after.data.sessions,'clientId').length) fail('WRITE_NOT_CONFIRMED')
  }
  return {pull,insertMissing,async verifiedIdentity(){
    await consent()
    return {verified:true,isAnonymous:false,consented:true,userId:expectedUserId}
  },close(){closed=true}}
}

export function createCommercialPostgrestRequest({publishableKey,fetchImpl}={}){
  const origin='https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/'
  if(typeof publishableKey!=='string'||!publishableKey.startsWith('sb_publishable_')||typeof fetchImpl!=='function')
    throw new Error('R92_CONFIG_DENIED')
  return async ({path,method,body,accessToken})=>{
    const read=method==='GET'&&/^rc_sync_consents\?select=[a-z_,]+(?:&user_id=eq\.[0-9a-f-]{36}&purpose=eq\.progress-sync)?$/.test(path)
    const rpc=method==='POST'&&['rpc/rc_sync_page_v1','rpc/rc_sync_ingest_v1'].includes(path)
    if(!(read||rpc)||typeof accessToken!=='string'||!accessToken)throw Error('R92_REQUEST_DENIED')
    const response=await fetchImpl(origin+path,{
      method,headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,
        'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      cache:'no-store',redirect:'error',credentials:'omit'
    })
    if(!response.ok) throw new Error('R92_REMOTE_'+response.status)
    return response.json()
  }
}
