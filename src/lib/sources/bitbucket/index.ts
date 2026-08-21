/**
 * Bitbucket check, against the workspace API.
 *
 * `/2.0/users/{slug}` answers 404 for everything since Atlassian restricted it;
 * workspaces still resolve, so that is what is asked.
 *
 * **403 is an answer here, not a failure.** A workspace that exists but has
 * been deactivated for inactivity replies 403 with a body saying exactly that,
 * and the slug is still held — nobody else can have it. The old adapter let
 * that status throw, which is where roughly three lookups in ten went: every
 * dormant workspace was recorded as `LOOKUP_FAILED`.
 *
 * The body is what separates "this workspace exists and is dormant" from "we
 * have been refused", so the decision reads the body rather than trusting the
 * status. A 403 that does not name a workspace stays unverified.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

/** Atlassian's phrasing for a slug that is taken but dormant. */
const DEACTIVATED = /workspace and its content have been deactivated|deactivated due to inactivity/i

/** Atlassian's phrasing for a slug nobody holds. */
const NO_WORKSPACE = /no workspace with identifier/i

export const bitbucketAdapter = exactProbeAdapter({
  id: 'bitbucket',
  label: 'Bitbucket',
  probe: (n) => `https://api.bitbucket.org/2.0/workspaces/${encodeURIComponent(n)}`,
  page: (n) => `https://bitbucket.org/${encodeURIComponent(n)}`,
  kind: 'code forge workspace',
  claimedStatuses: [200, 403],
  decide: (status, body) => {
    if (status === 200) return true
    if (status === 404) return NO_WORKSPACE.test(body) ? false : undefined
    if (status === 403) {
      // Taken but dormant. Anything else behind a 403 is a refusal aimed at
      // us, and says nothing about whether the name is free.
      return DEACTIVATED.test(body) ? true : undefined
    }
    return undefined
  },
})
