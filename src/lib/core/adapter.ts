/**
 * The source adapter contract and the manifest that describes every source.
 *
 * Adding a source means implementing `SourceAdapter` and adding one manifest
 * entry. Nothing else in the product changes (§6, §41).
 */
import type { ScanContext, ScanType } from './scan'
import type { SourceId, SourceResult } from './types'

/* -------------------------------------------------------------------------- */
/* Adapter                                                                    */
/* -------------------------------------------------------------------------- */

export interface AdapterDeps {
  /** Abort signal carrying the per-source timeout. Adapters must honour it. */
  signal: AbortSignal
  /** Structured logger scoped to this source + scan. */
  log: (event: string, data?: Record<string, unknown>) => void
}

export interface SourceAdapter {
  readonly id: SourceId
  /**
   * Run the check. Adapters should let errors throw — the orchestrator converts
   * a throw into a well-formed `unable_to_verify` result, so no adapter needs
   * to duplicate that handling.
   */
  run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult>
}

/* -------------------------------------------------------------------------- */
/* ToS posture                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How we are entitled to obtain this data. `scrape` is present only so the type
 * can express it — nothing in this product is allowed to use it, and a manifest
 * entry declaring it fails the manifest test.
 */
export type TosPosture =
  /** First-party documented API, used within its published terms. */
  | 'official_api'
  /** Public protocol with no ToS gate, e.g. RDAP, DNS. */
  | 'open_protocol'
  /** Third-party search index we pay/query legitimately. */
  | 'search_index'
  /** Human follows a link we render; we assert nothing automatically. */
  | 'manual_only'
  /** Forbidden. Declared here only to make the prohibition explicit. */
  | 'scrape'

/* -------------------------------------------------------------------------- */
/* Manifest                                                                   */
/* -------------------------------------------------------------------------- */

export interface SourceManifestEntry {
  id: SourceId
  /** Shown in the progressive results list (§58). */
  label: string
  /** Which scan types run this source. */
  runsOn: readonly ScanType[]
  /** Per-source timeout in ms. One slow source must never stall a scan (§57). */
  timeoutMs: number
  /**
   * Cache TTL in seconds. Deliberately per-source: a trademark record and a web
   * search result do not go stale at the same rate (§34).
   */
  cacheTtlSeconds: number
  /**
   * Maximum confidence this source can ever report, before health and freshness
   * multipliers (§21). An official first-party API earns 95; a web-derived
   * inference earns far less and can never be dressed up as certainty.
   */
  baseConfidenceCeiling: number
  tosPosture: TosPosture
  /**
   * True when the source consumes a metered external quota (Brave credits,
   * Groq tokens). The orchestrator checks the budget guard before running it.
   */
  metered: boolean
  /**
   * Request-rate ceiling we hold ourselves to.
   *
   * Separate from `metered`: a source can cost nothing and still be strictly
   * rate-limited. Apple documents ~20 requests/minute; Wikidata operates a
   * fair-use policy rather than an unmetered guarantee. Declaring the limit here
   * lets the shared limiter enforce it, and — critically — lets a throttled
   * source report `unable_to_verify` instead of an empty clean result.
   */
  rateLimit?: {
    requestsPerMinute: number
    /** Whether the provider publishes this number, or we inferred a safe one. */
    documented: boolean
    note: string
  }
}

const HOUR = 3600
const DAY = 24 * HOUR

/**
 * Confidence ceilings follow §21: official first-party data is trusted, web
 * inference is not, and anything we cannot verify automatically tops out low
 * enough that it can never read as a green check.
 */
