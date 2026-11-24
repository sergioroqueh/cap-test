import type {SelectionInput,SelectionReply,SelectionRequest} from './protectedSelection.mjs'
export type DeliveryKind='question'|'exam'
export type DeliveryInput={kind:DeliveryKind;contentId:string;requestId:string}
type Identity={verified:boolean;userId:string;isAnonymous:boolean;sessionId:string;accessToken:string}
type Request=(input:DeliveryInput&{accessToken:string})=>Promise<unknown>
type Quota={tier:'guest'|'free'|'premium';day:string;resetAt:string;questionsRemaining:number|null;examsRemaining:number|null;replayed:boolean}
export type DeliveryReply={status:'unavailable'}|(Quota&{status:'quota_exhausted'})|(Quota&{status:'ok';kind:DeliveryKind;contentId:string;revision:string;content:Record<string,unknown>})
export function createDeliveryRequest(opts:{publishableKey:string;fetchImpl:typeof fetch}):Request
export function createDeliveryClient(opts:{enabled?:boolean;expectedUserId:string;expectedAnonymous:boolean;ownerCurrent:()=>boolean;verifyIdentity:()=>Promise<Identity>;request:Request;selectionRequest?:SelectionRequest}):{deliver(input:DeliveryInput):Promise<DeliveryReply>;select(input:SelectionInput):Promise<SelectionReply>;close():void}
