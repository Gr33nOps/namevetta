/**
 * pub.dev check.
 *
 * Dart and Flutter packages. First-party JSON API, flat namespace, clean 404.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const pubDevAdapter = exactProbeAdapter({
  id: 'pub_dev',
  label: 'pub.dev',
  probe: (n) => `https://pub.dev/api/packages/${encodeURIComponent(n)}`,
  page: (n) => `https://pub.dev/packages/${encodeURIComponent(n)}`,
  kind: 'dart package',
})
