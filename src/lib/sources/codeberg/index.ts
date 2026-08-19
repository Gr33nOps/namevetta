/**
 * Codeberg check.
 *
 * Codeberg runs Forgejo, whose API exposes a real user lookup.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const codebergAdapter = exactProbeAdapter({
  id: 'codeberg',
  label: 'Codeberg',
  probe: (n) => `https://codeberg.org/api/v1/users/${encodeURIComponent(n)}`,
  page: (n) => `https://codeberg.org/${encodeURIComponent(n)}`,
  kind: 'code forge account',
})
