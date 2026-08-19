/**
 * Wikidata brand and organisation discovery.
 *
 * Zero-dollar and credential-free, but **fair-use limited rather than
 * unmetered**: Wikimedia asks for considerate, identified automated access and
 * publishes no unlimited guarantee. So this adapter runs through the shared
 * limiter and cache, sends an identifying User-Agent, and treats a 429 as "we
 * learned nothing" rather than "nothing found".
 *
 * What it is good at: established companies, products, software and brands that
 * are notable enough to have an entry. What it is *not* good at: small startups
 * and new products. A clean Wikidata result therefore means "not an established
 * brand", not "unused" — and the evidence says so.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { RateLimitedError, throttledFetch } from '@/lib/sources/rate-limit'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { NON_COMMERCIAL_TAG, severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://www.wikidata.org/w/api.php'

const SIMILARITY_FLOOR = 70

interface SearchEntity {
  id: string
  label?: string
  description?: string
  concepturi?: string
}

interface SearchResponse {
  search?: SearchEntity[]
}

/**
 * Descriptions that indicate a commercial entity rather than a person, place or
 * abstract concept. Wikidata is full of villages and given names that happen to
 * collide with brand names; those are not naming conflicts.
 */
const COMMERCIAL_HINTS =
  /\b(compan(y|ies)|corporation|business|brand|software|application|app\b|platform|startup|enterprise|manufacturer|publisher|studio|label|product|service|technolog|bank|retailer)\b/i

/** Entries that are almost never a naming concern for a product. */
const NON_COMMERCIAL_HINTS =
  /\b(village|commune|municipality|given name|surname|family name|genus|species|river|mountain|crater|asteroid|album|song|film|novel)\b/i

export const wikidataAdapter: SourceAdapter = {
  id: 'wikidata',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('wikidata', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const manifest = SOURCE_MANIFEST.wikidata
    let data: SearchResponse | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<SearchResponse | undefined>({
        source: 'wikidata',
        cacheKey: `wikidata:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 30,
        fetcher: async () => {
          const params = new URLSearchParams({
            action: 'wbsearchentities',
            search: ctx.name,
            language: 'en',
            uselang: 'en',
            type: 'item',
            limit: '20',
            format: 'json',
            origin: '*',
          })
          const res = await requestJson<SearchResponse>(`${API}?${params.toString()}`, {
            signal: deps.signal,
            expectedStatuses: [404],
          })
          return res.data
        },
      })
      data = result.value
      fromCache = result.fromCache
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      if (cause instanceof RateLimitedError || err?.code === 'RATE_LIMITED') {
        return unverifiable(
          'wikidata',
          'RATE_LIMITED',
          'Wikidata was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      return unverifiable(
        'wikidata',
        err?.code ?? 'SEARCH_FAILED',
        'Wikidata could not be reached.',
        true,
      )
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    let filteredOut = 0

    for (const entity of data?.search ?? []) {
      const label = entity.label
      if (label === undefined || label.trim() === '') continue

      const description = entity.description ?? ''

      // Drop entries that are clearly not commercial. A village called Envryn
      // tells a founder nothing useful, and surfacing it is a false positive —
      // which §54 counts as a real cost, not a harmless extra.
      if (NON_COMMERCIAL_HINTS.test(description)) {
        filteredOut++
        continue
      }

      const similarity = compareNames(ctx.name, label)
      const isExact = normalize(label) === target
      if (!isExact && similarity.overall < SIMILARITY_FLOOR) continue

      // An exact-name entry with no commercial signal at all is weak evidence;
      // keep it, but do not let it read as a brand collision.
      const commercial = COMMERCIAL_HINTS.test(description)
      const url = entity.concepturi ?? `https://www.wikidata.org/wiki/${entity.id}`

      const match: Match = {
        externalId: entity.id,
        name: label,
        // The tag is load-bearing: enrichment recomputes severity later and
        // would otherwise discard this adapter's judgement that the entry is a
        // person, a fictional character or a colour rather than a brand.
        categories: commercial ? ['wikidata'] : ['wikidata', NON_COMMERCIAL_TAG],
        active: true,
        url,
        similarity,
        severity: commercial ? severityFor(similarity) : 'low',
        evidence: [
          makeEvidence(
            'wikidata',
            description === '' ? `Wikidata entry "${label}"` : `${label}: ${description}`,
            url,
          ),
        ],
        ...(description === '' ? {} : { description }),
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence('wikidata', `Searched Wikidata entities for "${ctx.name}"`),
      makeEvidence(
        'wikidata',
        'Wikidata covers established brands and organisations. A clean result here does not mean the name is unused by smaller companies.',
      ),
    ]
    if (filteredOut > 0) {
      evidence.push(
        makeEvidence(
          'wikidata',
          `${filteredOut} non-commercial ${filteredOut === 1 ? 'entry' : 'entries'} (places, people, species) excluded as irrelevant`,
        ),
      )
    }

    deps.log('wikidata.checked', {
      exact: exactMatches.length,
      similar: similarMatches.length,
      filteredOut,
    })

    return buildResult({
      source: 'wikidata',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 8),
      evidence,
      fromCache,
    })
  },
}
