/**
 * Flickr check.
 *
 * Photographer profiles.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const flickrAdapter = exactProbeAdapter({
  id: 'flickr',
  label: 'Flickr',
  probe: (n) => `https://www.flickr.com/people/${encodeURIComponent(n)}`,
  page: (n) => `https://www.flickr.com/people/${encodeURIComponent(n)}`,
  kind: 'photo profile',
})
