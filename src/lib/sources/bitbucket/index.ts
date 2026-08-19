/**
 * Bitbucket check.
 *
 * The workspace API, not the user API. `/2.0/users/{slug}` answers 404 for
 * everything since Atlassian restricted it; workspaces still resolve.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const bitbucketAdapter = exactProbeAdapter({
  id: 'bitbucket',
  label: 'Bitbucket',
  probe: (n) => `https://api.bitbucket.org/2.0/workspaces/${encodeURIComponent(n)}`,
  page: (n) => `https://bitbucket.org/${encodeURIComponent(n)}`,
  kind: 'code forge workspace',
})
