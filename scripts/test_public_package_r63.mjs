// R63: synthetic-only tests; no real questions, answers, cloud or production.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { packagePublicData, EDITORIAL_FILES } from './package_public_data_r63.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
const write = (root, name, contents) => {
  const filename = join(root, ...name.split('/'))
  mkdirSync(join(filename, '..'), { recursive: true })
  writeFileSync(filename, typeof contents === 'string' ? contents : JSON.stringify(contents))
}
const read = (root, name) => readFileSync(join(root, ...name.split('/')))
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'rutacap-r63-synthetic-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const publicRoot = join(root, 'public')
  const distRoot = join(root, 'dist')
  const questionnaires = []
  for (let i = 0; i < 33; i++) {
    const id = 'synthetic-bank-' + String(i + 1).padStart(2, '0')
    const count = i === 32 ? 271 : 262
    const path = 'data/questions/' + id + '.json'
    questionnaires.push({ id, path, count, title: id })
    write(publicRoot, path, Array.from({ length: count }, (_, n) => ({
      id: id + '-' + n, correctAnswer: 'B', question: 'SYNTHETIC ONLY'
    })))
  }
  write(publicRoot, 'data/index.json', {
    version: 'synthetic', totalQuestions: 8655,
    totalQuestionnaires: 33, questionnaires
  })
  const exams = []
  for (let i = 0; i < 26; i++) {
    const id = 'synthetic-exam-' + String(i + 1).padStart(2, '0')
    const path = 'data/exams/questions/' + id + '.json'
    exams.push({ id, path, count: 100, expectedCount: 100,
      category: i === 25 ? 'viajeros' : 'mercancias',
      hasOriginalAnswerSheet: i !== 25, scoringEligibleCount: i === 25 ? 0 : 100 })
    write(publicRoot, path, Array.from({ length: 100 }, (_, n) => ({
      id: id + '-' + n, correctAnswer: i === 25 ? null : 'C',
      scoringEligible: i !== 25, technicalDecision: null
    })))
  }
  write(publicRoot, 'data/exams/index.json', {
    version: 'synthetic', totalExamModels: 26, totalImportedQuestions: 2600, exams
  })
  write(publicRoot, 'data/exams/frequency_by_bank.json', {
    fake: { count: 1, denominator: 26, category: 'mercancias' }
  })
  write(publicRoot, 'data/exams/editorial_casebook_r23.json', { only: 'editorial' })
  write(publicRoot, 'data/exams/editorial_casebook_r23.csv', 'PRIVATE-EDITORIAL-TEST\n')
  cpSync(join(publicRoot, 'data'), join(distRoot, 'data'), { recursive: true })
  return { root, publicRoot, distRoot, questionnaires, exams }
}
const pack = f => packagePublicData({ publicRoot: f.publicRoot, distRoot: f.distRoot })
const verify = f => packagePublicData({ publicRoot: f.publicRoot, distRoot: f.distRoot, verifyOnly: true })
const index = (root, name) => JSON.parse(read(root, name).toString('utf8'))

