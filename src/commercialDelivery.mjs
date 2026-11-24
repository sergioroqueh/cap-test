// R93: protected delivery client, not mounted in App. No static fallback.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ID=/^[A-Za-z0-9_.:-]{1,200}$/
const REV=/^[A-Za-z0-9_.:-]{1,100}$/
const CAPS={guest:[25,1],free:[100,3],premium:[null,null]}
const fail=code=>{throw Error('R93_'+code)}
export function createDeliveryRequest({publishableKey,fetchImpl}={}){
  if(typeof publishableKey!=='string'||!publishableKey.startsWith('sb_publishable_')||typeof fetchImpl!=='function')fail('CONFIG_DENIED')
  return async ({accessToken,kind,contentId,requestId})=>{
    if(!accessToken||!['question','exam'].includes(kind)||!ID.test(contentId)||!UUID.test(requestId))fail('REQUEST_INVALID')
    const response=await fetchImpl('https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/rpc/rc_deliver_v1',{
      method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({p_kind:kind,p_content_id:contentId,p_request_id:requestId}),
      cache:'no-store',redirect:'error',credentials:'omit'
    })
    if(!response.ok)fail('REMOTE_'+response.status)
    return response.json()
  }
}
export function createDeliveryClient({enabled=false,expectedUserId,expectedAnonymous,ownerCurrent,verifyIdentity,request}={}){
  let pinnedSession=null,closed=false
  async function identity(){
    if(!enabled||closed||!UUID.test(expectedUserId||'')||typeof expectedAnonymous!=='boolean'||ownerCurrent?.()!==true)fail('SCOPE_DENIED')
    const i=await verifyIdentity()
    if(closed||ownerCurrent?.()!==true||i?.verified!==true||i.userId!==expectedUserId||
       i.isAnonymous!==expectedAnonymous||!UUID.test(i.sessionId||'')||typeof i.accessToken!=='string'||!i.accessToken)fail('IDENTITY_DENIED')
    if(pinnedSession!==null&&i.sessionId!==pinnedSession)fail('SESSION_CHANGED')
    pinnedSession=i.sessionId
    return i
  }
  async function deliver({kind,contentId,requestId}={}){
    if(!['question','exam'].includes(kind)||typeof contentId!=='string'||!ID.test(contentId)||typeof requestId!=='string'||!UUID.test(requestId))fail('REQUEST_INVALID')
    const i=await identity()
    const response=await request({accessToken:i.accessToken,kind,contentId,requestId})
    await identity()
    if(!response||typeof response!=='object')fail('RESPONSE_INVALID')
    if(response.status==='unavailable'){
      if('content' in response)fail('RESPONSE_INVALID')
      return {status:'unavailable'}
    }
    const tier=response.tier
    if(!Object.hasOwn(CAPS,tier)||expectedAnonymous!==(tier==='guest')||
       !['ok','quota_exhausted'].includes(response.status)||
       !/^\d{4}-\d{2}-\d{2}$/.test(response.day||'')||
       typeof response.resetAt!=='string'||!Number.isFinite(Date.parse(response.resetAt))||
       typeof response.replayed!=='boolean')fail('RESPONSE_INVALID')
    const cap=CAPS[tier]
    const remaining=[response.questionsRemaining,response.examsRemaining]
    if(remaining.some((v,k)=>cap[k]===null?v!==null:!Number.isSafeInteger(v)||v<0||v>cap[k]))fail('RESPONSE_INVALID')
    if(response.status==='quota_exhausted'){
      if('content' in response||tier==='premium'||response.replayed||remaining[kind==='question'?0:1]!==0)fail('RESPONSE_INVALID')
      return response
    }
    if(response.kind!==kind||response.contentId!==contentId||typeof response.revision!=='string'||!REV.test(response.revision)||
       !response.content||typeof response.content!=='object'||Array.isArray(response.content))fail('RESPONSE_INVALID')
    return response
  }
  return {deliver,close(){closed=true}}
}
