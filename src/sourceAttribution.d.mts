import type {Question} from './types'
export type SourceAttribution={issuer:string;title:string;questionnaireUrl:string;answerUrl:string|null;conditionsUrl:string;updatedOn:string|null}
export function validateAttribution(a:unknown):SourceAttribution
export function requireSessionAttributions(questions:Question[]):Question[]
