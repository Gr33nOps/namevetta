/**
 * itch.io account check.
 *
 * Every itch.io account owns `{name}.itch.io`, so the subdomain is the
 * namespace. A free name returns a clean 404 rather than a landing page, which
 * is what makes this answerable at all.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const itchIoAdapter = exactProbeAdapter({
  id: 'itch_io',
  label: 'itch.io',
  probe: (n) => `https://${encodeURIComponent(n)}.itch.io`,
  page: (n) => `https://${encodeURIComponent(n)}.itch.io`,
  kind: 'game page',
})
