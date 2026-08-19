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
 * `connect-src`/`img-src`/`font-src` stay at `'self'` because nothing in this
 * app talks to a third party from the browser: Supabase, Tavily, Groq,
 * Companies House and every other source are called server-side only, and
 * fonts are self-hosted via `next/font`. Cloudflare Turnstile is the one
 * deliberate exception, allowed only for the paths that render its widget.
 */
const isDev = process.env.NODE_ENV === 'development'

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

const csp = [
  `default-src 'self'`,
  // 'unsafe-inline': Next inlines the RSC hydration payload in the initial
  // HTML; there is no nonce plumbing here (see comment above), so this is the
  // documented middle ground rather than an oversight.
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src 'self' ${TURNSTILE_ORIGIN}`,
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

const nextConfig: NextConfig = {
  // Framework fingerprinting is a small, free thing to not hand an attacker.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
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
 * what lets `connect-src` in the CSP above stay at `'self'` — the browser
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
