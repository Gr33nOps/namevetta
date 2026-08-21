import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

/**
 * Security headers (§14).
 *
 * Set here rather than via nonce-based CSP in `proxy.ts` deliberately: a nonce
 * requires every page to render dynamically, which trades away the static
 * optimization this app otherwise gets for free on Vercel Hobby.
 *
 * `'unsafe-inline'` on `script-src` is therefore accepted. Next inlines the RSC
 * hydration payload, so it is required regardless; what makes the residual risk
 * small is that no third-party script loads and every inline script this app
 * writes itself is a compile-time constant with no user-derived input:
 *
 *   - `app/layout.tsx` — the pre-paint theme script, a fixed string that reads
 *     `localStorage` and sets one attribute.
 *   - `app/layout.tsx` and `app/methodology/page.tsx` — two JSON-LD blocks,
 *     `JSON.stringify` of module-level literals.
 *
 * If an inline script ever needs to interpolate a value that came from a
 * request, this trade stops being safe and the nonce is the answer, not a
 * bigger allowlist.
 *
 * `img-src`/`font-src` stay at `'self'` because nothing in this app loads a
 * third-party asset: fonts are self-hosted via `next/font`, and Tavily, Groq,
 * Companies House and every other source are called server-side only.
 *
 * `connect-src` has two deliberate exceptions. Cloudflare Turnstile, for the
 * paths that render its widget, and Supabase — whose auth client runs in the
 * browser for the session-dependent header and the password-reset flow. See
 * `supabaseOrigin` below for what leaving it out cost.
 */
const isDev = process.env.NODE_ENV === 'development'

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Supabase's own origin, which the browser genuinely does need to reach.
 *
 * The comment below used to claim nothing in this app talks to a third party
 * from the browser. That stopped being true the moment `NavSession` and the
 * password-reset form started calling `supabase.auth` client-side, and because
 * `connect-src` did not list it, every one of those calls was blocked by our
 * own policy. supabase-js reports a blocked request as "no user", so a signed-in
 * visitor was shown a "Sign up" button, and the session handed over in a
 * verification link could never be exchanged — you had to sign in by hand
 * afterwards. Both looked like auth bugs and were a header.
 *
 * Derived from the configured URL rather than written out, so a project move
 * cannot leave a stale hostname allowlisted, and omitted entirely when the app
 * runs without a database.
 */
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url === undefined || url === '') return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
})()

/** Realtime uses the same host over WebSocket, which `connect-src` also governs. */
const supabaseConnect =
  supabaseOrigin === undefined ? '' : ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, 'wss')}`

const csp = [
  `default-src 'self'`,
  // 'unsafe-inline': Next inlines the RSC hydration payload in the initial
  // HTML; there is no nonce plumbing here (see comment above), so this is the
  // documented middle ground rather than an oversight.
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src 'self' ${TURNSTILE_ORIGIN}${supabaseConnect}`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Sent unconditionally in dev too: browsers only ever act on it after a
  // real HTTPS response, so it is inert (not incorrect) over local HTTP.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/**
 * Routes whose response must never sit in a shared cache.
 *
 * `/auth/reset` was the one that prompted this: it has no dynamic data of its
 * own, so it was statically prerendered and served with a public,
 * revalidating cache policy — a page in an authentication flow, cacheable by
 * any intermediary. The rest are here because each one renders somebody's
 * account, their research, or a link they chose to share.
 *
 * Deliberately a list, not a wildcard. Caching is what keeps this deployment
 * inside a free tier; the marketing pages and the status page should stay
 * cacheable, and turning it off everywhere to fix four routes would be a
 * worse trade than the bug.
 */
const PRIVATE_ROUTES = [
  '/auth',
  '/auth/:path*',
  '/account',
  '/account/:path*',
  '/history',
  '/saved',
  // A shared report is unlisted, not public: the token is the only thing
  // keeping it private, and a shared cache holding the response defeats that.
  '/r/:path*',
]

const noStore = [
  {
    key: 'Cache-Control',
    value: 'private, no-store, no-cache, must-revalidate, max-age=0',
  },
]

const nextConfig: NextConfig = {
  // Framework fingerprinting is a small, free thing to not hand an attacker.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      ...PRIVATE_ROUTES.map((source) => ({ source, headers: noStore })),
    ]
  },
}

/**
 * Sentry (§14).
 *
 * `withSentryConfig` degrades gracefully with no credentials: without
 * `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` it skips source-map
 * upload rather than failing the build, so a deployment that hasn't set these
 * up yet builds exactly as it did before Sentry existed.
 *
 * `tunnelRoute` sends client-side error reports through this app's own
 * `/monitoring` path rather than directly to Sentry's ingest domain. That is
 * what keeps Sentry's ingest domain out of `connect-src` above — the browser
 * never needs to know Sentry's domain at all, so there is nothing to
 * allowlist and nothing that changes if the Sentry project or region ever
 * does.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  tunnelRoute: '/monitoring',
})
