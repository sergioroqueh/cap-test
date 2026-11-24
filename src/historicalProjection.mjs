// Shared historical projection: extracted byte-for-byte from capExams.ts R93.
// No editorial or scoring changes. Used by both legacy and private catalog.
export function projectHistoricalQuestions(raw,meta){
  return raw.filter(q => meta.hasOriginalAnswerSheet
    ? !!q.originalSheetAnswer
    : !!q.correctAnswer
  ).map(q => ({
    ...q,
    options: q.technicalDecision?.restoredOptions ?? q.options,
    correctAnswer: (q.technicalDecision?.technicalAnswer || q.correctAnswer || q.originalSheetAnswer),
    scoringEligible: q.correctAnswer !== null && q.technicalDecision?.action !== 'exclude',
    id: 'cap:' + meta.id + ':' + q.number,
    progressId: q.canonicalQuestionId || q.id,
    examId: meta.id
  }))
}
