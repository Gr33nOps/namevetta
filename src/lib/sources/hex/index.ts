/**
 * Hex package check (Elixir and Erlang).
 *
 * `hex.pm/api/packages/{name}` is a first-party JSON API with a flat global
 * namespace and a clean 404 for a free name. Verified against a known-taken and
 * a known-free package before being added.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const hexAdapter = exactProbeAdapter({
  id: 'hex',
  label: 'Hex',
  probe: (n) => `https://hex.pm/api/packages/${encodeURIComponent(n)}`,
  page: (n) => `https://hex.pm/packages/${encodeURIComponent(n)}`,
  kind: 'elixir package',
})
