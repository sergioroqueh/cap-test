// R63: distribution-only allowlist. Never writes to public/, data-src/, or source files.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BANK_COUNT = 8655
export const BANK_QUIZZES = 33
export const EXAM_MODELS = 26
export const EXAM_QUESTIONS = 2600
const BANK_PATH = /^data\/questions\/[a-z0-9-]+\.json$/
const EXAM_PATH = /^data\/exams\/questions\/[a-z0-9-]+\.json$/

// Explicit outputs of the R20-R31 editorial generators. Other unexpected data
// are fatal rather than silently swept into (or out of) the distribution.
export const EDITORIAL_FILES = new Set([
  'review_queue.json','review_queue.csv','review_hints.json','review_hints.csv',
  'cross_model_pending_review.json','cross_model_pending_review.csv',
  'alignment_2023_a_review.csv','ocr_2025_a_review.csv',
  'template_review_priority.csv','without_template_deferred.csv',
  'template_2025_03_29_unverified_comparison.json','template_review_summary.json',
  'sheet_audit_index.json','sheet_audit_2400.csv',
  'convocatorias_auditoria_r20.json','convocatorias_auditoria_r20.csv',
  'editorial_triage_r21.json','editorial_triage_r21.csv',
  'editorial_casebook_r22.json','editorial_casebook_r22.csv',
  'editorial_casebook_r23.json','editorial_casebook_r23.csv',
  'editorial_casebook_r24.json','editorial_casebook_r24.csv',
  'editorial_progress_r24.json',
  'editorial_decisions_r25_three.json','editorial_decisions_r25_three.csv',
  'technical_review_r27.json','technical_review_r27.csv','technical_review_r27_cross_model.json',
  'technical_review_r28.json','technical_review_r28.csv','technical_review_r28_queue.json',
  'technical_review_r29.json','technical_review_r29.csv',
  'technical_review_r30_candidates.json','technical_review_r30.json','technical_review_r30.csv',
  'technical_review_r31_candidates.json','technical_review_r31.json','technical_review_r31.csv',
  'technical_review_r32_candidates.json','technical_review_r32.json','technical_review_r32.csv',
  'visual_batch_audit_2026_11_05.json'
].map(name => 'data/exams/' + name))

