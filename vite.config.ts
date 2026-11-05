import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo at https://erikbeans.github.io/mancala/
  base: '/mancala/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'],
  },
})
