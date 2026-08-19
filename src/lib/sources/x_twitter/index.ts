/**
 * X / Twitter check.
 *
 * The profile URL answers 404 for a handle nobody holds, which is more than
 * Instagram or TikTok will do. Worth knowing this is the most likely of these
 * to change: it is a page, not an API, and X has altered its anonymous access
 * repeatedly. An unexpected answer resolves to unverified, never to free.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const xTwitterAdapter = exactProbeAdapter({
  id: 'x_twitter',
  label: 'X / Twitter',
  probe: (n) => `https://x.com/${encodeURIComponent(n)}`,
  page: (n) => `https://x.com/${encodeURIComponent(n)}`,
  kind: 'social handle',
})
