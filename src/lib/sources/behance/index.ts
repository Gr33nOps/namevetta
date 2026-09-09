/**
 * Behance check.
 *
 * Adobe's portfolio network, same shape as Dribbble.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const behanceAdapter = exactProbeAdapter({
  id: 'behance',
  label: 'Behance',
  probe: (n) => `https://www.behance.net/${encodeURIComponent(n)}`,
  page: (n) => `https://www.behance.net/${encodeURIComponent(n)}`,
  kind: 'designer profile',
  method: 'HEAD',
})
