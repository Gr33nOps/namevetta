import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests.
 *
 * These cover the one thing the 400-odd unit tests structurally cannot: that a
 * page actually renders, in a browser, with its client components hydrated.
 * Everything about scoring, sources and similarity is tested far more cheaply
 * in `src/**` and `golden/**` — nothing here should duplicate that.
 *
 * Chromium only, deliberately. Cross-browser rendering is not where this app's
 * risk lives, and a single engine keeps CI minutes (and therefore cost) where
 * the rest of the project keeps them: at zero.
 *
 * No credentials are set, so the app runs in its degraded, database-less mode.
 * That is the correct target: it is the configuration the CI build already
 * guarantees, and every assertion below holds in it.
 */
/**
 * Next 16 refuses to start a second `next dev` in the same directory, so the
 * suite cannot claim a private port. It uses the standard one and reuses a
 * server that is already up, which is also the faster path locally. CI has no
 * server running, so Playwright starts and owns one there.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  reporter: process.env.CI !== undefined ? 'github' : 'list',

  /**
   * Ceilings, so a stuck run fails instead of burning the runner.
   *
   * There were none, and a job that normally finishes in under four minutes
   * sat past eleven with nothing to show for it. A suite this size has no
   * legitimate reason to run long; failing fast turns a silent stall into a
   * result somebody can read.
   */
  timeout: 30_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 5_000 },

  use: {
    // `localhost`, not `127.0.0.1`: Next 16's dev server rejects asset requests
    // from an origin it doesn't recognise, and the numeric form comes back 403
    // on every chunk.
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    // The mobile menu, the collapsed nav and the responsive grids only exist
    // below the `lg` breakpoint, so they need a viewport that reaches them.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],

  webServer: {
    // `next dev` rather than a production build: it is what a contributor runs
    // locally, so a green local run and a green CI run mean the same thing.
    //
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
