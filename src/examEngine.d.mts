export const CAP_DURATION_MINUTES: number;
export const CAP_QUESTION_COUNT: number;
export const CAP_PASS_POINTS: number;
export interface GradingAnswer {
  selected?: 'A' | 'B' | 'C' | 'D';
  correct: boolean;
  scoringEligible?: boolean;
}
export interface GradingResult {
  graded: number;
  correct: number;
  incorrect: number;
  blank: number;
  excluded: number;
  answered: number;
  netPoints: number;
  scorePercentage: number;
  officialComparable: boolean;
  passed: boolean | null;
}
export function gradeSession(answers: GradingAnswer[], capScoring?: boolean): GradingResult;
export function deadlineAt(startedAt: number, durationMinutes?: number): number;
export function remainingMs(startedAt: number, now: number, durationMinutes?: number): number;
export function formatRemaining(ms: number): string;
