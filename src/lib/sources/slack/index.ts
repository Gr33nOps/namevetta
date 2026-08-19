/**
 * Slack check.
 *
 * Workspace subdomains. A free one answers 404 rather than a sign-in page.
 *
 * Verified against a known-taken and a known-free name, using the product's own
 * identifying User-Agent rather than a browser's.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const slackAdapter = exactProbeAdapter({
  id: 'slack',
  label: 'Slack',
  probe: (n) => `https://${encodeURIComponent(n)}.slack.com`,
  page: (n) => `https://${encodeURIComponent(n)}.slack.com`,
  kind: 'workspace',
})
