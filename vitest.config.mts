import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws by design when imported outside a server
      // component. That guard is exactly what we want in the app and exactly
      // what we must bypass to unit-test these modules directly.
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'golden/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
