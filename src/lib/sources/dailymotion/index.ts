/**
 * DailyMotion check.
 *
 * DailyMotion's public API answers per-user without a token.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const dailymotionAdapter = exactProbeAdapter({
  id: 'dailymotion',
  label: 'DailyMotion',
  probe: (n) => `https://api.dailymotion.com/user/${encodeURIComponent(n)}`,
  page: (n) => `https://www.dailymotion.com/${encodeURIComponent(n)}`,
  kind: 'video channel',
})
