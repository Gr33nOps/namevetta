/**
 * Canonical site origin, for anything that needs an absolute URL: `robots.ts`,
 * `sitemap.ts`, Open Graph images, share links.
 *
 * `NEXT_PUBLIC_SITE_URL` is optional, matching every other credential in this
 * product — unset, it falls back to the URL the README states is live. A
 * fork or a preview deploy on a different domain sets the env var rather than
 * needing a code change.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://namevetta.vercel.app').replace(
  /\/$/,
  '',
)
