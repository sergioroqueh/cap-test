// C31 CONTRACT ONLY: no transport, Supabase import or UI binding.
// The caller must provide a fresh VERIFIED identity for EVERY request and must
// call revoke() on logout, token invalidation or account switch.
// Future PostgREST code must independently enforce RLS; this is NOT authorization.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export class SyncLeaseError extends Error {
  constructor(code,message) { super(message);this.name='SyncLeaseError';this.code=code }
}
export function createAccountSyncLease({enabled=false,getVerifiedIdentity}={}) {
  const controller=new AbortController()
  let closed=false, pinnedUserId=null
  const stop=(code,message)=>{
    closed=true
    controller.abort()
    throw new SyncLeaseError(code,message)
  }
  async function identity() {
    if(!enabled)throw new SyncLeaseError('CLOUD_OFF','Cloud synchronization is disabled')
    if(closed||controller.signal.aborted)
      throw new SyncLeaseError('CANCELLED','Account sync lease revoked')
    if(typeof getVerifiedIdentity!=='function')
      stop('VERIFIER_MISSING','A live verified identity provider is required')
    const current=await getVerifiedIdentity()
    if(closed||controller.signal.aborted)
      throw new SyncLeaseError('CANCELLED','Account changed during verification')
    if(!current?.verified||current?.isAnonymous!==false||current?.consented!==true||
       typeof current?.userId!=='string'||!uuid.test(current.userId))
      stop('IDENTITY_DENIED','Unverified, guest or unconsented identity')
    if(pinnedUserId&&pinnedUserId!==current.userId)
      stop('ACCOUNT_SWITCH','Identity changed during synchronization')
    pinnedUserId=current.userId
    return pinnedUserId
  }
  async function execute(request) {
    if(typeof request!=='function')
      throw new SyncLeaseError('INVALID_REQUEST','An explicit transport callback is required')
    const userId=await identity()
    const result=await request({userId,signal:controller.signal})
    await identity() // If sign-out/switch happened while awaiting, do not apply reply.
    return result
  }
  function revoke(){
    closed=true
    controller.abort()
  }
  return {execute,revoke,get signal(){return controller.signal}}
}
