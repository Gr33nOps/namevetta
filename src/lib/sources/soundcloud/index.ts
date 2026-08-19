/**
 * SoundCloud check.
 *
 * Artist and podcast handles.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const soundcloudAdapter = exactProbeAdapter({
  id: 'soundcloud',
  label: 'SoundCloud',
  probe: (n) => `https://soundcloud.com/${encodeURIComponent(n)}`,
  page: (n) => `https://soundcloud.com/${encodeURIComponent(n)}`,
  kind: 'audio profile',
  method: 'HEAD',
})
