/**
 * last.fm check.
 *
 * Listener profiles.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const lastfmAdapter = exactProbeAdapter({
  id: 'lastfm',
  label: 'last.fm',
  probe: (n) => `https://www.last.fm/user/${encodeURIComponent(n)}`,
  page: (n) => `https://www.last.fm/user/${encodeURIComponent(n)}`,
  kind: 'music profile',
  // last.fm answers 600, not 404, for a username nobody holds.
  freeStatuses: [404, 600],
})
