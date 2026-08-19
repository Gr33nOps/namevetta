/**
 * Hackage check.
 *
 * Haskell packages. Hackage has a flat global namespace.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const hackageAdapter = exactProbeAdapter({
  id: 'hackage',
  label: 'Hackage',
  probe: (n) => `https://hackage.haskell.org/package/${encodeURIComponent(n)}`,
  page: (n) => `https://hackage.haskell.org/package/${encodeURIComponent(n)}`,
  kind: 'haskell package',
})
