/**
 * Chocolatey check.
 *
 * Windows packages. The OData API answers 406 and 504; the package page is
 * the endpoint that actually works.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const chocolateyAdapter = exactProbeAdapter({
  id: 'chocolatey',
  label: 'Chocolatey',
  probe: (n) => `https://community.chocolatey.org/packages/${encodeURIComponent(n)}`,
  page: (n) => `https://community.chocolatey.org/packages/${encodeURIComponent(n)}`,
  kind: 'windows package',
})
