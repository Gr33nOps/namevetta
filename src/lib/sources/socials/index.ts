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
import type { SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, SourceResult } from '@/lib/core/types'
import { buildResult, makeEvidence, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'

interface Platform {
  /**
   * What the reader sees, and it names the *namespace*, not just the site.
   *
   * "Reddit" was ambiguous in a way that mattered: the link went to
   * `reddit.com/r/{name}`, which is a community, while the row sat under a
   * heading reading "Social identity" and every neighbour on it was a personal
   * handle. Two different questions with one label between them.
   *
   * The community is the right one to ask about — this product researches
   * whether a *brand* name is free, and `r/yourbrand` is where a brand
   * collides on Reddit — so the link stays and the label says so instead.
   */
  name: string
  /** The page a person opens to check it. */
  url: (handle: string) => string
  /** What they are looking at when they get there. */
  what: string
  /** Which categories care about this platform most. */
  weight: 'high' | 'medium' | 'low'
}

const PLATFORMS: Platform[] = [
  {
    name: 'Instagram',
    url: (h) => `https://instagram.com/${h}`,
    what: 'the account handle',
    weight: 'high',
  },
  {
    name: 'TikTok',
    url: (h) => `https://tiktok.com/@${h}`,
    what: 'the account handle',
    weight: 'high',
  },
  {
    name: 'Reddit Community',
    url: (h) => `https://reddit.com/r/${h}`,
    what: 'the subreddit name, r/yourbrand, not a Reddit username',
    weight: 'low',
  },
  {
    name: 'Twitch',
    url: (h) => `https://twitch.tv/${h}`,
    what: 'the channel name',
    weight: 'low',
  },
  {
    name: 'Threads',
    url: (h) => `https://threads.net/@${h}`,
    what: 'the account handle',
    weight: 'medium',
  },
]

/**
 * The platforms this adapter covers, by name.
 *
 * Exported so the homepage can say how many social surfaces a check covers
 * without a second list of the same names going stale beside this one.
 */
export const MANUAL_PLATFORM_NAMES: readonly string[] = PLATFORMS.map((p) => p.name)

export const socialsAdapter: SourceAdapter = {
  id: 'socials',

  async run(ctx: ScanContext): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('socials', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = PLATFORMS.map((platform) =>
      makeEvidence(
        'socials',
        `${platform.name}: check ${platform.what} yourself. No reliable automatic test exists.`,
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
        'Most platforms are now checked properly and reported separately, X and Bluesky included. These five genuinely cannot be: every one of them answers 200 for a name that exists and 200 for a name that does not, so a status check would report every name as free. Measured, not assumed.',
      ),
    )

    // `manual_check_recommended` contributes 0 confidence and 0 coverage by
    // design. The gap is real and the report shows it rather than papering over
    // it with an unverified guess.
    return buildResult({
      source: 'socials',
      status: 'manual_check_recommended',
      evidence,
      /*
        One entry per platform, so the results list can show "Instagram" and
        "TikTok" as their own rows rather than a single row called "Social
        identity" that a reader has to open to learn anything from. Structured
        here rather than parsed back out of the evidence labels above: the
        adapter knows which platform each verdict belongs to, and no reader of
        this data should have to guess it from a string.
      */
      meta: {
        handle,
        platforms: PLATFORMS.map((platform) => ({
          name: platform.name,
          url: platform.url(handle),
          status: 'manual_check_recommended' as const,
          detail: `Verify ${platform.what} directly`,
        })),
      },
    })
  },
}
