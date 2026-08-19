/**
 * GLEIF — the global Legal Entity Identifier register.
 *
 * Companies House and the French register each cover one country. GLEIF is
 * different: any legal entity anywhere that has ever obtained an LEI (banks,
 * funds, and an increasing number of ordinary companies, since many
 * jurisdictions now require one for regulated activity) is in here, with a
 * clear live/lapsed registration status. It is the closest thing to a global
 * company register this product can use for free.
 *
 * No declared industry code comes with an LEI record, unlike Companies House's
 * SIC or the French register's NAF — so a GLEIF match never carries an
 * industry classification. That is a real gap, not a guess papered over: the
 * README states it, and `severityFor` already refuses to reach `critical`
 * without one.
 *
 * Free, no API key, no documented rate limit — a courtesy ceiling applies, as
 * with every other source in that position.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { RateLimitedError, throttledFetch } from '@/lib/sources/rate-limit'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames, containsNameAsWord, leadsWithName } from '@/lib/similarity/score'

const API = 'https://api.gleif.org/api/v1'

const SIMILARITY_FLOOR = 72

interface LeiRecord {
  id: string
  attributes: {
    entity?: {
      legalName?: { name?: string }
      jurisdiction?: string
      status?: string
    }
    registration?: {
      status?: string
    }
  }
}

interface SearchResponse {
  data?: LeiRecord[]
  meta?: { pagination?: { total?: number } }
}

/** Live means both the entity and its registration read as current. */
function isActive(entityStatus: string | undefined, registrationStatus: string | undefined): boolean {
  if (entityStatus !== undefined && entityStatus !== 'ACTIVE') return false
  if (registrationStatus === 'LAPSED') return false
  return true
}

export const gleifAdapter: SourceAdapter = {
  id: 'gleif',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('gleif', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const manifest = SOURCE_MANIFEST.gleif

    let data: SearchResponse | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<SearchResponse | undefined>({
        source: 'gleif',
        cacheKey: `gleif:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 60,
        fetcher: async () => {
          const response = await requestJson<SearchResponse>(
            `${API}/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(ctx.name)}&page%5Bsize%5D=25`,
            { signal: deps.signal, expectedStatuses: [404] },
          )
          return response.data
        },
      })
      data = result.value
      fromCache = result.fromCache
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      if (cause instanceof RateLimitedError || err?.code === 'RATE_LIMITED') {
        return unverifiable(
          'gleif',
          'RATE_LIMITED',
          'The global LEI register was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      return unverifiable('gleif', err?.code ?? 'SEARCH_FAILED', 'The global LEI register could not be reached.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    const seen = new Set<string>()

    for (const record of data?.data ?? []) {
      const title = record.attributes.entity?.legalName?.name
      if (title === undefined || title.trim() === '') continue

      const isExact = normalize(title) === target
      const similarity = compareNames(ctx.name, title)
      const contains = containsNameAsWord(ctx.name, title)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      const dedupeKey = normalize(title)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const active = isActive(record.attributes.entity?.status, record.attributes.registration?.status)
      const url = `https://search.gleif.org/#/record/${record.id}`
      const jurisdiction = record.attributes.entity?.jurisdiction

      const detail = [
        active ? 'active registration' : 'lapsed or inactive registration',
        jurisdiction === undefined ? undefined : `jurisdiction ${jurisdiction}`,
        `LEI ${record.id}`,
      ].filter((part): part is string => part !== undefined)

      const match: Match = {
        externalId: record.id,
        name: title,
        categories: ['legal-entity'],
        active,
        url,
        similarity,
        // Legally meaningful like any registered company name, but never
        // reaches critical here: no industry code accompanies an LEI, and
        // `severityFor` correctly refuses to escalate a field it cannot place.
        severity: severityFor(similarity, {
          active,
          legallyWeighted: true,
          contained: contains,
          leading: leadsWithName(ctx.name, title),
        }),
        evidence: [makeEvidence('gleif', `${title}: ${detail.join(', ')}`, url)],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const total = data?.meta?.pagination?.total ?? 0
    const evidence: Evidence[] = [
      makeEvidence(
        'gleif',
        `Searched the global LEI register for "${ctx.name}": ${total} ${total === 1 ? 'result' : 'results'}`,
      ),
      makeEvidence(
        'gleif',
        'Covers legal entities that hold a Legal Entity Identifier — mainly regulated and financial entities, not every company everywhere. No industry code comes with an LEI record, so a match here never escalates past the ceiling severity reaches without one.',
      ),
    ]

    deps.log('gleif.checked', { exact: exactMatches.length, similar: similarMatches.length, fromCache })

    return buildResult({
      source: 'gleif',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 6),
      evidence,
      fromCache,
    })
  },
}
