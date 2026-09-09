/**
 * Server-side error tracking (§14).
 *
 * Optional, like every other credential in this product: with no `SENTRY_DSN`
 * configured, `Sentry.init` runs with `dsn: undefined`, which the SDK treats
 * as fully disabled — no network calls, no overhead beyond the import itself.
 * A deployment that hasn't set this behaves exactly as it did before Sentry
 * existed.
 *
 * `register()` runs once per server instance, for both the Node.js and edge
 * runtimes; `NEXT_RUNTIME` picks the right init. `onRequestError` is Next's
 * own hook for server-side rendering, route handler and Server Action
 * failures, wired straight to Sentry's capture function.
 */
import * as Sentry from '@sentry/nextjs'

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      // Stack traces without the source-mapped originals are still useful,
      // and no error volume from a beta product justifies the noise of full
      // tracing on a free tier that has its own limits.
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({ dsn, tracesSampleRate: 0 })
  }
}

export const onRequestError = Sentry.captureRequestError
