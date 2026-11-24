import type { JournalEvent } from './localJournal'
import type { StudySessionRecord } from './types'
type Records = {events:JournalEvent[];sessions:StudySessionRecord[]}
type Identity = {verified:boolean;isAnonymous:boolean;userId:string;sessionId:string;accessToken:string}
type Request = (request:{path:string;method:string;body?:unknown;accessToken:string})=>Promise<unknown>
export function createCommercialPostgrestRequest(options:{publishableKey:string;fetchImpl:typeof fetch}):Request
export function createCommercialSyncTransport(options:{
  enabled?:boolean;expectedUserId:string;verifyIdentity:()=>Promise<Identity>;
  ownerCurrent:()=>boolean;request:Request;validateRecords:(records:Records)=>Records
}):{
  pull(userId:string):Promise<Records>;
  insertMissing(userId:string,records:Records):Promise<void>;
  verifiedIdentity():Promise<{verified:boolean;isAnonymous:boolean;consented:boolean;userId:string}>;
  close():void
}