test('R63 positive: exact 62 allowlisted files, editorials only removed from dist, every byte retained', t => {
  const f = fixture(t)
  const editorialSourceHash = digest(read(f.publicRoot, 'data/exams/editorial_casebook_r23.json'))
  const historicalBefore = digest(read(f.distRoot, f.exams[0].path))
  const bankBefore = digest(read(f.distRoot, f.questionnaires[0].path))
  const frequencyBefore = digest(read(f.distRoot, 'data/exams/frequency_by_bank.json'))
  const result = packagePublicData({
    publicRoot: f.publicRoot, distRoot: f.distRoot,
    reportPath: join(f.root, 'artifacts', 'manifest.json')
  })
  assert.equal(result.fileCount, 62)
  assert.equal(result.removedEditorialFiles, 2)
  assert.equal(result.files.length, 62)
  assert.equal(result.manifestSha256.length, 64)
  assert.ok(existsSync(join(f.root, 'artifacts', 'manifest.json')))
  assert.deepEqual(index(f.root, 'artifacts/manifest.json').files, result.files)
  assert.equal(digest(read(f.publicRoot, 'data/exams/editorial_casebook_r23.json')), editorialSourceHash)
  assert.ok(existsSync(join(f.publicRoot, 'data/exams/editorial_casebook_r23.csv')))
  assert.ok(!existsSync(join(f.distRoot, 'data/exams/editorial_casebook_r23.json')))
  assert.ok(!existsSync(join(f.distRoot, 'data/exams/editorial_casebook_r23.csv')))
  assert.equal(digest(read(f.distRoot, f.exams[0].path)), historicalBefore)
  assert.equal(digest(read(f.distRoot, f.questionnaires[0].path)), bankBefore)
  assert.equal(digest(read(f.distRoot, 'data/exams/frequency_by_bank.json')), frequencyBefore)
  assert.equal(index(f.distRoot, 'data/exams/index.json').exams.at(-1).hasOriginalAnswerSheet, false)
  assert.equal(verify(f).manifestSha256, result.manifestSha256)
  assert.deepEqual(readdirSync(join(f.distRoot, 'data')).sort(), ['exams', 'index.json', 'questions'])
})
test('R63 rejects an unknown file without deleting known editorials', t => {
  const f = fixture(t)
  write(f.distRoot, 'data/exams/new_pending_editorial_r99.json', {})
  assert.throws(() => pack(f), /material desconocido/)
  assert.ok(existsSync(join(f.distRoot, 'data/exams/editorial_casebook_r23.json')))
})
test('R63 rejects traversal, absolute URL, and paths not identical to the indexed ID', async t => {
  for (const illegal of ['data/questions/../index.json', 'https://evil.invalid/questions.json',
    'data/questions/not-the-id.json', '/data/questions/synthetic-bank-01.json',
    'data\\questions\\synthetic-bank-01.json']) {
    await t.test(illegal, s => {
      const f = fixture(s)
      const file = index(f.publicRoot, 'data/index.json')
      file.questionnaires[0].path = illegal
      write(f.publicRoot, 'data/index.json', file)
      write(f.distRoot, 'data/index.json', file)
      assert.throws(() => pack(f), /ruta inválida/)
    })
  }
})
test('R63 detects duplicate indexed paths', t => {
  const f = fixture(t)
  const file = index(f.publicRoot, 'data/index.json')
  file.questionnaires[1] = { ...file.questionnaires[0] }
  write(f.publicRoot, 'data/index.json', file)
  write(f.distRoot, 'data/index.json', file)
  assert.throws(() => pack(f), /ruta duplicada/)
})
test('R63 rejects a missing referenced exam file', t => {
  const f = fixture(t)
  rmSync(join(f.distRoot, ...f.exams[0].path.split('/')))
  assert.throws(() => pack(f), /faltan archivos funcionales/)
})
test('R63 catches byte-level scoring changes before cleaning dist', t => {
  const f = fixture(t)
  const rows = index(f.distRoot, f.exams[0].path)
  rows[0].correctAnswer = 'D'
  write(f.distRoot, f.exams[0].path, rows)
  assert.throws(() => pack(f), /divergencia de bytes\/hash/)
  assert.ok(existsSync(join(f.distRoot, 'data/exams/editorial_casebook_r23.csv')))
})
test('R63 fails on bank or archive count drift', async t => {
  for (const drift of ['bank', 'archive']) {
    await t.test(drift, s => {
      const f = fixture(s)
      const name = drift === 'bank' ? 'data/index.json' : 'data/exams/index.json'
      const payload = index(f.publicRoot, name)
      if (drift === 'bank') payload.totalQuestions = 8654
      else payload.totalExamModels = 25
      write(f.publicRoot, name, payload)
      write(f.distRoot, name, payload)
      assert.throws(() => pack(f), /total bancario incorrecto|modelos incorrectos/)
    })
  }
})
test('R63 verify-only refuses residual editorials in the packaged output', t => {
  const f = fixture(t)
  assert.throws(() => verify(f), /quedan archivos ajenos a la allowlist/)
  assert.equal(pack(f).removedEditorialFiles, 2)
  assert.equal(verify(f).removedEditorialFiles, 0)
})
test('R63 editorial classification is explicit, not a permissive wildcard', () => {
  assert.ok(EDITORIAL_FILES.has('data/exams/technical_review_r31.csv'))
  assert.ok(!EDITORIAL_FILES.has('data/exams/technical_review_r99.csv'))
  assert.ok(!EDITORIAL_FILES.has('data/exams/questions/mystery.json'))
})
test('R63 build and CI always invoke post-build verification', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  for (const script of ['build', 'build:preview']) {
    assert.match(pkg.scripts[script], /vite build/)
    assert.match(pkg.scripts[script], /package_public_data_r63\.mjs --verify/)
  }
})
