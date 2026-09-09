/**
 * About.me check.
 *
 * Personal profile pages.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const aboutMeAdapter = exactProbeAdapter({
  id: 'about_me',
  label: 'About.me',
  probe: (n) => `https://about.me/${encodeURIComponent(n)}`,
  page: (n) => `https://about.me/${encodeURIComponent(n)}`,
  kind: 'profile',
})
