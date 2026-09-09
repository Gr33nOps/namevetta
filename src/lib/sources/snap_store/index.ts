/**
 * Snap Store check.
 *
 * Canonical's snap catalogue.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const snapStoreAdapter = exactProbeAdapter({
  id: 'snap_store',
  label: 'Snap Store',
  probe: (n) => `https://api.snapcraft.io/v2/snaps/info/${encodeURIComponent(n)}`,
  page: (n) => `https://snapcraft.io/${encodeURIComponent(n)}`,
  kind: 'snap package',
  // The API refuses any request without this header.
  headers: { 'Snap-Device-Series': '16' },
})
