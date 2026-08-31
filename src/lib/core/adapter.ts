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
  /** False only for identifiers retained to read historical reports. */
  active?: false
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
   * Some official APIs can surface public projects but cannot establish that a
   * candidate is free or globally reserved. They stay visible as discovery,
   * not as an automatic availability verdict.
   */
  resultMode?: 'discovery'
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
    // 37 TLDs in batches of six is roughly seven sequential rounds of RDAP,
    // plus the squat-variant probes on a Deep Check. Eight seconds was sized
    // for four lookups and would now time out most scans.
    timeoutMs: 30_000,
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
  fr_entreprises: {
    id: 'fr_entreprises',
    label: 'French company register',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 14 * DAY,
    // A genuine registry with a declared NAF industry code, the same tier as
    // Companies House — just for a different country.
    baseConfidenceCeiling: 95,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'The api.gouv.fr recherche-entreprises API publishes no hard limit; this is a courtesy ceiling.',
    },
  },
  gleif: {
    id: 'gleif',
    label: 'Global LEI register',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 14 * DAY,
    // Genuinely authoritative on registration status, but carries no declared
    // industry code the way Companies House and the French register do, so it
    // sits a step below them.
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'GLEIF publishes no hard limit for this endpoint; this is a courtesy ceiling.',
    },
  },
  osm: {
    id: 'osm',
    label: 'Local business (OpenStreetMap)',
    runsOn: ['deep'],
    timeoutMs: 10_000,
    // Long TTL: a mapped business's name is stable, and this is a tightly
    // rate-limited source worth protecting from repeat scans of the same name.
    cacheTtlSeconds: 14 * DAY,
    // Crowd-mapped, not an official register — real and structured, but not a
    // verified legal identity, the same epistemic tier as the App Store.
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 55,
      documented: true,
      note: "Nominatim's usage policy caps automated use at roughly one request per second; we hold below it.",
    },
  },
  socials: {
    id: 'socials',
    label: 'Social identity',
    runsOn: ['quick', 'deep'],
    timeoutMs: 10_000,
    cacheTtlSeconds: 7 * DAY,
    // Only YouTube and Bluesky handles have a free official verification path.
    // Everything else here is discovery plus a manual link, so this can never
    // read as verified availability (§14). A false green check here is the
    // exact failure mode the whole product exists to avoid.
    baseConfidenceCeiling: 30,
    tosPosture: 'manual_only',
    metered: false,
  },
  social_check: {
    id: 'social_check',
    label: 'Social handles (checked)',
    runsOn: ['quick', 'deep'],
    timeoutMs: 12_000,
    cacheTtlSeconds: 24 * HOUR,
    // Lower than a first-party API like Bluesky's: these are public endpoints
    // answering definitively, but they are profile pages and search endpoints
    // rather than an availability API, and a platform may change its shape
    // without telling anyone. Any ambiguous answer is reported unverified.
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Five sequential public endpoint checks; a courtesy ceiling, not a published one.',
    },
  },
  packagist: {
    id: 'packagist',
    label: 'Packagist (PHP)',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Packagist publishes no rate limit for search; this is a courtesy ceiling.',
    },
  },
  hex: {
    id: 'hex',
    label: 'Hex (Elixir)',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Hex publishes no hard limit for package lookup; courtesy ceiling.',
    },
  },
  cran: {
    id: 'cran',
    label: 'CRAN (R)',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'crandb is a static mirror; courtesy ceiling.',
    },
  },
  vscode_marketplace: {
    id: 'vscode_marketplace',
    label: 'VS Code Marketplace',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'The gallery API publishes no limit; courtesy ceiling.',
    },
  },
  firefox_addons: {
    id: 'firefox_addons',
    label: 'Firefox Add-ons',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'addons.mozilla.org publishes no limit for single lookups; courtesy ceiling.',
    },
  },
  steam: {
    id: 'steam',
    label: 'Steam',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 80,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'The store search endpoint publishes no limit; courtesy ceiling.',
    },
  },
  itch_io: {
    id: 'itch_io',
    label: 'itch.io',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 75,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'A subdomain probe, one request per scan; courtesy ceiling.',
    },
  },
  pub_dev: {
    id: 'pub_dev',
    label: 'pub.dev',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  cocoapods: {
    id: 'cocoapods',
    label: 'CocoaPods',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  wordpress_plugins: {
    id: 'wordpress_plugins',
    label: 'WordPress Plugins',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  anaconda: {
    id: 'anaconda',
    label: 'Anaconda',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  hackage: {
    id: 'hackage',
    label: 'Hackage',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  deno: {
    id: 'deno',
    label: 'Deno',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  cpan: {
    id: 'cpan',
    label: 'CPAN',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  terraform: {
    id: 'terraform',
    label: 'Terraform Registry',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  snap_store: {
    id: 'snap_store',
    label: 'Snap Store',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  maven_central: {
    id: 'maven_central',
    label: 'Maven Central',
    runsOn: ['quick', 'deep'],
    // 8s could not cover an attempt, a backoff and a retry against a Solr host
    // whose slow path is measured in seconds, so the retry almost never ran and
    // six lookups in ten were recorded as failures. 15s fits both attempts.
    timeoutMs: 15_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  codeberg: {
    id: 'codeberg',
    label: 'Codeberg',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  vimeo: {
    id: 'vimeo',
    label: 'Vimeo',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  gravatar: {
    id: 'gravatar',
    label: 'Gravatar',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  dribbble: {
    id: 'dribbble',
    label: 'Dribbble',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  behance: {
    id: 'behance',
    label: 'Behance',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  soundcloud: {
    id: 'soundcloud',
    label: 'SoundCloud',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  product_hunt: {
    id: 'product_hunt',
    label: 'Product Hunt',
    active: false,
    runsOn: [],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  hacker_news: {
    id: 'hacker_news',
    label: 'Hacker News',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  f_droid: {
    id: 'f_droid',
    label: 'F-Droid',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  x_twitter: {
    id: 'x_twitter',
    label: 'X / Twitter',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 70,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  bitbucket: {
    id: 'bitbucket',
    label: 'Bitbucket',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  linktree: {
    id: 'linktree',
    label: 'Linktree',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  about_me: {
    id: 'about_me',
    label: 'About.me',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  flickr: {
    id: 'flickr',
    label: 'Flickr',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  dailymotion: {
    id: 'dailymotion',
    label: 'DailyMotion',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    // Manual-only, so it shares the ceiling every manual source carries. It is
    // deliberately the lowest number in the manifest: a link we hand a person
    // is not a check we performed.
    baseConfidenceCeiling: 30,
    // Downgraded from `official_api` after measurement: `{name}.slack.com`
    // answers 403 with a browser-not-supported page for every workspace that
    // exists, which is a block rather than a verdict. See the adapter.
    tosPosture: 'manual_only',
    metered: false,
  },
  patreon: {
    id: 'patreon',
    label: 'Patreon',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  lastfm: {
    id: 'lastfm',
    label: 'last.fm',
    active: false,
    runsOn: [],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  chocolatey: {
    id: 'chocolatey',
    label: 'Chocolatey',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 85,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  go_modules: {
    id: 'go_modules',
    label: 'Go Modules',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 70,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'One lookup per scan against a public endpoint; a courtesy ceiling, not a published one.',
    },
  },
  bluesky: {
    id: 'bluesky',
    label: 'Bluesky',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 60,
      documented: false,
      note: 'The AT Protocol public API publishes no hard limit for this endpoint; this is a courtesy ceiling.',
    },
  },
  aur: {
    id: 'aur',
    label: 'Arch User Repository',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 7 * DAY,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Public AUR RPC API. Courtesy ceiling.',
    },
  },
  roblox: {
    id: 'roblox',
    label: 'Roblox',
    runsOn: ['quick', 'deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 90,
    tosPosture: 'official_api',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Public Roblox username lookup. Courtesy ceiling.',
    },
  },
  modrinth: {
    id: 'modrinth',
    label: 'Modrinth',
    runsOn: ['deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 50,
    tosPosture: 'official_api',
    resultMode: 'discovery',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Public project search API. Results are discovery evidence, not namespace availability.',
    },
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face',
    runsOn: ['deep'],
    timeoutMs: 8_000,
    cacheTtlSeconds: 24 * HOUR,
    baseConfidenceCeiling: 50,
    tosPosture: 'official_api',
    resultMode: 'discovery',
    metered: false,
    rateLimit: {
      requestsPerMinute: 30,
      documented: false,
      note: 'Public Hub search API. Results are discovery evidence, not namespace availability.',
    },
  },
}

/** Sources that run for a given scan type, in manifest order. */
export function sourcesFor(scanType: ScanType): SourceManifestEntry[] {
  return activeSources().filter((s) => s.runsOn.includes(scanType))
}

/** Active catalog entries. Legacy IDs remain in the schema for old reports. */
export function activeSources(): SourceManifestEntry[] {
  return Object.values(SOURCE_MANIFEST).filter((source) => source.active !== false)
}

export function isActiveSource(id: SourceId): boolean {
  return SOURCE_MANIFEST[id].active !== false
}

/* -------------------------------------------------------------------------- */
/* Counting sources honestly                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How many sources there are, and how many any given search actually asks.
 *
 * These are three different numbers and the site used to print one of them
 * under three different sentences. "All sources checked on every search" was
 * false in two directions: some only run on Deep Research, and some in the
 * Quick set are category-specific or manual and answer nothing on most scans.
 *
 * Everything user-facing derives from here rather than from a literal, so a
 * source added to the manifest updates the copy and a source removed cannot
 * leave a stale number behind.
 */
export interface SourceCounts {
  /** Every active catalog entry, whether or not a given search runs it. */
  catalog: number
  /** Sources a Quick Check asks. */
  quick: number
  /** Sources a Deep Check asks. */
  deep: number
  /** Sources we never assert from automatically — the user checks them. */
  manual: number
  /** Sources that surface public matches but never assert availability. */
  discovery: number
  /** Sources whose answer depends on what is being named (see `play_store`). */
  categoryDependent: number
  /** Sources on the deep set only. */
  deepOnly: number
}

/**
 * Sources that only spend their (metered, shared) budget when the category
 * makes it worth spending.
 *
 * Declared rather than inferred: an adapter that decides for itself whether to
 * run is a fact about the product, and the status page has to be able to say
 * so without importing every adapter to find out.
 */
export const CATEGORY_DEPENDENT_SOURCES: readonly SourceId[] = [
  'play_store',
  'aur',
  'roblox',
  'modrinth',
  'huggingface',
]

/**
 * Free specialist sources a person can opt into outside their chosen category.
 * Google Play is deliberately absent: it consumes a shared web-search credit
 * and remains limited to app and game research.
 */
export const SPECIALIST_SOURCES: readonly SourceId[] = [
  'aur',
  'roblox',
  'modrinth',
  'huggingface',
]

export function isSpecialistSource(id: SourceId): boolean {
  return SPECIALIST_SOURCES.includes(id)
}

export function isCategoryDependent(id: SourceId): boolean {
  return CATEGORY_DEPENDENT_SOURCES.includes(id)
}

export function sourceCounts(): SourceCounts {
  const all = activeSources()
  const quick = all.filter((s) => s.runsOn.includes('quick'))
  const deep = all.filter((s) => s.runsOn.includes('deep'))
  return {
    catalog: all.length,
    quick: quick.length,
    deep: deep.length,
    manual: all.filter((s) => s.tosPosture === 'manual_only').length,
    discovery: all.filter((s) => s.resultMode === 'discovery').length,
    categoryDependent: CATEGORY_DEPENDENT_SOURCES.length,
    deepOnly: deep.filter((s) => !s.runsOn.includes('quick')).length,
  }
}

/** Sources that never run automatically. Listed so the copy can name them. */
export function manualSources(): SourceManifestEntry[] {
  return activeSources().filter((s) => s.tosPosture === 'manual_only')
}
