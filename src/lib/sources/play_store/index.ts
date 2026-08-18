/**
 * Google Play discovery (§13).
 *
 * Google publishes no public Play Store search API, and the scraper libraries
 * that fill that gap are fragile and terms-of-service grey. So this is web
 * search restricted to `play.google.com` — clearly labelled, capped at 50
 * confidence, and never carrying first-party weight.
 *
 * **This is the second search request**, and it is spent only where an app store
 * genuinely decides whether a name is usable. For a mobile app or a game, Play
 * carries 27% and 20% of the score respectively and the credit is well spent.
 * For a SaaS product it carries 2%, and burning a shared monthly credit on it
 * would be poor economics — so it is skipped and reported honestly as not
 * checked.
 *
 * That keeps a normal Deep Check at one request, with two only in the cases that
 * warrant it.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { Category, ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { SearchUnavailableError, webSearchProvider } from '@/lib/providers'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

/**
 * Categories where Play Store presence is worth a search credit.
 *
 * Derived from the scoring weights: these are the categories where `play_store`
 * carries meaningful weight. Anywhere else the credit buys almost no score
 * movement.
 */
const WORTH_A_CREDIT: readonly Category[] = ['mobile_app', 'game']

const SIMILARITY_FLOOR = 60

export const playStoreAdapter: SourceAdapter = {
  id: 'play_store',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    if (!WORTH_A_CREDIT.includes(ctx.category)) {
      // Not a failure — a deliberate choice, stated plainly so it is never
      // mistaken for "nothing found on Google Play".
      return unverifiable(
        'play_store',
        'NOT_SEARCHED',
        'Google Play was not searched: it carries little weight for this category, and web-search credits are limited. This is not evidence the name is unused there.',
        false,
      )
    }

    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('play_store', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const provider = webSearchProvider()
    if (provider === undefined) {
      return unverifiable('play_store', 'NO_PROVIDER', 'No web search provider is configured.', false)
    }

    let outcome
    try {
      outcome = await provider.search(`"${ctx.name}" android app`, {
        depth: 'basic',
        maxResults: 10,
        includeDomains: ['play.google.com'],
        signal: deps.signal,
      })
    } catch (cause) {
      if (cause instanceof SearchUnavailableError) {
        return unverifiable(
          'play_store',
          cause.reason === 'budget_exhausted' ? 'BUDGET_EXHAUSTED' : cause.reason.toUpperCase(),
          `${cause.message} This is not evidence the name is unused on Google Play.`,
          cause.reason !== 'no_api_key',
        )
      }
      return unverifiable('play_store', 'SEARCH_FAILED', 'Google Play discovery failed.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    for (const hit of outcome.hits) {
      // Play listing titles look like "Appname - Apps on Google Play".
      const title = hit.title.replace(/\s*[-–—]\s*(Apps on Google Play|Google Play).*$/i, '').trim()
      if (title === '') continue

      const similarity = compareNames(ctx.name, title)
      const isExact = normalize(title) === target
      const contains = containsNameAsWord(ctx.name, title)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      const match: Match = {
        externalId: hit.url,
        name: title,
        categories: ['google-play'],
        active: true,
        url: hit.url,
        description: hit.content.slice(0, 300),
        similarity,
        severity: severityFor(similarity),
        evidence: [makeEvidence('play_store', `Google Play listing "${title}"`, hit.url)],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence('play_store', `Searched Google Play listings for "${ctx.name}"`),
      makeEvidence(
        'play_store',
        'Google publishes no public Play Store search API, so this is web-index discovery. It is less reliable than a first-party source and is scored accordingly.',
      ),
    ]

    deps.log('play_store.searched', {
      credits: outcome.creditsUsed,
      fromCache: outcome.fromCache,
      kept: exactMatches.length + similarMatches.length,
    })

    return buildResult({
      source: 'play_store',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 6),
      evidence,
      fromCache: outcome.fromCache,
    })
  },
}
