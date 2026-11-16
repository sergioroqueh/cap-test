import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const configured = loadEnv(mode, '.', 'CAP_PUBLIC_BASE').CAP_PUBLIC_BASE || '/cap-test/'
  const base = mode === 'cap-preview' ? '/' : configured
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('CAP_PUBLIC_BASE debe ser una ruta absoluta con barra final, por ejemplo / o /cap-test/.')
  return { plugins: [react()], base, build: { sourcemap: false, target: 'es2020' } }
})
