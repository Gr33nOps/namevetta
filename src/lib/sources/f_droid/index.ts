/**
 * F-Droid check.
 *
 * F-Droid's open-source Android catalogue, keyed on application id.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const fdroidAdapter = exactProbeAdapter({
  id: 'f_droid',
  label: 'F-Droid',
  probe: (n) => `https://f-droid.org/api/v1/packages/${encodeURIComponent(n)}`,
  page: (n) => `https://f-droid.org/packages/${encodeURIComponent(n)}/`,
  kind: 'android app',
})
