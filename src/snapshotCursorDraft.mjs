// C33 design-prototype ONLY. No fetch(), Supabase or app imports.
// The hypothetical server MUST pin an immutable snapshot/checkpoint across pages.
// PostgREST Range requests alone do NOT offer that guarantee.
import {unionRecords,replayProgress} from './syncCore.mjs'
export class SnapshotCursorDraftError extends Error {
  constructor(code,message){super(message);this.name='SnapshotCursorDraftError';this.code=code}
}
const fail=(code,message)=>{throw new SnapshotCursorDraftError(code,message)}
const tables=[
  {name:'events',key:'eventId'},
  {name:'sessions',key:'clientId'}
]
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const nonneg=x=>Number.isSafeInteger(x)&&x>=0
const validKey=x=>typeof x==='string'&&x.length>0&&x.length<=200

export function createSnapshotCursorDraft({enabled=false,lease,provider,pageSize=100,maxRows=20000}={}){
  if(!nonneg(maxRows)||maxRows<1||maxRows>50000||
     !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500)
    fail('BOUNDS_INVALID','Invalid count or page limits')
  async function invoke(fn){
    if(!lease||typeof lease.execute!=='function')fail('LEASE_MISSING','Verified identity lease required')
    return lease.execute(fn)
  }
  return {
    async readOwnerSnapshot(){
      if(!enabled)fail('CLOUD_OFF','No remote snapshot reads enabled')
      if(!provider||provider.fixtureOnly!==true||
         !['begin','page','finish'].every(method=>typeof provider[method]==='function'))
        fail('PROVIDER_MISSING','Explicit synthetic snapshot provider required')
      let pinnedOwner=null
      const manifest=await invoke(async({userId,signal})=>{
        pinnedOwner=userId
        return provider.begin({ownerId:userId,signal})
      })
      if(!object(manifest)||manifest.ownerId!==pinnedOwner||
         !validKey(manifest.snapshotId)||!validKey(manifest.checkpoint)||
         !object(manifest.counts)||!nonneg(manifest.counts.events)||
         !nonneg(manifest.counts.sessions)||manifest.counts.events>maxRows||
         manifest.counts.sessions>maxRows)
        fail('MANIFEST_INVALID','A pinned, bounded snapshot manifest is required')
      const records={}
      for(const table of tables){
        const count=manifest.counts[table.name],result=[],seen=new Set()
        let priorKey=null
        for(let offset=0;offset<count;offset+=pageSize){
          const response=await invoke(async({userId,signal})=>{
            if(userId!==manifest.ownerId)fail('ACCOUNT_CHANGED','Owner changed')
            return provider.page({
              ownerId:userId,snapshotId:manifest.snapshotId,
              checkpoint:manifest.checkpoint,table:table.name,
              offset,limit:Math.min(pageSize,count-offset),signal
            })
          })
          const limit=Math.min(pageSize,count-offset)
          if(!object(response)||response.ownerId!==manifest.ownerId||
             response.snapshotId!==manifest.snapshotId||
             response.checkpoint!==manifest.checkpoint||
             response.table!==table.name||response.offset!==offset||
             response.total!==count||!Array.isArray(response.items)||
             response.items.length!==limit)
            fail('PAGE_INVALID','Page changed, truncated or escaped pinned snapshot')
          for(const item of response.items){
            const key=item?.[table.key]
            if(!object(item)||!validKey(key)||seen.has(key)||
               (priorKey!==null&&key.localeCompare(priorKey)<=0))
              fail('KEY_INVALID','Unsorted or duplicated immutable key')
            priorKey=key;seen.add(key);result.push(item)
          }
        }
        records[table.name]=result
      }
      const end=await invoke(async({userId,signal})=>{
        if(userId!==manifest.ownerId)fail('ACCOUNT_CHANGED','Owner changed')
        return provider.finish({
          ownerId:userId,snapshotId:manifest.snapshotId,
          checkpoint:manifest.checkpoint,signal
        })
      })
      if(!object(end)||end.ownerId!==manifest.ownerId||
         end.snapshotId!==manifest.snapshotId||
         end.checkpoint!==manifest.checkpoint||end.committed!==true)
        fail('SNAPSHOT_INVALID','Server did not confirm pinned snapshot')
      const result=unionRecords({events:[],sessions:[]},records)
      replayProgress(result.events)
      return result
    }
  }
}
