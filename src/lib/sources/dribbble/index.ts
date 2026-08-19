/**
 * Dribbble check.
 *
 * Designer portfolios. The profile page answers 404 for a free handle.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const dribbbleAdapter = exactProbeAdapter({
  id: 'dribbble',
  label: 'Dribbble',
  probe: (n) => `https://dribbble.com/${encodeURIComponent(n)}`,
  page: (n) => `https://dribbble.com/${encodeURIComponent(n)}`,
  kind: 'designer profile',
  method: 'HEAD',
})
