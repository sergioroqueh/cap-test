import {createSelectionRequest} from './protectedSelection.mjs'
// R93: future delivery identity adapter. No import from App, no live signup,
// no change to the existing verified-account client or legacy cloud storage.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { authConfigured, supabase } from './supabase'
import { localBackupOwner, localOwnerGeneration } from './localScope'
import { createDeliveryClient, createDeliveryRequest } from './commercialDelivery.mjs'

const RELEASE_APPROVED = false
export const protectedDeliveryApproved=RELEASE_APPROVED
const PROJECT = 'https://rhtbqetskghkarxhrgee.supabase.co'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const key = import.meta.env.VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
let guestClient:SupabaseClient|null = null

function requireReady(){
  if(!RELEASE_APPROVED||!authConfigured||!supabase||!key.startsWith('sb_publishable_'))
    throw Error('R93_DELIVERY_DISABLED')
  return supabase
}
function guestAuth(){
  requireReady()
  // Separate storage prevents anonymous auth from appearing as an account,
  // entering password onboarding, or writing to another owner's IndexedDB.
  if(!guestClient)guestClient=createClient(PROJECT,key,{auth:{
    persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
    storageKey:'rutacap-quota-guest-v1'
  }})
  return guestClient
}
async function assertNoAccount(){
  const {data,error}=await requireReady().auth.getSession()
  if(error||data.session||localBackupOwner().kind!=='guest')throw Error('R93_GUEST_SCOPE_DENIED')
}
async function checkedIdentity(client:SupabaseClient,anonymous:boolean){
  const {data,error}=await client.auth.getSession()
  const session:Session|null=data.session
  if(error||!session)throw Error('R93_SESSION_REQUIRED')
  const token=session.access_token
  const user=await client.auth.getUser(token)
  const claims=await client.auth.getClaims(token)
  const c=claims.data?.claims
  if(user.error||claims.error||!user.data.user||!c||
     user.data.user.id!==session.user.id||user.data.user.is_anonymous!==anonymous||
     (!anonymous&&!user.data.user.email_confirmed_at)||
     c.sub!==session.user.id||c.iss!==PROJECT+'/auth/v1'||c.role!=='authenticated'||
     c.is_anonymous!==anonymous||typeof c.session_id!=='string'||!uuid.test(c.session_id)||
     typeof c.exp!=='number'||c.exp<=Date.now()/1000)throw Error('R93_IDENTITY_DENIED')
  const latest=await client.auth.getSession()
  if(latest.error||latest.data.session?.access_token!==token)throw Error('R93_SESSION_CHANGED')
  return {verified:true,userId:session.user.id,isAnonymous:anonymous,sessionId:c.session_id,accessToken:token}
}

export async function hasVerifiedGuestIdentity():Promise<boolean>{
  requireReady();await assertNoAccount()
  const client=guestAuth()
  const current=await client.auth.getSession()
  if(current.error)throw Error('R93_GUEST_SESSION_ERROR')
  if(!current.data.session)return false
  await checkedIdentity(client,true);await assertNoAccount()
  return true
}
// Explicit future action, never automatic on failure. CAPTCHA must be enforced
// in Supabase Auth itself, not just checked by this browser wrapper.
export async function provisionGuestIdentity(captchaToken:string):Promise<void>{
  requireReady()
  if(!navigator.locks)throw Error('R93_GUEST_LOCK_UNAVAILABLE')
  await navigator.locks.request('rutacap-quota-guest-provision-v1',async()=>{
    await assertNoAccount()
    const client=guestAuth()
    const current=await client.auth.getSession()
    if(current.error)throw Error('R93_GUEST_SESSION_ERROR')
    if(current.data.session){await checkedIdentity(client,true);return}
    if(typeof captchaToken!=='string'||!captchaToken.trim())throw Error('R93_CAPTCHA_REQUIRED')
    const result=await client.auth.signInAnonymously({options:{captchaToken}})
    if(result.error||!result.data.session)throw Error('R93_GUEST_SIGNUP_FAILED')
    await checkedIdentity(client,true)
    await assertNoAccount()
  })
}

export async function openCommercialDelivery(mode:'guest'|'account'){
  const account=requireReady()
  const owner=localBackupOwner(),generation=localOwnerGeneration()
  if(mode==='guest')await assertNoAccount()
  else if(owner.kind!=='user')throw Error('R93_ACCOUNT_SCOPE_DENIED')
  const client=mode==='guest'?guestAuth():account
  const identity=await checkedIdentity(client,mode==='guest')
  if(owner.kind==='user'&&owner.userId!==identity.userId)throw Error('R93_OWNER_MISMATCH')
  const ownerCurrent=()=>{
    const current=localBackupOwner()
    return localOwnerGeneration()===generation&&
      (mode==='guest'?current.kind==='guest':current.kind==='user'&&current.userId===identity.userId)
  }
  return createDeliveryClient({
    enabled:true,expectedUserId:identity.userId,expectedAnonymous:mode==='guest',ownerCurrent,
    async verifyIdentity(){
      if(mode==='guest')await assertNoAccount()
      return checkedIdentity(client,mode==='guest')
    },
    request:createDeliveryRequest({publishableKey:key,fetchImpl:fetch.bind(globalThis)}),
    selectionRequest:createSelectionRequest({publishableKey:key,fetchImpl:fetch.bind(globalThis)})
  })
}
