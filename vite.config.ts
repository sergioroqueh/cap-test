import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'cap-preview' ? '/' : '/cap-test/',
  build: {
    sourcemap: false,
    target: 'es2020'
  }
}))
