/**
 * Linktree check.
 *
 * Link-in-bio pages, a namespace creators care about.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const linktreeAdapter = exactProbeAdapter({
  id: 'linktree',
  label: 'Linktree',
  probe: (n) => `https://linktr.ee/${encodeURIComponent(n)}`,
  page: (n) => `https://linktr.ee/${encodeURIComponent(n)}`,
  kind: 'link page',
})
