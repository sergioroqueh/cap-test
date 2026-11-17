// Type-only bridge for the C29 pure ESM journal engine (no runtime imports).
import type {QuestionProgress, StudySessionRecord} from './types'
import type {JournalEvent} from './localJournal'
export function unionRecords(
 a:{events:JournalEvent[];sessions:StudySessionRecord[]},
 b:{events:JournalEvent[];sessions:StudySessionRecord[]}
):{events:JournalEvent[];sessions:StudySessionRecord[]}
export function replayProgress(events:JournalEvent[]):QuestionProgress[]