function dataFiles(root) {
  const base = join(root, 'data')
  assert.ok(existsSync(base), 'R63: falta data/ en ' + root)
  const found = []
  function walk(path, relative) {
    assert.ok(lstatSync(path).isDirectory(), 'R63: data/ no es un directorio')
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : 'data/' + entry.name
      const absolute = join(path, entry.name)
      const stat = lstatSync(absolute)
      assert.ok(!stat.isSymbolicLink(), 'R63: enlace simbólico rechazado: ' + name)
      if (stat.isDirectory()) walk(absolute, name)
      else {
        assert.ok(stat.isFile(), 'R63: archivo especial rechazado: ' + name)
        found.push(name)
      }
    }
  }
  walk(base, '')
  return found.sort()
}
function bytes(root, path) { return readFileSync(join(root, ...path.split('/'))) }
function digest(value) { return createHash('sha256').update(value).digest('hex') }
function json(root, path) { return JSON.parse(bytes(root, path).toString('utf8')) }
function referencedPaths(index, listName, expectedCount, pattern, prefix) {
  const records = index[listName]
  assert.ok(Array.isArray(records) && records.length === expectedCount,
    'R63: número incorrecto de ' + listName)
  const found = new Set()
  for (const entry of records) {
    assert.ok(entry && typeof entry.id === 'string' && /^[a-z0-9-]+$/.test(entry.id),
      'R63: ID de ' + listName + ' no válido')
    assert.ok(typeof entry.path === 'string' && pattern.test(entry.path) &&
      entry.path === prefix + entry.id + '.json',
      'R63: ruta inválida, externa o no canónica de ' + listName)
    assert.ok(!found.has(entry.path), 'R63: ruta duplicada ' + entry.path)
    found.add(entry.path)
  }
  return records
}
function expectedFromPublic(publicRoot) {
  const bank = json(publicRoot, 'data/index.json')
  const exams = json(publicRoot, 'data/exams/index.json')
  assert.equal(bank.totalQuestions, BANK_COUNT, 'R63: total bancario incorrecto')
  assert.equal(bank.totalQuestionnaires, BANK_QUIZZES, 'R63: índice bancario incorrecto')
  assert.equal(exams.totalExamModels, EXAM_MODELS, 'R63: modelos incorrectos')
  assert.equal(exams.totalImportedQuestions, EXAM_QUESTIONS, 'R63: total histórico incorrecto')
  const questionnaires = referencedPaths(bank, 'questionnaires', BANK_QUIZZES, BANK_PATH, 'data/questions/')
  const models = referencedPaths(exams, 'exams', EXAM_MODELS, EXAM_PATH, 'data/exams/questions/')
  assert.equal(questionnaires.reduce((n, x) => n + x.count, 0), BANK_COUNT,
    'R63: total de preguntas bancarias incorrecto')
  assert.equal(models.reduce((n, x) => n + x.count, 0), EXAM_QUESTIONS,
    'R63: total de preguntas históricas incorrecto')
  const expected = new Set(['data/index.json', 'data/exams/index.json',
    'data/exams/frequency_by_bank.json'])
  for (const item of questionnaires) {
    assert.ok(Number.isInteger(item.count) && item.count > 0, 'R63: conteo de cuestionario inválido')
    const rows = json(publicRoot, item.path)
    assert.ok(Array.isArray(rows) && rows.length === item.count,
      'R63: faltan preguntas en ' + item.path)
    expected.add(item.path)
  }
  for (const item of models) {
    assert.equal(item.count, 100, 'R63: modelo histórico incompleto')
    assert.equal(item.expectedCount, 100, 'R63: tamaño esperado del modelo alterado')
    const rows = json(publicRoot, item.path)
    assert.ok(Array.isArray(rows) && rows.length === item.count,
      'R63: preguntas del modelo incorrectas: ' + item.path)
    expected.add(item.path)
  }
  const frequency = json(publicRoot, 'data/exams/frequency_by_bank.json')
  assert.ok(frequency && !Array.isArray(frequency) && typeof frequency === 'object' &&
    Object.keys(frequency).length > 0, 'R63: frecuencia ausente o vacía')
  return [...expected].sort()
}
function assertExactDist(publicRoot, distRoot, allowed, beforeCleanup) {
  const files = dataFiles(distRoot)
  const missing = allowed.filter(path => !files.includes(path))
  assert.deepEqual(missing, [], 'R63: faltan archivos funcionales en dist')
  const extras = files.filter(path => !allowed.includes(path))
  if (beforeCleanup) {
    const unknown = extras.filter(path => !EDITORIAL_FILES.has(path))
    assert.deepEqual(unknown, [], 'R63: material desconocido en dist/data (fallo cerrado)')
  } else {
    assert.deepEqual(extras, [], 'R63: quedan archivos ajenos a la allowlist')
  }
  const hashes = allowed.map(path => {
    const publicSha256 = digest(bytes(publicRoot, path))
    const distSha256 = digest(bytes(distRoot, path))
    assert.equal(distSha256, publicSha256, 'R63: divergencia de bytes/hash en ' + path)
    return { path, sha256: distSha256 }
  })
  return { hashes, extras }
}
function pruneEmptyDirs(root) {
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) walk(join(dir, item.name))
    }
    if (dir !== root && readdirSync(dir).length === 0) rmdirSync(dir)
  }
  walk(root)
}
export function packagePublicData({ publicRoot, distRoot, verifyOnly = false, reportPath } = {}) {
  const source = resolve(publicRoot || 'public')
  const destination = resolve(distRoot || 'dist')
  assert.notEqual(source, destination, 'R63: origen y destino coinciden')
  const allowed = expectedFromPublic(source)
  const pre = assertExactDist(source, destination, allowed, !verifyOnly)
  if (!verifyOnly) {
    for (const path of pre.extras) {
      assert.ok(EDITORIAL_FILES.has(path), 'R63: intento de eliminar archivo inesperado')
      unlinkSync(join(destination, ...path.split('/')))
    }
    pruneEmptyDirs(join(destination, 'data'))
  }
  const post = assertExactDist(source, destination, allowed, false)
  assert.deepEqual(post.hashes, pre.hashes, 'R63: hashes alterados al empaquetar')
  const manifestSha256 = digest(post.hashes.map(x => x.path + ':' + x.sha256).join('\n'))
  const result = {
    schemaVersion: 1, mode: verifyOnly ? 'verify' : 'package', fileCount: allowed.length,
    bankQuestions: BANK_COUNT, questionnaires: BANK_QUIZZES,
    examModels: EXAM_MODELS, historicalQuestions: EXAM_QUESTIONS,
    removedEditorialFiles: verifyOnly ? 0 : pre.extras.length,
    manifestSha256, files: post.hashes
  }
  if (reportPath) {
    const location = resolve(reportPath)
    assert.ok(!location.startsWith(source + sep) && !location.startsWith(destination + sep)
      && location !== source && location !== destination,
      'R63: informe no debe escribirse en public/ ni dist/')
    mkdirSync(dirname(location), { recursive: true })
    writeFileSync(location, JSON.stringify(result, null, 2) + '\n', 'utf8')
  }
  return result
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = packagePublicData({
      verifyOnly: process.argv.includes('--verify'),
      reportPath: process.argv.includes('--verify') ? undefined : 'artifacts/r63-public-allowlist-manifest.json'
    })
    console.log('[R63] ' + result.mode + ' OK: ' + result.fileCount +
      ' archivos; banco 8655/33; histórico 2600/26; editoriales retirados ' +
      result.removedEditorialFiles + '; manifest SHA256 ' + result.manifestSha256)
  } catch (error) {
    console.error('[R63] FAIL: ' + error.message)
    process.exitCode = 1
  }
}
