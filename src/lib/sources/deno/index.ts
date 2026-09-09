/**
 * Deno check.
 *
 * Third-party Deno modules, via the registry API behind deno.land/x.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const denoAdapter = exactProbeAdapter({
  id: 'deno',
  label: 'Deno',
  probe: (n) => `https://apiland.deno.dev/v2/modules/${encodeURIComponent(n)}`,
  page: (n) => `https://deno.land/x/${encodeURIComponent(n)}`,
  kind: 'deno module',
})
