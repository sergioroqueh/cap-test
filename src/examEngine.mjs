/**
 * Pure CAP scoring and wall-clock helpers. No browser dependencies.
 * Excluded historical questions remain visible but never affect scoring.
 */
export const CAP_DURATION_MINUTES = 120;
export const CAP_QUESTION_COUNT = 100;
export const CAP_PASS_POINTS = 50;

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * @param {Array<{selected?: 'A'|'B'|'C'|'D'; correct: boolean; scoringEligible?: boolean}>} answers
 * @param {boolean} capScoring
 */
export function gradeSession(answers, capScoring = false) {
  const eligible = answers.filter(a => a.scoringEligible !== false);
  const graded = eligible.length;
  const correct = eligible.filter(a => !!a.selected && a.correct).length;
  const incorrect = eligible.filter(a => !!a.selected && !a.correct).length;
  const blank = graded - correct - incorrect;
  const excluded = answers.length - graded;
  const answered = answers.filter(a => !!a.selected).length;
  const netPoints = round2(correct - 0.5 * incorrect);
  const scorePercentage = graded
    ? round2(100 * (capScoring ? netPoints : correct) / graded)
    : 0;
  // Only a full, entirely scoreable 100-question CAP test can show a pass.
  // Historic models with editorial exclusions show an indicative scaled score.
  const officialComparable = capScoring && answers.length === CAP_QUESTION_COUNT && graded === CAP_QUESTION_COUNT;
  return {
    graded, correct, incorrect, blank, excluded, answered,
    netPoints, scorePercentage,
    officialComparable,
    passed: officialComparable ? netPoints >= CAP_PASS_POINTS : null
  };
}

/** Deadline uses persisted start time, not the current render or tab focus. */
export function deadlineAt(startedAt, durationMinutes = CAP_DURATION_MINUTES) {
  return startedAt + durationMinutes * 60_000;
}
export function remainingMs(startedAt, now, durationMinutes = CAP_DURATION_MINUTES) {
  return Math.max(0, deadlineAt(startedAt, durationMinutes) - now);
}
export function formatRemaining(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' +
    String(Math.floor((seconds % 3600) / 60)).padStart(2, '0') + ':' +
    String(seconds % 60).padStart(2, '0');
}

/**
 * Mix without repeating either the canonical question or its normalized text.
 * The first occurrence keeps the original question, options, and answer letter.
 * @template {{id:string, progressId?:string, question:string}} T
 * @param {T[]} questions
 * @returns {T[]}
 */
export function uniqueExamQuestions(questions) {
  const ids = new Set();
  const statements = new Set();
  return questions.filter(q => {
    const id = q.progressId || q.id;
    const text = q.question.normalize('NFKC').toLocaleLowerCase('es')
      .replace(/\s+/g, ' ').replace(/[¿?¡!.,;:()[\]{}]/g, '').trim();
    if(ids.has(id) || statements.has(text)) return false;
    ids.add(id);
    statements.add(text);
    return true;
  });
}
