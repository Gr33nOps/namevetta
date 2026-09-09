/**
 * Apple App Store (§12).
 *
 * Apple's iTunes Search API is public and needs no credentials, but it is
 * **rate-limited, not unmetered** — Apple documents roughly 20 requests per
 * minute. Free of charge and free of limits are different things, so this
 * adapter runs through the shared limiter and response cache, and reports
 * `unable_to_verify` when throttled rather than returning an empty clean result.
 *
 * The framing matters: this endpoint tells us **what already exists on the
 * store**, never that a name is free to use. Results are labelled "existing App
 * Store names" and the manifest caps its confidence at 75 accordingly, because
 * Apple does not adjudicate name availability at search time.
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

const SEARCH = 'https://itunes.apple.com/search'

/** Below this the match is noise rather than a naming concern. */
const SIMILARITY_FLOOR = 65

interface ItunesResult {
  trackId?: number
  trackName?: string
  sellerName?: string
  description?: string
  primaryGenreName?: string
  trackViewUrl?: string
  bundleId?: string
}

interface ItunesResponse {
  resultCount?: number
  results?: ItunesResult[]
}

export const appStoreAdapter: SourceAdapter = {
  id: 'app_store',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const target = normalize(ctx.name)
    if (target.length === 0) {
      return unverifiable('app_store', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const manifest = SOURCE_MANIFEST.app_store
    let payload: ItunesResponse | undefined
    let fromCache = false

    try {
      const result = await throttledFetch<ItunesResponse | undefined>({
        source: 'app_store',
        cacheKey: `app_store:${target}`,
        ttlSeconds: manifest.cacheTtlSeconds,
        requestsPerMinute: manifest.rateLimit?.requestsPerMinute ?? 18,
        fetcher: async () => {
          // `software` covers iPhone, iPad and Mac apps in one query.
          const res = await requestJson<ItunesResponse>(
            `${SEARCH}?term=${encodeURIComponent(ctx.name)}&entity=software&limit=40&country=US`,
            { signal: deps.signal, expectedStatuses: [404] },
          )
          return res.data
        },
      })
      payload = result.value
      fromCache = result.fromCache
    } catch (cause) {
      // Being throttled is not a soft failure. We learned nothing, and the
      // report must say so rather than implying the name is unused on the store.
      const err = cause instanceof SourceRequestError ? cause : undefined
      if (cause instanceof RateLimitedError || err?.code === 'RATE_LIMITED') {
        return unverifiable(
          'app_store',
          'RATE_LIMITED',
          'App Store search was rate-limited and not checked. This is not evidence the name is unused.',
          true,
        )
      }
      return unverifiable(
        'app_store',
        err?.code ?? 'SEARCH_FAILED',
        err?.status === 403
          ? 'The App Store search endpoint rejected the request.'
          : 'The App Store search endpoint could not be reached.',
        true,
      )
    }

    const response = { data: payload }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    for (const app of response.data?.results ?? []) {
      const title = app.trackName
      if (title === undefined || title.trim() === '') continue

      const similarity = compareNames(ctx.name, title)
      const isExact = normalize(title) === target
      // "Stripe Dashboard" scores ~60% against "Stripe" purely because of length,
      // yet it is plainly relevant. Containment rescues that case.
      const contains = containsNameAsWord(ctx.name, title)
      if (!isExact && !contains && similarity.overall < SIMILARITY_FLOOR) continue

      const url = app.trackViewUrl
      const match: Match = {
        externalId: String(app.trackId ?? app.bundleId ?? title),
        name: title,
        categories: app.primaryGenreName === undefined ? [] : [app.primaryGenreName],
        active: true,
        similarity,
        // Containment is itself a relevance signal, so a match rescued by it is
        // floored at `low` rather than showing as "Not a concern" — an app
        // literally called "Pay for Stripe" is worth seeing when naming Stripe.
        severity:
          !isExact && contains && severityFor(similarity) === 'none'
            ? 'low'
            : severityFor(similarity),
        evidence: [
          makeEvidence(
            'app_store',
            isExact ? `Existing App Store app named "${title}"` : `Similar app "${title}"`,
            url,
          ),
        ],
        ...(url === undefined ? {} : { url }),
        ...(app.sellerName === undefined ? {} : { owner: app.sellerName }),
        // App descriptions run to thousands of words; the opening lines carry
        // the positioning, which is all the industry classifier needs.
        ...(app.description === undefined
          ? {}
          : { description: app.description.slice(0, 400) }),
      }

      if (isExact) exactMatches.push(match)
      else similarMatches.push(match)
    }

    similarMatches.sort((a, b) => b.similarity.overall - a.similarity.overall)

    const evidence: Evidence[] = [
      makeEvidence(
        'app_store',
        `Searched existing App Store names for "${ctx.name}" (${response.data?.resultCount ?? 0} results scanned)`,
      ),
      // Said plainly: Apple does not tell us whether a name may be used.
      makeEvidence(
        'app_store',
        'This lists apps that already exist on the App Store. Apple does not confirm name availability.',
      ),
    ]

    deps.log('app_store.checked', {
      exact: exactMatches.length,
      similar: similarMatches.length,
    })

    return buildResult({
      source: 'app_store',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches: similarMatches.slice(0, 10),
      evidence,
      fromCache,
    })
  },
}
