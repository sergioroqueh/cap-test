import type {Question} from './types'
export type SelectionMode='mixed-study'|'mixed-exam'|'top100'|'top3'|'top4'|'favorites'|'errors'|'review'
export type SelectionInput={mode:SelectionMode;category:'mercancias'|'viajeros';count:number;hints:Record<string,number>;requestId:string}
type SelectionQuota={tier:'guest'|'free'|'premium';day:string;resetAt:string;questionsRemaining:number|null;examsRemaining:number|null;replayed:boolean;mode:SelectionMode;category:SelectionInput['category'];requestId:string;requested:number}
export type SelectionReply={status:'unavailable'}|(SelectionQuota&{status:'quota_exhausted'})|(SelectionQuota&{status:'ok';count:number;content:{questions:Question[]}})
export type SelectionRequest=(input:SelectionInput&{accessToken:string})=>Promise<unknown>
export function validateSelectionInput(x:SelectionInput):SelectionInput
export function validateSelectionReply(reply:unknown,x:SelectionInput,anonymous:boolean):SelectionReply
export function normalizedSelectionStem(q:{question:string}):string
export function createSelectionRequest(opts:{publishableKey:string;fetchImpl:typeof fetch}):SelectionRequest
