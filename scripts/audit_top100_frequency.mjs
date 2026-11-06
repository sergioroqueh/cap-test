import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { mostFrequentExamQuestions } from '../src/examEngine.mjs'

const base = new URL('../public/', import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, base), 'utf8'))
const index = await readJson('data/exams/index.json')
const metas = index.exams.filter(meta =>
  meta.category === 'mercancias' && meta.hasOriginalAnswerSheet && meta.readyCount > 0
)
const rows = (await Promise.all(metas.map(async meta => {
  const raw = await readJson(meta.path)
  return raw.filter(q => !!q.originalSheetAnswer && q.correctAnswer !== null)
    .map(q => ({
      id:'cap:'+meta.id+':'+q.number,
      progressId:q.canonicalQuestionId || q.id,
      examId:meta.id,
      question:q.question,
      examFrequency:q.examFrequency,
      reviewRequired:q.reviewRequired,
      scoringEligible:q.scoringEligible !== false
    }))
}))).flat()
const ranked = mostFrequentExamQuestions(rows, rows.length)
const top = ranked.slice(0, 100)
assert.equal(top.length, 100)
const threePlus=ranked.filter(q=>q.examFrequency>=3)
const fourPlus=ranked.filter(q=>q.examFrequency>=4)
assert.equal(threePlus.length,157,'Current archive: 157 unique scoreable questions appeared 3+ times')
assert.equal(fourPlus.length,68,'Current archive: 68 unique scoreable questions appeared 4+ times')
assert.equal(new Set(top.map(q=>q.id)).size,100)
assert.ok(top.every(q=>q.scoringEligible && q.examFrequency > 0))
assert.ok(top.every((q,i) => i===0||top[i-1].examFrequency>=q.examFrequency))

function histogram(rows){
  const counts = new Map()
  rows.forEach(q=>counts.set(q.examFrequency, (counts.get(q.examFrequency)||0)+1))
  return [...counts].sort((a,b)=>b[0]-a[0]).map(([repetitions,questions])=>({repetitions,questions}))
}
const report = {
  topSize:top.length,
  threePlus:threePlus.length,
  fourPlus:fourPlus.length,
  scoredModels:metas.length,
  historyModels:index.categoryCounts.mercancias,
  uniqueEligible:ranked.length,
  topThreshold:top.at(-1).examFrequency,
  highestFrequency:top[0].examFrequency,
  topHistogram:histogram(top),
  fullHistogram:histogram(ranked)
}
console.log('CAP_TOP100_HISTOGRAM='+JSON.stringify(report))
