/**
 * The social platforms that can actually be checked.
 *
 * `socials/index.ts` is deliberately manual-only, because most platforms give a
 * server no way to tell a claimed handle from a free one. That is still true of
 * Instagram, X, TikTok and Threads: each returns `200 OK` for a handle that does
 * not exist, so a status-code check there would report every name as free.
 *
 * These five are different, and it was measured rather than assumed. Probing a
 * known-taken and a known-free handle on each:
 *
 *   LinkedIn   200 / 404
 *   Substack   301 / 404
 *   dev.to     200 / 404
 *   Mastodon   200 / 404
 *   GitLab     200 / 200, but `[]` versus `[{…}]` in the body
 *
 * Each therefore has an unambiguous signal, and each is a public endpoint
 * answering the question it was built to answer. Anything that comes back
 * ambiguous is reported as unverified, never as free.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult, PlatformVerdict } from '@/lib/core/types'
import { request } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'

/** An exact handle match is exact on every dimension by definition. */
const SIMILARITY_EXACT = { text: 100, phonetic: 100, visual: 100, overall: 100 }

interface Platform {
  name: string
  /** Endpoint that answers whether the handle is claimed. */
  probe: (handle: string) => string
  /** The page a person would open to see it. */
  profile: (handle: string) => string
  /**
   * Read the response. `true` means claimed, `false` means free, `undefined`
   * means the platform did not give a usable answer this time.
   */
  claimed: (status: number, body: string) => boolean | undefined
}

/** A clean 404 means free; a 2xx or a redirect to a real page means claimed. */
const byStatus = (status: number): boolean | undefined => {
  if (status === 404) return false
  if (status === 200 || status === 301 || status === 302) return true
  return undefined
}

const PLATFORMS: Platform[] = [
  {
    name: 'LinkedIn',
    probe: (h) => `https://www.linkedin.com/company/${h}`,
    profile: (h) => `https://www.linkedin.com/company/${h}`,
    claimed: byStatus,
  },
  {
    name: 'Substack',
    probe: (h) => `https://${h}.substack.com`,
    profile: (h) => `https://${h}.substack.com`,
    claimed: byStatus,
  },
  {
    name: 'dev.to',
    probe: (h) => `https://dev.to/api/users/by_username?url=${h}`,
    profile: (h) => `https://dev.to/${h}`,
    claimed: byStatus,
  },
  {
    name: 'Mastodon',
    probe: (h) => `https://mastodon.social/api/v1/accounts/lookup?acct=${h}`,
    profile: (h) => `https://mastodon.social/@${h}`,
    claimed: byStatus,
  },
  {
    name: 'GitLab',
    probe: (h) => `https://gitlab.com/api/v4/users?username=${h}`,
    profile: (h) => `https://gitlab.com/${h}`,
    // GitLab answers 200 either way and puts the answer in the body: an empty
    // array is a free username. Trusting the status here would mark every
    // GitLab name as taken.
    claimed: (status, body) => {
      if (status !== 200) return undefined
      const trimmed = body.trim()
      if (trimmed === '[]') return false
      return trimmed.startsWith('[{') ? true : undefined
    },
  },
]

/** The platforms this adapter checks, by name. See `MANUAL_PLATFORM_NAMES`. */
export const CHECKED_PLATFORM_NAMES: readonly string[] = PLATFORMS.map((p) => p.name)

export const socialCheckAdapter: SourceAdapter = {
  id: 'social_check',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('social_check', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const exactMatches: Match[] = []
    const evidence: Evidence[] = []
    let answered = 0

    // Sequential, not parallel: five platforms at once from one address is the
    // burst the per-source rate limiters exist to avoid, and this is not a slow
    // path to begin with.
    const platforms: PlatformVerdict[] = []

    for (const platform of PLATFORMS) {
      let verdict: boolean | undefined
      // Kept alongside the evidence so the results list can render this
      // platform as its own row under its own name.
      try {
        const response = await request(platform.probe(handle), {
          ...(deps.signal === undefined ? {} : { signal: deps.signal }),
          expectedStatuses: [404, 301, 302],
          retries: 0,
        })
        verdict = platform.claimed(response.status, response.text)
      } catch {
        verdict = undefined
      }

      if (verdict === undefined) {
        evidence.push(
          makeEvidence(
            'social_check',
            `${platform.name}: no clear answer this time, check it yourself`,
            platform.profile(handle),
          ),
        )
        platforms.push({
          name: platform.name,
          url: platform.profile(handle),
          status: 'unable_to_verify',
          detail: 'No clear answer this time',
        })
        continue
      }

      answered += 1

      if (verdict) {
        exactMatches.push({
          externalId: `${platform.name.toLowerCase()}:${handle}`,
          name: handle,
          owner: platform.name,
          categories: [],
          url: platform.profile(handle),
          similarity: SIMILARITY_EXACT,
          severity: severityFor(SIMILARITY_EXACT),
          evidence: [
            makeEvidence('social_check', `${platform.name}: this handle is claimed`, platform.profile(handle)),
          ],
        })
        platforms.push({
          name: platform.name,
          url: platform.profile(handle),
          status: 'confirmed_conflict',
          detail: 'This handle is claimed',
        })
      } else {
        evidence.push(
          makeEvidence(
            'social_check',
            `${platform.name}: no account under this handle`,
            platform.profile(handle),
          ),
        )
        platforms.push({
          name: platform.name,
          url: platform.profile(handle),
          status: 'no_conflict',
          detail: 'No account under this handle',
        })
      }
    }

    // Nothing answered means we learned nothing, which is not the same as
    // finding nothing. Reporting `no_conflict` here would be the exact false
    // green the product exists to avoid.
    if (answered === 0) {
      return unverifiable(
        'social_check',
        'NO_ANSWER',
        'None of these platforms gave a usable answer',
        true,
      )
    }

    return buildResult({
      source: 'social_check',
      status: statusFromMatches(exactMatches, []),
      exactMatches,
      evidence,
      meta: { handle, checked: answered, of: PLATFORMS.length, platforms },
    })
  },
}
