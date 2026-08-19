/**
 * Local business presence via OpenStreetMap (Nominatim search).
 *
 * The gap this closes: no source in the product answers "is there already a
 * restaurant, shop or local business trading under this name," which is
 * exactly the conflict that matters for a restaurant, a salon, a local
 * agency — categories where Companies House, npm and GitHub say nothing
 * useful. Tavily can surface a business's website, but a small local business
 * often has none; OpenStreetMap is crowd-mapped from the physical world and
 * frequently has it anyway.
 *
 * Restricted to categories that plausibly represent an operating business
 * (`amenity`, `shop`, `office`, `tourism`, `craft`) — Nominatim indexes every
 * kind of place, and a mountain or a bus stop sharing the candidate's name is
 * not a naming conflict.
 *
 * Nominatim's usage policy caps automated use at roughly one request per
 * second and requires an identifying User-Agent, which every request through
 * `@/lib/sources/http` already sends by default.
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
import { compareNames, containsNameAsWord } from '@/lib/similarity/score'

const API = 'https://nominatim.openstreetmap.org'

/** Categories that represent an operating business, not a geographic feature. */
const BUSINESS_CATEGORIES = new Set(['amenity', 'shop', 'office', 'tourism', 'craft'])

const SIMILARITY_FLOOR = 65

interface NominatimResult {
  osm_id: number
  name?: string
  display_name: string
  category: string
  type: string
  lat: string
  lon: string
}

export const osmAdapter: SourceAdapter = {
  id: 'osm',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('osm', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const manifest = SOURCE_MANIFEST.osm

    let results: NominatimResult[] | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<NominatimResult[] | undefined>({
        source: 'osm',
        cacheKey: `osm:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 55,
        fetcher: async () => {
          const response = await requestJson<NominatimResult[]>(
            `${API}/search?q=${encodeURIComponent(ctx.name)}&format=jsonv2&limit=15&addressdetails=0`,
            { signal: deps.signal, expectedStatuses: [404] },
          )
          return response.data
        },
      })
      results = result.value
      fromCache = result.fromCache
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      if (cause instanceof RateLimitedError || err?.code === 'RATE_LIMITED') {
        return unverifiable(
          'osm',
          'RATE_LIMITED',
          'OpenStreetMap was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      return unverifiable('osm', err?.code ?? 'SEARCH_FAILED', 'OpenStreetMap could not be reached.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []
    let ignored = 0
    const seen = new Set<string>()

    for (const place of results ?? []) {
      if (!BUSINESS_CATEGORIES.has(place.category)) {
        ignored++
        continue
      }
      const title = place.name
      if (title === undefined || title.trim() === '') continue

      const isExact = normalize(title) === target
      const similarity = compareNames(ctx.name, title)
      const contains = containsNameAsWord(ctx.name, title)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      // Same name, same place — Dishoom has multiple London branches, and one
      // per (name, rough location) is the naming-relevant question, not every
      // individual branch.
      const dedupeKey = `${normalize(title)}:${place.lat.slice(0, 4)}:${place.lon.slice(0, 4)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const url = `https://www.openstreetmap.org/${place.osm_id > 0 ? 'node' : 'way'}/${Math.abs(place.osm_id)}`

      const match: Match = {
        externalId: String(place.osm_id),
        name: title,
        // Type/category ride along as classification hints — free when they
        // happen to land on a real taxonomy node, harmless when they don't.
        categories: ['osm', place.category, place.type],
        // Whether a mapped business is still trading cannot be determined from
        // this endpoint alone, so it is left unstated rather than assumed —
        // `severityFor` treats an unstated `active` as true, the same
        // conservative default every other source uses when it genuinely
        // cannot tell.
        url,
        description: place.display_name,
        similarity,
        severity: severityFor(similarity, {
          legallyWeighted: true,
          contained: contains,
        }),
        evidence: [makeEvidence('osm', `${title} — ${place.display_name}`, url)],
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence('osm', `Searched OpenStreetMap for places named "${ctx.name}"`),
      makeEvidence(
        'osm',
        'OpenStreetMap is crowd-mapped, not an official register. A clean result means nothing mapped was found, not that no such business exists.',
      ),
    ]
    if (ignored > 0) {
      evidence.push(
        makeEvidence(
          'osm',
          `${ignored} ${ignored === 1 ? 'result was' : 'results were'} geographic features, not businesses, and excluded`,
        ),
      )
    }

    deps.log('osm.checked', { exact: exactMatches.length, similar: similarMatches.length, fromCache })

    return buildResult({
      source: 'osm',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 8),
      evidence,
      fromCache,
    })
  },
}
