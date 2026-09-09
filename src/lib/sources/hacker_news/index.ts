/**
 * Hacker News username check.
 *
 * The Firebase API answers 200 for every username and puts the answer in the
 * body: the literal string `null` when nobody holds it. Reading the status
 * would mark every name as taken, which is the mirror image of the mistake
 * this module exists to avoid.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const hackerNewsAdapter = exactProbeAdapter({
  id: 'hacker_news',
  label: 'Hacker News',
  probe: (n) => `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(n)}.json`,
  page: (n) => `https://news.ycombinator.com/user?id=${encodeURIComponent(n)}`,
  kind: 'forum account',
  claimedFromBody: (body) => {
    const trimmed = body.trim()
    if (trimmed === 'null') return false
    return trimmed.startsWith('{') ? true : undefined
  },
})
