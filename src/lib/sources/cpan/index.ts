/**
 * CPAN check.
 *
 * Perl modules. metacpan answers 402 rather than 404 for an unknown module,
 * which is unusual enough to pin here rather than leave to a reader's guess.
 *
 * Verified against a known-taken and a known-free name before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const cpanAdapter = exactProbeAdapter({
  id: 'cpan',
  label: 'CPAN',
  probe: (n) => `https://metacpan.org/pod/${encodeURIComponent(n)}`,
  page: (n) => `https://metacpan.org/pod/${encodeURIComponent(n)}`,
  kind: 'perl module',
})
