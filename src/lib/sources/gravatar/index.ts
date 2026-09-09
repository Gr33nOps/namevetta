/**
 * Gravatar check.
 *
 * Gravatar profiles back a lot of developer tooling, so the handle is worth knowing about.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const gravatarAdapter = exactProbeAdapter({
  id: 'gravatar',
  label: 'Gravatar',
  probe: (n) => `https://en.gravatar.com/${encodeURIComponent(n)}.json`,
  page: (n) => `https://gravatar.com/${encodeURIComponent(n)}`,
  kind: 'profile',
})
