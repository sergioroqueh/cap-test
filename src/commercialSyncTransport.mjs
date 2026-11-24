// R91: opt-in, account-pinned transport. Not connected to App. No live calls in tests.
// Existing RLS protects ownership and active consent; revision changes are checked before/after requests.
// Direct inserts are not transactionally bound to revision: do not enable commercially until that boundary is resolved.
export function createCommercialSyncTransport({enabled=false,expectedUserId,verifyIdentity,ownerCurrent,request,validateRecords}={}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const fail = code => { throw new Error('R91_'+code) }
  const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ?
    Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,canonical(x[k])])) : x
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
  const cap=5000
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
  async function send(path,method='GET',body,prefer){
    const i=await identity()
    const result=await request({path,method,body,prefer,accessToken:i.accessToken})
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
    const validated=validateRecords(value)
    if(!validated||!Array.isArray(validated.events)||!Array.isArray(validated.sessions)) fail('VALIDATOR_INVALID')
    return validated
  }
  async function pull(userId){
    check()
    if(userId!==expectedUserId) fail('OWNER_MISMATCH')
    await consent()
    const response=await send('rpc/rc_read_consistent_snapshot_v2','POST',{
      p_expected_consent_revision:pinnedRevision,p_expected_session_id:pinnedSession})
    await consent()
    if(!response||response.schemaVersion!==1||response.userId!==expectedUserId) fail('SNAPSHOT_DENIED')
    return records(response)
  }
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
    const before=await pull(userId)
    const e=missing(wanted.events,before.events,'eventId')
    const s=missing(wanted.sessions,before.sessions,'clientId')
    if(before.events.length+e.length>cap||before.sessions.length+s.length>cap) fail('SNAPSHOT_CAP')
    // Validate the combined history before any writes, not only matching IDs.
    validateRecords({events:[...before.events,...e],sessions:[...before.sessions,...s]})
    const stamp=n=>{
      if(!Number.isSafeInteger(n)||n<0||n>8640000000000000) fail('TIME_INVALID')
      return new Date(n).toISOString()
    }
    const erows=e.map(r=>({user_id:expectedUserId,event_id:r.eventId,question_id:r.questionId,payload:r,occurred_at:stamp(r.occurredAt)}))
    const srows=s.map(r=>({user_id:expectedUserId,session_key:r.clientId,payload:r,completed_at:stamp(r.completedAt)}))
    // Insert-only, retries safe. A racing conflict is detected by final readback.
    // No UPDATE, DELETE, aggregate overwrite or service_role.
    for(const [path,rows,size] of [
      ['rc_progress_events?on_conflict=user_id,event_id',erows,25],
      ['rc_study_sessions?on_conflict=user_id,session_key',srows,1]
    ]){
      for(let offset=0;offset<rows.length;offset+=size){
        await consent()
        await send(path,'POST',rows.slice(offset,offset+size),'resolution=ignore-duplicates,return=minimal')
        await consent()
      }
    }
    const after=await pull(userId)
    if(missing(wanted.events,after.events,'eventId').length||
       missing(wanted.sessions,after.sessions,'clientId').length) fail('WRITE_NOT_CONFIRMED')
  }
  return {pull,insertMissing,async verifiedIdentity(){
    await consent()
    return {verified:true,isAnonymous:false,consented:true,userId:expectedUserId}
  },close(){closed=true}}
}

export function createCommercialPostgrestRequest({publishableKey,fetchImpl}={}){
  const origin='https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/'
  if(typeof publishableKey!=='string'||!publishableKey.startsWith('sb_publishable_')||typeof fetchImpl!=='function')
    throw new Error('R91_CONFIG_DENIED')
  return async ({path,method,body,prefer,accessToken})=>{
    if(!/^(rc_sync_consents\?|rpc\/rc_read_consistent_snapshot_v2$|rc_progress_events\?|rc_study_sessions\?)/.test(path)||
       !['GET','POST'].includes(method)||typeof accessToken!=='string'||!accessToken)
      throw new Error('R91_REQUEST_DENIED')
    const response=await fetchImpl(origin+path,{
      method,headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,
        'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      cache:'no-store',redirect:'error',credentials:'omit'
    })
    if(!response.ok) throw new Error('R91_REMOTE_'+response.status)
    return response.status===204||method==='POST'&&prefer==='resolution=ignore-duplicates,return=minimal'?null:response.json()
  }
}
