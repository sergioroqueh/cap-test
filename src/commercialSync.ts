// R91: explicit, unmounted coordinator for the commercial schema.
// Not imported by App. No legacy cloud adapter, no automatic sync.
// A future release must approve the write/consent transaction and real A/B tests.
import { authConfigured, getSession, supabase } from './supabase'
import { localBackupOwner, localOwnerGeneration, onLocalOwnerChanged } from './localScope'
import { createLocalSyncAdapter } from './localSyncAdapter'
import { unionRecords, replayProgress } from './syncCore.mjs'
import { createCommercialPostgrestRequest, createCommercialSyncTransport } from './commercialSyncTransport.mjs'
import type { LocalSyncRecords } from './localSyncAdapter'

const PROJECT_ISSUER = 'https://rhtbqetskghkarxhrgee.supabase.co/auth/v1'
const RELEASE_APPROVED = false // Deliberately closed; not a Vite flag.
export const commercialSyncApproved=RELEASE_APPROVED
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
let busy = false

function validateRecords(input:LocalSyncRecords):LocalSyncRecords {
  const normalized = unionRecords({events:[],sessions:[]},input)
  replayProgress(normalized.events)
  return normalized
}

export async function commercialConsent(action:'status'|'grant'|'revoke'):Promise<{granted:boolean;revision:number|null}>{
  if(!RELEASE_APPROVED||!authConfigured||!supabase)throw Error('R91_SYNC_DISABLED')
  if(busy)throw Error('R91_SYNC_BUSY')
  const client=supabase,owner=localBackupOwner(),generation=localOwnerGeneration()
  if(owner.kind!=='user')throw Error('R91_SCOPE_DENIED')
  const userId=owner.userId
  const current=()=>localOwnerGeneration()===generation
  busy=true
  try{
    const session=await getSession()
    if(!current()||!session||session.user.id!==userId||session.user.is_anonymous!==false||!session.user.email_confirmed_at)throw Error('R91_IDENTITY_DENIED')
    const token=session.access_token
    const claims=await client.auth.getClaims(token),c=claims.data?.claims
    if(claims.error||!c||c.sub!==userId||c.iss!==PROJECT_ISSUER||c.role!=='authenticated'||c.is_anonymous!==false||
      typeof c.session_id!=='string'||!uuid.test(c.session_id)||typeof c.exp!=='number'||c.exp<=Date.now()/1000||!current())throw Error('R91_IDENTITY_DENIED')
    const sessionId=c.session_id
    const check=async()=>{
      const fresh=await client.auth.getSession()
      if(fresh.error||fresh.data.session?.access_token!==token||!current())throw Error('R91_SESSION_CHANGED')
    }
    await check()
    const response=await fetch('https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/rpc/rc_sync_consent_session_v1',{
      method:'POST',headers:{apikey:import.meta.env.VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY?.trim()||'',Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({p_action:action,p_session:sessionId}),cache:'no-store',redirect:'error',credentials:'omit'
    })
    if(!response.ok)throw Error('R98_CONSENT_FAILED')
    const result=await response.json()
    await check()
    if(result?.userId!==userId||result.noticeVersion!=='progress-sync-v1'||typeof result.granted!=='boolean'||
       (result.revision!==null&&(!Number.isSafeInteger(result.revision)||result.revision<1))||
       (result.granted&&result.revision===null)|| (action==='grant'&&!result.granted)||(action==='revoke'&&result.granted))throw Error('R98_CONSENT_INVALID')
    return {granted:result.granted,revision:result.revision}
  }finally{busy=false}
}

export async function synchronizeCommercialAccount():Promise<{events:number;sessions:number}> {
  if (!RELEASE_APPROVED || !authConfigured || !supabase) throw Error('R91_SYNC_DISABLED')
  if (busy) throw Error('R91_SYNC_BUSY')
  const client = supabase
  const owner = localBackupOwner()
  if (owner.kind !== 'user' || !uuid.test(owner.userId)) throw Error('R91_SCOPE_DENIED')
  const userId = owner.userId, generation = localOwnerGeneration()
  let cancelled = false
  const ownerCurrent = () => {
    const active = localBackupOwner()
    return !cancelled && localOwnerGeneration() === generation &&
      active.kind === 'user' && active.userId === userId
  }
  const unsubscribe = onLocalOwnerChanged(() => { cancelled = true })
  const {data:{subscription}} = client.auth.onAuthStateChange((event, session) => {
    // Do not await another Auth call inside this callback.
    if (event === 'SIGNED_OUT' || !session || session.user.id !== userId) cancelled = true
  })
  busy = true
  let transport:ReturnType<typeof createCommercialSyncTransport>|undefined
  try {
    transport = createCommercialSyncTransport({
      enabled:true,expectedUserId:userId,ownerCurrent,validateRecords,
      request:createCommercialPostgrestRequest({
        publishableKey:import.meta.env.VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY?.trim() || '',
        fetchImpl:fetch.bind(globalThis)
      }),
      async verifyIdentity(){
        if (!ownerCurrent()) throw Error('R91_SCOPE_DENIED')
        const session = await getSession()
        if (!session || session.user.id !== userId || session.user.is_anonymous !== false)
          throw Error('R91_IDENTITY_DENIED')
        const token = session.access_token
        const claimsResult = await client.auth.getClaims(token)
        const c = claimsResult.data?.claims
        if (claimsResult.error || !c || c.sub !== userId || c.iss !== PROJECT_ISSUER ||
            c.role !== 'authenticated' || c.is_anonymous !== false ||
            typeof c.session_id !== 'string' || !uuid.test(c.session_id) ||
            typeof c.exp !== 'number' || c.exp <= Date.now()/1000 ||
            !ownerCurrent()) throw Error('R91_IDENTITY_DENIED')
        const fresh = await client.auth.getSession()
        if (fresh.error || fresh.data.session?.user.id !== userId ||
            fresh.data.session?.access_token !== token || !ownerCurrent())
          throw Error('R91_SESSION_CHANGED')
        return {verified:true,isAnonymous:false,userId,sessionId:c.session_id,accessToken:token}
      }
    })
    const remote = transport
    const local = createLocalSyncAdapter({
      enabled:true,expectedUserId:userId,getVerifiedIdentity:()=>remote.verifiedIdentity()
    })
    await local.ensureSessionIds()
    const before = await local.snapshot()
    const upstream = await remote.pull(userId)
    const combined = validateRecords(unionRecords(before,upstream))
    // Keep full history. No destructive replacement and no aggregate summing.
    await local.merge(combined)
    await remote.insertMissing(userId,combined)
    const final = validateRecords(unionRecords(await local.snapshot(),await remote.pull(userId)))
    await local.merge(final)
    await remote.verifiedIdentity()
    if (!ownerCurrent()) throw Error('R91_SCOPE_DENIED')
    return {events:final.events.length,sessions:final.sessions.length}
  } finally {
    transport?.close()
    subscription.unsubscribe()
    unsubscribe()
    busy = false
  }
}
