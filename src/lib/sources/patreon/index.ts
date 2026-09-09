/**
 * Patreon check.
 *
 * Creator pages. The earlier probe used an endpoint that 404s for everything;
 * the public page itself distinguishes properly.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const patreonAdapter = exactProbeAdapter({
  id: 'patreon',
  label: 'Patreon',
  probe: (n) => `https://www.patreon.com/${encodeURIComponent(n)}`,
  page: (n) => `https://www.patreon.com/${encodeURIComponent(n)}`,
  kind: 'creator page',
})
