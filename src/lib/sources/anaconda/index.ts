/**
 * Anaconda check.
 *
 * Conda packages in the main `anaconda` channel.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const anacondaAdapter = exactProbeAdapter({
  id: 'anaconda',
  label: 'Anaconda',
  probe: (n) => `https://api.anaconda.org/package/anaconda/${encodeURIComponent(n)}`,
  page: (n) => `https://anaconda.org/anaconda/${encodeURIComponent(n)}`,
  kind: 'conda package',
  // A package that exists answers with roughly 5 MB of release history.
  method: 'HEAD',
})
