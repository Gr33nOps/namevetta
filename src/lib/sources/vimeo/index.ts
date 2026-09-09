/**
 * Vimeo check.
 *
 * Vimeo's long-standing simple API answers per-user without a token.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const vimeoAdapter = exactProbeAdapter({
  id: 'vimeo',
  label: 'Vimeo',
  probe: (n) => `https://vimeo.com/api/v2/${encodeURIComponent(n)}/info.json`,
  page: (n) => `https://vimeo.com/${encodeURIComponent(n)}`,
  kind: 'video channel',
})
