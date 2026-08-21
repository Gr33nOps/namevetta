/**
 * Web and business presence (§22).
 *
 * Finds companies, products, projects and brands already using the name, beyond
 * the hardcoded APIs.
 *
 * **Exactly one search request per Deep Check.** Tavily returns synthesised
 * results across many sources in a single call, so the multi-query pattern a raw
 * search API would force is unnecessary — and one request per scan is what keeps
 * the whole product inside a free allowance. A second request is spent only by
 * Play Store discovery, and only for the categories where an app store actually
 * matters.
 *
 * When the allowance is gone this reports `unable_to_verify` and the rest of the
 * scan carries on. That is the honest outcome: we did not look, so we know
 * nothing — which is not the same as finding nothing.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { webSearchProvider, SearchUnavailableError } from '@/lib/providers'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'
import { classifyManualDiscovery } from '@/lib/sources/manual-discovery'

/** Below this a hit is noise rather than a naming concern. */
const SIMILARITY_FLOOR = 60

/**
 * Hosts that never represent a brand using the name — dictionaries, encyclopedia
 * pages, and the code-hosting sites we already check properly with real APIs.
 * Surfacing them again as "web presence" is duplication dressed as evidence.
 */
const IGNORED_HOSTS = [
  'wikipedia.org',
  'wiktionary.org',
  'dictionary.com',
  'merriam-webster.com',
  'thesaurus.com',
  'github.com',
  'npmjs.com',
  'pypi.org',
  'youtube.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'reddit.com',
  'pinterest.com',
  'amazon.com',
  'ebay.com',
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Public-suffix-ish labels to drop when reading a brand out of a domain.
 *
 * Not a full public-suffix list — that would be a dependency and a data file for
 * a job this simple. These cover the endings that actually show up.
 */
const NON_BRAND_LABELS = new Set([
  'www', 'com', 'net', 'org', 'io', 'co', 'app', 'dev', 'ai', 'sh', 'gg', 'me',
  'tv', 'uk', 'us', 'eu', 'de', 'fr', 'nl', 'ca', 'au', 'in', 'jp', 'gov',
  'edu', 'info', 'biz', 'xyz', 'tech', 'store', 'shop', 'online', 'site',
])

/** The parts of a host that could plausibly be a brand name. */
function domainLabels(host: string): string[] {
  return host
    .split('.')
    .filter((label) => label !== '' && !NON_BRAND_LABELS.has(label.toLowerCase()))
}

function isIgnored(url: string): boolean {
  const host = hostOf(url)
  return IGNORED_HOSTS.some((ignored) => host === ignored || host.endsWith(`.${ignored}`))
}

/**
 * Build the single query.
 *
 * Tavily is optimised for natural-language questions rather than keyword
 * stuffing, so this reads as a question. The user's own description is included
 * when supplied, which is what lets industry relevance do useful work on the
 * results afterwards.
 */
function buildQuery(ctx: ScanContext): string {
  const base = `"${ctx.name}" company OR product OR startup OR brand`
  return ctx.description === undefined || ctx.description.trim() === ''
    ? base
    : `${base} — ${ctx.description}`
}

export const webAdapter: SourceAdapter = {
  id: 'web',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('web', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const provider = webSearchProvider()
    if (provider === undefined) {
      return unverifiable('web', 'NO_PROVIDER', 'No web search provider is configured.', false)
    }

    let outcome
    try {
      outcome = await provider.search(buildQuery(ctx), {
        // Basic depth costs one credit; advanced costs two and is not worth it
        // for finding whether a brand exists.
        depth: 'basic',
        maxResults: 12,
        signal: deps.signal,
      })
    } catch (cause) {
      if (cause instanceof SearchUnavailableError) {
        const retryable = cause.reason !== 'no_api_key'
        return unverifiable(
          'web',
          cause.reason === 'budget_exhausted' ? 'BUDGET_EXHAUSTED' : cause.reason.toUpperCase(),
          `${cause.message} This is not evidence that the name is unused.`,
          retryable,
        )
      }
      return unverifiable('web', 'SEARCH_FAILED', 'Web research could not be completed.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const manualDiscovery = classifyManualDiscovery(ctx.name, outcome.hits)
    let ignored = 0
    // One brand per domain. Three pages from notion.so are one company, and
    // listing them separately reads as three conflicts.
    const seenHosts = new Set<string>()

    for (const hit of outcome.hits) {
      if (isIgnored(hit.url)) {
        ignored++
        continue
      }
      if (seenHosts.has(hostOf(hit.url))) continue

      // Identity comes from the **domain**, not the page title.
      //
      // A news article headlined "Stripe acquires payment processing startup"
      // mentions the name but is not a brand using it, and treating a title
      // mention as a match produced exactly that kind of noise. Somebody who
      // owns a name almost always owns a domain that carries it.
      const host = hostOf(hit.url)
      const labels = domainLabels(host)

      let best: { name: string; similarity: ReturnType<typeof compareNames> } | undefined
      for (const label of labels) {
        const similarity = compareNames(ctx.name, label)
        if (best === undefined || similarity.overall > best.similarity.overall) {
          best = { name: label, similarity }
        }
      }
      if (best === undefined) continue

      const isExact = labels.some((label) => normalize(label) === target)
      const hostCarriesName = labels.some((label) => containsNameAsWord(ctx.name, label))

      // **Only the domain decides.** A page title was tried and rejected: every
      // news article about a company leads with its name, so "Stripe acquires
      // payment processing startup" scored as a brand collision. Somebody
      // actually operating under a name has a domain carrying it; everyone else
      // is writing *about* them.
      if (!isExact && !hostCarriesName && best.similarity.overall < SIMILARITY_FLOOR) continue

      // The name is always the domain-derived brand, never the page title.
      // Using the title here also mis-fired the containment rule downstream,
      // which promoted headlines to `medium` severity.
      const displayName = best.name

      const match: Match = {
        externalId: hit.url,
        name: displayName,
        categories: ['web'],
        active: true,
        url: hit.url,
        description: hit.content.slice(0, 400),
        similarity: best.similarity,
        severity: severityFor(best.similarity, { legallyWeighted: true }),
        evidence: [makeEvidence('web', `${hit.title} (${host})`, hit.url)],
      }

      seenHosts.add(host)
      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence(
        'web',
        `Searched the open web for businesses, products and brands named "${ctx.name}"`,
      ),
      makeEvidence(
        'web',
        'Web results are indexed pages, not an authoritative register. A clean result means nothing prominent was found, not that the name is unused.',
      ),
    ]
    if (ignored > 0) {
      evidence.push(
        makeEvidence(
          'web',
          `${ignored} ${ignored === 1 ? 'result' : 'results'} from dictionaries, encyclopedias and sources already checked directly were excluded`,
        ),
      )
    }

    // Credit spend is logged, never the query or the key.
    deps.log('web.searched', {
      credits: outcome.creditsUsed,
      fromCache: outcome.fromCache,
      hits: outcome.hits.length,
      kept: exactMatches.length + similarMatches.length,
    })

    return buildResult({
      source: 'web',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 8),
      evidence,
      fromCache: outcome.fromCache,
      meta: { manualDiscovery },
    })
  },
}
