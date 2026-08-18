/**
 * Client-side error tracking (§14).
 *
 * Same optionality as `instrumentation.ts`: with no `NEXT_PUBLIC_SENTRY_DSN`,
 * this is inert. Read directly from `process.env` rather than through the
 * server-only `env()` accessor, because Next only inlines `NEXT_PUBLIC_*`
 * values into the client bundle when they're referenced as a literal
 * `process.env.NEXT_PUBLIC_X` expression — a wrapper function would defeat
 * that static replacement.
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
