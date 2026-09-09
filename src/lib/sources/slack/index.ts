/**
 * Slack — checked by a person, not by us.
 *
 * This was an automatic probe of `{name}.slack.com`, and it was answering the
 * wrong question. Every workspace that exists replies **403**, and the body is
 * not a sign-in page: it is Slack's "We're very sorry, but your browser is not
 * supported!" page. That is a refusal aimed at our client, not a statement
 * about the subdomain. A free subdomain replies 404 with a generic "There's
 * been a glitch…" page, which is the same page Slack serves for other errors,
 * and a burst of requests earns a 429 from a different tier entirely.
 *
 * So the two statuses we were reading as "taken" and "free" mean "we blocked
 * you" and "something went wrong". Six in ten lookups were being recorded as
 * failures, and the four that "succeeded" were succeeding by accident. There
 * is no unauthenticated Slack API that answers whether a workspace subdomain
 * is claimed, and inventing one from a bot-block page would be worse than not
 * checking.
 *
 * A smaller set of trustworthy sources beats a larger set of fake ones, so
 * Slack reports `manual_check_recommended` and hands over the URL. It scores
 * nothing, counts nothing toward coverage, and cannot report a name as clear.
 */
import type { SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceResult } from '@/lib/core/types'
import { buildResult, makeEvidence, unverifiable } from '@/lib/sources/result'
import { normalize } from '@/lib/similarity/normalize'

export const slackAdapter: SourceAdapter = {
  id: 'slack',

  async run(ctx: ScanContext): Promise<SourceResult> {
    const handle = normalize(ctx.name)
    if (handle.length === 0) {
      return unverifiable('slack', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const url = `https://${handle}.slack.com`

    return buildResult({
      source: 'slack',
      status: 'manual_check_recommended',
      evidence: [
        makeEvidence('slack', `Open ${handle}.slack.com to see whether the workspace exists`, url),
        makeEvidence(
          'slack',
          'Slack answers an automated request with a browser-not-supported page whether or not the workspace exists, so there is no reliable way to check this from a server. Signing in is the only honest test.',
        ),
      ],
      meta: {
        handle,
        platforms: [
          {
            name: 'Slack',
            url,
            status: 'manual_check_recommended' as const,
            detail: 'Slack blocks automated checks; open the link to see',
          },
        ],
      },
    })
  },
}
