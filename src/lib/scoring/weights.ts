/**
 * Category-specific weights for the Digital Viability Score (§19).
 *
 * "Don't use one fixed formula for every name." A crowded npm namespace matters
 * enormously for a developer tool and barely at all for a restaurant; an
 * occupied Instagram handle is close to fatal for a creator brand and a footnote
 * for a B2B SaaS.
 *
 * **Trademark is deliberately absent.** V1 performs no automated trademark
 * research, so no trademark weight may appear here — a weight would imply a
 * measurement we did not take. Trademark work lives in Trademark Assist, is
 * reported as its own separate status, and never enters this number. See
 * `@/lib/trademark`.
 *
 * The weight freed by removing trademark is redistributed toward the surfaces
 * that actually decide whether a name is *usable digitally* in each market,
 * which is what this score now claims to measure.
 *
 * `SCORING_VERSION` is stamped onto every report. Historical reports must stay
 * explainable, so bump it whenever a weight, cap or subscore rule changes.
 */
import type { Category } from '@/lib/core/scan'
import type { SourceId } from '@/lib/core/types'

/**
 * 4 — multiple independent matches now accumulate with diminishing weight,
 * risky sources cannot be averaged away inside a group, and exact-conflict
 * ceilings reflect the evidence severity. Version 3 introduced a fixed exact
 * conflict ceiling; 2 could show 100 beside a confirmed conflict; 1 also
 * folded trademark into the number. Weights themselves are unchanged from 2.
 */
export const SCORING_VERSION = 4

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export const SCORE_GROUPS = [
  'domain',
  'web',
  'github',
  'packages',
  'app_store',
  'play_store',
  'youtube',
  'social',
] as const

export type ScoreGroup = (typeof SCORE_GROUPS)[number]

export const GROUP_LABELS: Record<ScoreGroup, string> = {
  domain: 'Domains',
  web: 'Web & business presence',
  github: 'GitHub',
  packages: 'Developer packages',
  app_store: 'App Store',
  play_store: 'Google Play',
  youtube: 'YouTube',
  social: 'Social identity',
}

/** Which group each source contributes to. */
export const SOURCE_GROUP: Record<SourceId, ScoreGroup> = {
  domain: 'domain',
  web: 'web',
  wikidata: 'web',
  edgar: 'web',
  companies_house: 'web',
  fr_entreprises: 'web',
  gleif: 'web',
  osm: 'web',
  github: 'github',
  npm: 'packages',
  pypi: 'packages',
  crates_io: 'packages',
  rubygems: 'packages',
  nuget: 'packages',
  docker_hub: 'packages',
  homebrew: 'packages',
  app_store: 'app_store',
  // Grouped with Apple's App Store rather than given its own weight slot:
  // both are curated, reviewed software-distribution platforms with real
  // structured data, unlike Google Play (no public API at all — web-search
  // discovery, its own separate group at a much lower confidence ceiling).
  // A dedicated Flathub slot would need redistributing all twelve category
  // weight tables for a niche desktop-Linux audience; sharing the existing
  // app_store slot costs nothing and is the more honest fit anyway.
  flathub: 'app_store',
  play_store: 'play_store',
  youtube: 'youtube',
  socials: 'social',
  social_check: 'social',
  bluesky: 'social',
  // Folded into existing groups rather than given new ones. A new ScoreGroup
  // would mean rebalancing all twelve category weight tables, which must each
  // sum to 100, for sources that are variations on namespaces already covered.
  // Same reasoning as flathub sharing app_store above.
  packagist: 'packages',
  hex: 'packages',
  cran: 'packages',
  vscode_marketplace: 'packages',
  firefox_addons: 'packages',
  steam: 'app_store',
  itch_io: 'app_store',
  pub_dev: 'packages',
  cocoapods: 'packages',
  wordpress_plugins: 'packages',
  anaconda: 'packages',
  hackage: 'packages',
  deno: 'packages',
  cpan: 'packages',
  terraform: 'packages',
  snap_store: 'packages',
  maven_central: 'packages',
  codeberg: 'social',
  vimeo: 'social',
  gravatar: 'social',
  dribbble: 'social',
  behance: 'social',
  soundcloud: 'social',
  product_hunt: 'social',
  hacker_news: 'social',
  f_droid: 'app_store',
  x_twitter: 'social',
  bitbucket: 'social',
  linktree: 'social',
  about_me: 'social',
  flickr: 'social',
  dailymotion: 'social',
  slack: 'social',
  patreon: 'social',
  lastfm: 'social',
  chocolatey: 'packages',
  go_modules: 'packages',
  aur: 'packages',
  roblox: 'social',
  modrinth: 'app_store',
  huggingface: 'packages',
}

