import type { Question, QuestionProgress } from './types'

export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export function getStatus(progress?: QuestionProgress): 'unseen' | 'learning' | 'review' | 'mastered' {
  if (!progress || progress.attempts === 0) return 'unseen'
  if (progress.streak >= 3 && progress.correct >= 3) return 'mastered'
  if (progress.incorrect > 0 && progress.streak < 2) return 'review'
  return 'learning'
}

export function needsReview(progress?: QuestionProgress): boolean {
  return Boolean(progress && progress.incorrect > 0 && progress.streak < 2)
}

export function smartScore(progress?: QuestionProgress): number {
  if (!progress) return 8
  const accuracy = progress.attempts ? progress.correct / progress.attempts : 0
  const ageDays = progress.lastAnsweredAt ? (Date.now() - progress.lastAnsweredAt) / 86_400_000 : 10
  let score = (1 - accuracy) * 12 + progress.incorrect * 1.5 + Math.min(ageDays / 7, 4)
  if (progress.lastCorrect === false) score += 6
  if (progress.streak >= 3) score -= 8
  return score
}

export function chooseSmartQuestions(
  questions: Question[],
  progressMap: Map<string, QuestionProgress>,
  count: number
): Question[] {
  return questions
    .map((q) => ({ q, score: smartScore(progressMap.get(q.id)) + Math.random() * 2 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((row) => row.q)
}

export function formatDate(ts: number) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts)
}
