import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VERCEL === '1' ? '/' : '/cap-test/',
  build: {
    sourcemap: false,
    target: 'es2020'
  }
})
