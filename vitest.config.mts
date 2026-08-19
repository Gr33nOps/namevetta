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
    // `e2e/**` is Playwright's, and its `.spec.ts` files would fail here.
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // A floor, not a target. It sits just under today's measured numbers so
      // it fails on a real slide rather than on ordinary churn.
      // Measured 77.05 / 62.47 / 76.35 / 79.29 on 2026-08-19. Branch coverage
      // is the low one because most branches are per-source error paths that
      // only a live upstream failure reaches; `scripts/check-source-endpoints.mjs`
      // is what actually watches those.
      thresholds: { statements: 72, branches: 57, functions: 71, lines: 74 },
    },
  },
})