/* -------------------------------------------------------------------------- */
/* Weight tables                                                              */
/* -------------------------------------------------------------------------- */

export type WeightTable = Record<ScoreGroup, number>

const w = (partial: Partial<WeightTable>): WeightTable => ({
  domain: 0,
  web: 0,
  github: 0,
  packages: 0,
  app_store: 0,
  play_store: 0,
  youtube: 0,
  social: 0,
  ...partial,
})

/**
 * Every table must sum to 100 — enforced by test, not by convention.
 *
 * Redistribution principle: the weight previously carried by trademark goes to
 * whichever digital surfaces best predict real-world confusion in that market.
 * For a business or a restaurant that is web/business presence; for a developer
 * tool it is package namespaces; for a creator brand it is social and YouTube.
 */
export const CATEGORY_WEIGHTS: Record<Category, WeightTable> = {
  // B2B software is found by search first, so web/business presence absorbs
  // most of the freed weight, with the developer surfaces close behind.
  saas: w({
    web: 34,
    domain: 22,
    github: 14,
    packages: 14,
    social: 7,
    youtube: 4,
    app_store: 3,
    play_store: 2,
  }),

  // The two stores are where a mobile name actually collides.
  mobile_app: w({
    app_store: 27,
    play_store: 27,
    web: 15,
    domain: 12,
    social: 12,
    packages: 4,
    github: 3,
  }),

  // Handles and channels are the identity that matters to a creator.
  creator_brand: w({
    social: 36,
    youtube: 26,
    web: 20,
    domain: 14,
    github: 2,
    app_store: 1,
    play_store: 1,
  }),

  game: w({
    app_store: 20,
    play_store: 20,
    web: 20,
    youtube: 19,
    domain: 12,
    social: 7,
    github: 2,
  }),

  // The one category where a taken npm/PyPI/GitHub namespace is close to fatal.
  developer_tool: w({
    packages: 30,
    github: 29,
    domain: 18,
    web: 17,
    social: 4,
    youtube: 2,
  }),

  business: w({
    web: 45,
    domain: 30,
    social: 14,
    youtube: 5,
    github: 3,
    packages: 3,
  }),

  ecommerce: w({
    web: 40,
    domain: 28,
    social: 19,
    youtube: 6,
    app_store: 4,
    play_store: 3,
  }),

  fashion: w({
    social: 34,
    web: 33,
    domain: 22,
    youtube: 7,
    app_store: 3,
    play_store: 1,
  }),

  // Local businesses collide locally: web presence and social outrank code.
  restaurant: w({
    web: 44,
    social: 27,
    domain: 22,
    youtube: 5,
    app_store: 2,
  }),

  finance: w({
    web: 42,
    domain: 30,
    social: 12,
    app_store: 6,
    play_store: 5,
    github: 5,
  }),

  education: w({
    web: 40,
    domain: 25,
    social: 17,
    youtube: 11,
    app_store: 4,
    play_store: 3,
  }),

  // No category signal, so spread across the identity surfaces rather than
  // pretending to know which one matters.
  other: w({
    web: 31,
    domain: 25,
    social: 14,
    github: 10,
    packages: 8,
    app_store: 5,
    play_store: 4,
    youtube: 3,
  }),
}

/** The weight table for a category. */
export function weightsFor(category: Category): WeightTable {
  return CATEGORY_WEIGHTS[category]
}
