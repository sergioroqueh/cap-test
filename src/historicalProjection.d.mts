import type {CapQuestion,CapExamMeta} from './capExams'
export function projectHistoricalQuestions(raw:unknown[],meta:Pick<CapExamMeta,'id'|'hasOriginalAnswerSheet'>):CapQuestion[]
