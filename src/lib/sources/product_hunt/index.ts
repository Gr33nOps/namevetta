/**
 * Product Hunt check.
 *
 * Maker profiles. Worth checking for anyone planning to launch there.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const productHuntAdapter = exactProbeAdapter({
  id: 'product_hunt',
  label: 'Product Hunt',
  probe: (n) => `https://www.producthunt.com/@${encodeURIComponent(n)}`,
  page: (n) => `https://www.producthunt.com/@${encodeURIComponent(n)}`,
  kind: 'maker profile',
  method: 'HEAD',
})
