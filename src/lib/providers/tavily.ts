import 'server-only'

/**
 * Tavily search provider — free tier only.
 *
 * Chosen over Brave for one decisive reason: Tavily's free tier needs **no card
 * on file**, so there is no path by which this product can start costing money.
 * Brave's free tier required a card for verification, which is a standing risk
 * the project's zero-cost constraint does not accept.
 *
 * Budget discipline, in order of how much each saves:
 *
 *  1. **Cache first.** A cache hit spends nothing, so repeat research on the
 *     same name across a whole month costs one credit, not one per scan.
 *  2. **One request per Deep Check.** Tavily returns synthesised results across
 *     many sources in a single call, so the multi-query pattern a raw search
 *     API forces is unnecessary here.
 *  3. **`basic` depth.** One credit, versus two for `advanced`.
 *  4. **A hard monthly ceiling** below the free allowance, enforced in Postgres.
 *
 * PAYGO is never enabled, and the key is read server-side only and never logged.
 */
import { env } from '@/lib/env'
import { consumeProviderBudget } from '@/lib/db/quota'
import { isDatabaseConfigured } from '@/lib/db/client'
import { cacheGet, cacheSet, acquire, RateLimitedError } from '@/lib/sources/rate-limit'
import {
  SearchUnavailableError,
  type SearchOptions,
  type SearchOutcome,
  type WebSearchProvider,
} from './web-search'

const ENDPOINT = 'https://api.tavily.com/search'
export const TAVILY_PROVIDER_ID = 'tavily'

/** Free tier is 1,000 credits/month; we stop well below it. */
const REQUESTS_PER_MINUTE = 20

/**
 * Cache TTL for search results.
 *
 * 30 days is deliberate. Web presence for a given name is stable over weeks,
 * and this is the single biggest lever on staying inside the free allowance —
 * far more effective than trimming queries.
 */
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60

interface TavilyResult {
  title?: string
  url?: string
  content?: string
  score?: number
}

interface TavilyResponse {
  results?: TavilyResult[]
  usage?: { credits?: number }
}

function cacheKey(query: string, options: SearchOptions): string {
  const depth = options.depth ?? 'basic'
  const domains = (options.includeDomains ?? []).join(',')
  return `tavily:${depth}:${domains}:${query.toLowerCase().trim()}`
}

export const tavilyProvider: WebSearchProvider = {
  id: TAVILY_PROVIDER_ID,
  label: 'Tavily',
  basicCost: 1,
  advancedCost: 2,

  async search(query: string, options: SearchOptions = {}): Promise<SearchOutcome> {
    const key = env().TAVILY_API_KEY
    if (key === undefined) {
      throw new SearchUnavailableError(
        'no_api_key',
        'Web research is not configured on this deployment.',
      )
    }

    // 1. Cache. A hit spends no credit and no rate-limit token.
    const cached = cacheGet<SearchOutcome>(cacheKey(query, options))
    if (cached !== undefined) {
      return { ...cached, fromCache: true }
    }

    const depth = options.depth ?? 'basic'
    const cost = depth === 'advanced' ? tavilyProvider.advancedCost : tavilyProvider.basicCost

    // 2. Monthly budget, enforced atomically in Postgres so concurrent scans
    //    cannot both slip past the ceiling. Charged per credit, so an advanced
    //    search consumes two units of allowance.
    if (isDatabaseConfigured()) {
      for (let i = 0; i < cost; i++) {
        const allowed = await consumeProviderBudget(TAVILY_PROVIDER_ID, env().WEB_SEARCH_MONTHLY_BUDGET)
        if (!allowed) {
          throw new SearchUnavailableError(
            'budget_exhausted',
            'The monthly web-research allowance is used up. It resets at the start of next month.',
          )
        }
      }
    }

    // 3. Local burst limiting, so a traffic spike cannot hammer the provider.
    try {
      acquire(TAVILY_PROVIDER_ID, REQUESTS_PER_MINUTE)
    } catch (cause) {
      if (cause instanceof RateLimitedError) {
        throw new SearchUnavailableError(
          'rate_limited',
          'Web research was rate-limited and not run.',
        )
      }
      throw cause
    }

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          // Server-side only. Never logged, never returned to the client.
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          search_depth: depth,
          max_results: options.maxResults ?? 10,
          topic: 'general',
          include_answer: false,
          ...(options.includeDomains === undefined
            ? {}
            : { include_domains: options.includeDomains }),
        }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
    } catch {
      throw new SearchUnavailableError('provider_error', 'The search provider could not be reached.')
    }

    if (response.status === 429) {
      throw new SearchUnavailableError('rate_limited', 'The search provider rate-limited us.')
    }
    if (response.status === 401 || response.status === 403) {
      // Do not echo the response body: it can contain the key or account detail.
      throw new SearchUnavailableError('no_api_key', 'The search provider rejected our credentials.')
    }
    if (!response.ok) {
      throw new SearchUnavailableError(
        'provider_error',
        `The search provider returned ${response.status}.`,
      )
    }

    let data: TavilyResponse
    try {
      data = (await response.json()) as TavilyResponse
    } catch {
      throw new SearchUnavailableError('provider_error', 'The search provider returned malformed JSON.')
    }

    const outcome: SearchOutcome = {
      hits: (data.results ?? [])
        .filter((r): r is TavilyResult & { url: string } => typeof r.url === 'string')
        .map((r) => ({
          title: r.title ?? r.url,
          url: r.url,
          content: r.content ?? '',
          ...(typeof r.score === 'number' ? { score: r.score } : {}),
        })),
      // Trust the provider's own accounting over our estimate where given.
      creditsUsed: data.usage?.credits ?? cost,
      fromCache: false,
    }

    cacheSet(cacheKey(query, options), outcome, CACHE_TTL_SECONDS)
    return outcome
  },

  async healthCheck() {
    return env().TAVILY_API_KEY === undefined
      ? { healthy: false, detail: 'No API key configured' }
      : { healthy: true }
  },
}
