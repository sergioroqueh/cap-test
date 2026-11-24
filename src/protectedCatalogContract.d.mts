import type {Question} from './types'
import type {DeliveryReply} from './commercialDelivery.mjs'
export type ProtectedItem={kind:'question'|'exam';contentId:string;revision:string;minimumTier:'guest'|'free'|'premium';category:'general'|'mercancias'|'viajeros';count:number;label:string}
export type ProtectedCatalog={schemaVersion:1;items:ProtectedItem[]}
export function validatePublicCatalog(value:unknown):ProtectedCatalog
export function validateDeliveredUnit(reply:DeliveryReply,item:ProtectedItem):Question[]
