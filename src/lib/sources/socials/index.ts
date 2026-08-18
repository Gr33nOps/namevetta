/**
 * Social identity (§14).
 *
 * "Don't make social scraping central to the product. That would create
 * constant maintenance." It would also be the easiest place in the whole
 * product to be quietly wrong: an unauthenticated profile fetch can return a
 * login wall, a soft 404, or a rate-limit page, and reading any of those as
 * "handle is free" produces exactly the false green check this product exists
 * to avoid.
 *
 * So this adapter asserts nothing. It reports `manual_check_recommended`,
 * generates the exact profile URLs for the candidate handle, and lets the user
 * click through. YouTube is the one platform with a free official handle
 * lookup, and it is checked properly by its own adapter.
 *
 * That is deliberately less impressive than a row of green ticks, and
 * considerably more truthful.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, SourceResult } from '@/lib/core/types'
import { buildResult, makeEvidence, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'

interface Platform {
  name: string
  /** Profile URL for a handle. */
  url: (handle: string) => string
  /** Which categories care about this platform most. */
  weight: 'high' | 'medium' | 'low'
}

const PLATFORMS: Platform[] = [
  { name: 'Instagram', url: (h) => `https://instagram.com/${h}`, weight: 'high' },
  { name: 'X', url: (h) => `https://x.com/${h}`, weight: 'high' },
  { name: 'TikTok', url: (h) => `https://tiktok.com/@${h}`, weight: 'high' },
  { name: 'LinkedIn', url: (h) => `https://linkedin.com/company/${h}`, weight: 'medium' },
  { name: 'Reddit', url: (h) => `https://reddit.com/r/${h}`, weight: 'low' },
  { name: 'Twitch', url: (h) => `https://twitch.tv/${h}`, weight: 'low' },
  { name: 'Threads', url: (h) => `https://threads.net/@${h}`, weight: 'medium' },
]

export const socialsAdapter: SourceAdapter = {
  id: 'socials',

  async run(ctx: ScanContext, _deps: AdapterDeps): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('socials', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = PLATFORMS.map((platform) =>
      makeEvidence(
        'socials',
        `${platform.name} — automatic verification unavailable, check manually`,
        platform.url(handle),
      ),
    )

    evidence.push(
      makeEvidence(
        'socials',
        'No social platform offers a free, reliable handle-availability API. These links open the profile URL for your name so you can check each one yourself.',
      ),
      makeEvidence(
        'socials',
        'YouTube is checked properly and reported separately, because it does provide an official handle lookup.',
      ),
    )

    // `manual_check_recommended` contributes 0 confidence and 0 coverage by
    // design. The gap is real and the report shows it rather than papering over
    // it with an unverified guess.
    return buildResult({
      source: 'socials',
      status: 'manual_check_recommended',
      evidence,
      meta: { handle, platforms: PLATFORMS.length },
    })
  },
}
