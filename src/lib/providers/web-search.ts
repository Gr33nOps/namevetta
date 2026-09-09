import 'server-only'

/**
 * The web search seam (§23).
 *
 * "Do not marry the entire website to one search API." This interface is what
 * makes the provider a configuration choice rather than an architectural one —
 * we have already swapped Brave for Tavily behind it once without touching a
 * single adapter.
 *
 * Every implementation must be usable on a **free tier with no card on file**.
 * A provider that can silently start billing does not belong here.
 */

export interface SearchHit {
  title: string
  url: string
  /** Snippet or summarised content from the page. */
  content: string
  /** Provider relevance score, 0..1, where supplied. */
  score?: number
}

export interface SearchOptions {
  /**
   * How hard to look. `basic` is the default because it costs one credit;
   * `advanced` costs two and is reserved for cases that genuinely need it.
   */
  depth?: 'basic' | 'advanced'
  maxResults?: number
  /** Restrict to specific hosts, e.g. play.google.com for store discovery. */
  includeDomains?: string[]
  signal?: AbortSignal
}

export interface SearchOutcome {
  hits: SearchHit[]
  /** Credits the provider reported spending, for accurate budget accounting. */
  creditsUsed: number
  fromCache: boolean
}

/** Why a search could not run. Never a silent empty result. */
export type SearchUnavailableReason =
  | 'no_api_key'
  | 'budget_exhausted'
  | 'rate_limited'
  | 'provider_error'

export class SearchUnavailableError extends Error {
  readonly reason: SearchUnavailableReason

  constructor(reason: SearchUnavailableReason, message: string) {
    super(message)
    this.name = 'SearchUnavailableError'
    this.reason = reason
  }
}

export interface WebSearchProvider {
  readonly id: string
  readonly label: string
  /** Credits a basic search costs, for budget maths. */
  readonly basicCost: number
  readonly advancedCost: number

  /**
   * Run one search.
   *
   * Throws `SearchUnavailableError` rather than returning an empty result when
   * it cannot run. An empty array would be indistinguishable from "we searched
   * and found nothing", which is the single most damaging confusion this
   * product can make.
   */
  search(query: string, options?: SearchOptions): Promise<SearchOutcome>

  healthCheck(): Promise<{ healthy: boolean; detail?: string }>
}