export const SOURCE_MANIFEST: Record<SourceId, SourceManifestEntry> = {
  domain: {
    id: 'domain',
    label: 'Domains',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 6 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'open_protocol',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'RDAP servers are operated per-registry and vary. This is a conservative shared ceiling.',
    },
  },
  github: {
    id: 'github',
    label: 'GitHub',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 50,
      documented: true,
      note: 'GitHub allows 5,000 authenticated requests/hour, or only 60 unauthenticated.',
    },
  },
  npm: {
    id: 'npm',
    label: 'npm',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'The npm registry publishes no hard limit; this is a courtesy ceiling.',
    },
  },
  pypi: {
    id: 'pypi',
    label: 'PyPI',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'PyPI asks for considerate use of the JSON API; this is a courtesy ceiling.',
    },
  },
  crates_io: {
    id: 'crates_io',
    label: 'crates.io',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 55,
      documented: true,
      note: "crates.io's crawler policy asks for no more than 1 request/second; we hold below it and require an identifying User-Agent on every call.",
    },
  },
  rubygems: {
    id: 'rubygems',
    label: 'RubyGems',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'RubyGems publishes no hard limit for the read API; this is a courtesy ceiling.',
    },
  },
  nuget: {
    id: 'nuget',
    label: 'NuGet',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'NuGet publishes no hard limit for the public feed; this is a courtesy ceiling.',
    },
  },
  docker_hub: {
    id: 'docker_hub',
    label: 'Docker Hub',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 12 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'Docker Hub publishes no hard limit for the public read API; this is a courtesy ceiling.',
    },
  },
  homebrew: {
    id: 'homebrew',
    label: 'Homebrew',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'formulae.brew.sh is a static JSON API with no published limit and no search endpoint, so this probes the exact name plus close variants, the same shape as PyPI.',
    },
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: true,
      note: 'YouTube Data API bills quota units per call: channels.list costs 1, search.list costs 100, against 10,000/day.',
    },
  },
  app_store: {
    id: 'app_store',
    label: 'App Store',
    runsOn: ['quick', 'deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 24 * HOUR,
    // Official, but a search endpoint rather than an availability authority:
    // it tells us what exists, never that a name is free to use (§12).
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 18,
      documented: true,
      note: 'Apple documents roughly 20 requests per minute for the iTunes Search API. We hold below it.',
    },
  },
  flathub: {
    id: 'flathub',
    label: 'Flathub',
    runsOn: ['quick', 'deep'],
    timeoutMs: 10_000,
    // The app list itself is fetched at most once a day (see the adapter);
    // this is the cache TTL for the resulting SourceResult, kept shorter
    // since a specific search outcome is cheaper to recompute than the
    // download is to repeat.
    cacheTtlSeconds: 24 * HOUR,
    // Official id list, but the display name is inferred from the id rather
    // than published directly — the same epistemic tier as the iTunes Search
    // API, for the same reason: real and structured, but not a verified name.
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'Flathub publishes no rate limit for this endpoint; it is fetched at most once a day per process, so this ceiling is never approached in practice.',
    },
  },
  play_store: {
    id: 'play_store',
    label: 'Google Play',
    runsOn: ['quick', 'deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 24 * HOUR,
    // No official public search API exists, so this is web-index discovery and
    // is capped accordingly. It must never carry first-party weight (§13).
    baseConfidenceCeiling: 50,
    tosPosture: 'search_index',
    metered: true,
    rateLimit: {
      requestsPerMinute: 20,
      documented: true,
      note: 'Runs through the same metered provider as `web`, and only for categories where an app store actually matters.',
    },
  },
  web: {
    id: 'web',
    label: 'Web presence',
    runsOn: ['deep'],
    timeoutMs: 15_000,
    // Long TTL on purpose: web presence for a given name is stable, and this is
    // the metered source whose free quota binds the whole product (§8 of plan).
    cacheTtlSeconds: 30 * DAY,
    baseConfidenceCeiling: 50,
    tosPosture: 'search_index',
    metered: true,
    rateLimit: {
      requestsPerMinute: 20,
      documented: true,
      note: 'Tavily free tier is 1,000 credits/month and a basic search costs one. Budget-guarded, cached for 30 days, one request per Deep Check.',
    },
  },
  wikidata: {
    id: 'wikidata',
    label: 'Wikidata',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 14 * DAY,
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Wikimedia asks for reasonable, identified use rather than publishing a hard number. This is a self-imposed ceiling.',
    },
  },
  edgar: {
    id: 'edgar',
    label: 'SEC EDGAR',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 14 * DAY,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: true,
      note: 'SEC fair-access policy caps automated traffic at 10 requests/second and requires an identifying User-Agent. We stay far below it and fetch the company list once per day.',
    },
  },
  companies_house: {
    id: 'companies_house',
    label: 'Companies House (UK)',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 14 * DAY,
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: true,
      note: 'Companies House documents 600 requests per five minutes per API key.',
    },
  },
  socials: {
    id: 'socials',
    label: 'Social identity',
    runsOn: ['quick', 'deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 7 * DAY,
    // Only YouTube handles have a free official verification path. Everything
    // else is discovery plus a manual link, so this can never read as verified
    // availability (§14). A false green check here is the exact failure mode
    // the whole product exists to avoid.
    baseConfidenceCeiling: 30,
    tosPosture: 'manual_only',
    metered: false,
  },
}

/** Sources that run for a given scan type, in manifest order. */
export function sourcesFor(scanType: ScanType): SourceManifestEntry[] {
  return Object.values(SOURCE_MANIFEST).filter((s) => s.runsOn.includes(scanType))
}
