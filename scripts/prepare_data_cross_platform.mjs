// C25: exact original preparation order, portable between Windows and Linux.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const STEPS = [
  "scripts/build_data.py",
  "scripts/build_exam_data.py",
  "scripts/build_template_review.py",
  "scripts/build_sheet_audit.py",
  "scripts/build_convocation_audit_r20.py",
  "scripts/build_editorial_triage_r21.py",
  "scripts/build_editorial_casebook_r22.py",
  "scripts/build_editorial_casebook_r23.py",
  "scripts/build_editorial_casebook_r24.py",
  "scripts/build_three_conflicts_decisions_r25.py",
  "scripts/build_technical_review_r27.py",
  "scripts/build_technical_review_r28.py",
  "scripts/build_technical_review_r29.py",
  "scripts/select_technical_review_r30.py",
  "scripts/build_technical_review_r30.py",
  "scripts/select_technical_review_r31.py",
  "scripts/build_technical_review_r31.py"
]

export function resolvePython(platform = process.platform, spawn = spawnSync) {
  const candidates = platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]]
  for (const [command, prefix] of candidates) {
    const result = spawn(command, [...prefix, '--version'], { encoding: 'utf8', windowsHide: true })
    const version = String(result.stdout || '') + String(result.stderr || '')
    if (!result.error && result.status === 0 && /Python 3\.\d+/.test(version)) {
      return { command, prefix }
    }
  }
  throw new Error('No se encontró Python 3. Instala Python desde python.org o con ' +
    'winget install -e --id Python.Python.3.13 y vuelve a abrir PowerShell.')
}

export function prepareAll(spawn = spawnSync) {
  const { command, prefix } = resolvePython(process.platform, spawn)
  for (const filename of STEPS) {
    process.stdout.write('[RutaCAP] ' + filename + '\n')
    const run = spawn(command, [...prefix, filename], { stdio: 'inherit', windowsHide: true })
    if (run.error) throw run.error
    if (run.status !== 0) throw new Error('Fallo preparando ' + filename + ' (exit=' + run.status + ')')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareAll() } catch (error) {
    process.stderr.write('[RutaCAP] ' + error.message + '\n')
    process.exitCode = 1
  }
}
