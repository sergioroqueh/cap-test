#!/usr/bin/env node
// RutaCAP R87 - local OTP-only smoke runner (no deployment, no Stripe, no secrets on disk).
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const expectedProject = 'rhtbqetskghkarxhrgee'
const projectUrl = `https://${expectedProject}.supabase.co`
const mainFile = 'src/supabase.ts'

if (!existsSync(mainFile) || !existsSync('package.json')) {
  console.error('Ejecuta este script desde la carpeta raíz del repositorio cap-test.')
  process.exit(1)
}
const authSource = readFileSync(mainFile, 'utf8')
if (!authSource.includes(projectUrl) || !authSource.includes("VITE_RUTACAP_DEV_SIGNUPS === 'true'")) {
  console.error('Esta copia no corresponde a la rama comercial R86/R87 de RutaCAP. Actualízala antes de probar.')
  process.exit(1)
}
if (!existsSync('node_modules/vite/bin/vite.js')) {
  console.error('Faltan dependencias. Ejecuta primero: npm ci')
  process.exit(1)
}
const rl = createInterface({ input: stdin, output: stdout })
let publishableKey
try {
  publishableKey = (await rl.question('Pega aquí SOLO la clave pública sb_publishable_ de rutacap-dev: ')).trim()
} finally {
  rl.close()
}
if (!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(publishableKey)) {
  console.error('Formato incorrecto: utiliza únicamente la clave pública sb_publishable_ de RutaCAP.')
  process.exit(1)
}

const env = {
  ...process.env,
  VITE_CAP_PRO_SUPABASE_URL: projectUrl,
  VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  VITE_RUTACAP_AUTH_DEV: 'true',
  VITE_RUTACAP_DEV_SIGNUPS: 'true',
  VITE_RUTACAP_EMAIL_OTP: 'true',
  VITE_RUTACAP_GOOGLE_AUTH: 'false',
  VITE_RUTACAP_PUBLIC_AUTH: 'false',
  VITE_RUTACAP_BILLING_ENABLED: 'false',
  VITE_CAP_PREVIEW: 'false',
  VITE_CAP_LAUNCH: 'false',
}

console.log('\nPreparando únicamente los datos públicos de la aplicación local...')
const buildData = spawnSync(process.execPath, ['scripts/prepare_data_cross_platform.mjs'], {
  env, stdio: 'inherit', windowsHide: true,
})
if (buildData.error || buildData.status !== 0) {
  console.error('No se pudieron preparar los datos locales. No se ha iniciado el servidor.')
  process.exit(buildData.status || 1)
}

console.log('\nRutaCAP OTP local: http://localhost:5173')
console.log('Proyecto: rutacap-dev. Google OFF. Stripe OFF. Sync OFF. Ningún despliegue.')
console.log('Usa el formulario por correo, recibe el OTP y verifica el acceso. Ctrl+C para finalizar.\n')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  env, stdio: 'inherit', windowsHide: true,
})
server.on('error', error => {
  console.error(`No se pudo abrir Vite: ${error.message}`)
  process.exitCode = 1
})
server.on('exit', code => { process.exitCode = code ?? 0 })
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!server.killed) server.kill(signal) })
}
