/**
 * Core domain contract for NameVetta.
 *
 * Every source adapter — no matter how different the upstream API — returns a
 * `SourceResult`. Zod is the source of truth: schemas here validate adapter
 * output at the boundary, so a malformed upstream response degrades to
 * `unable_to_verify` rather than silently corrupting a report.
 *
 * Roadmap refs: §2 (never claim more certainty than the source provides),
 * §6 (source architecture), §21 (confidence system).
 */
import { z } from 'zod'

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

export const SOURCE_IDS = [
  'domain',
  'github',
  'npm',
  'pypi',
  'crates_io',
  'rubygems',
  'nuget',
  'docker_hub',
  'homebrew',
  'youtube',
  'app_store',
  'play_store',
  'flathub',
  'web',
  'wikidata',
  'edgar',
  'companies_house',
  'fr_entreprises',
  'gleif',
  'osm',
  'socials',
  'social_check',
  'bluesky',
  'packagist',
  'hex',
  'cran',
  'vscode_marketplace',
  'firefox_addons',
  'steam',
  'itch_io',
  'pub_dev',
  'cocoapods',
  'wordpress_plugins',
  'anaconda',
  'hackage',
  'deno',
  'cpan',
  'terraform',
  'snap_store',
  'maven_central',
  'codeberg',
  'vimeo',
  'gravatar',
  'dribbble',
  'behance',
  'soundcloud',
  'product_hunt',
  'hacker_news',
  'f_droid',
  'x_twitter',
  'bitbucket',
  'linktree',
  'about_me',
  'flickr',
  'dailymotion',
  'slack',
  'patreon',
  'lastfm',
  'chocolatey',
  'go_modules',
  'aur',
  'roblox',
  'modrinth',
  'huggingface',
] as const

export const SourceIdSchema = z.enum(SOURCE_IDS)
export type SourceId = z.infer<typeof SourceIdSchema>

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The five outcomes a check may report (§2). There is deliberately no
 * "available" — availability is a claim we are rarely entitled to make.
 *
 * - `no_conflict`              search completed, nothing meaningful found
 * - `similar_found`            needs investigation
 * - `confirmed_conflict`       exact / very strong conflict
 * - `unable_to_verify`         source failed, unsupported, or quota exhausted
 * - `manual_check_recommended` automatic evidence is not reliable enough
 */
export const SOURCE_STATUSES = [
  'no_conflict',
  'similar_found',
  'confirmed_conflict',
  'unable_to_verify',
  'manual_check_recommended',
] as const

export const SourceStatusSchema = z.enum(SOURCE_STATUSES)
export type SourceStatus = z.infer<typeof SourceStatusSchema>

/**
 * One platform's own answer, inside a source that covers several.
 *
 * Two adapters check a handful of networks each and report as a single
 * source, which is right for scoring — the weight table has one slot for
 * social identity, not nine. It is wrong for reading: a row labelled "Social
 * identity" tells you nothing, and the platform a reader cares about is
 * Instagram or LinkedIn by name.
 *
 * So those adapters also publish this, on `meta.platforms`, and the results
 * list renders a row per entry. It carries no weight of its own and changes
 * no score; it exists so the page can say which platform it means.
 */
export const DiscoveryMatchSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().max(500).optional(),
})
export type DiscoveryMatch = z.infer<typeof DiscoveryMatchSchema>

export const PlatformVerdictSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  status: SourceStatusSchema,
  detail: z.string().min(1),
  discovery: z.array(DiscoveryMatchSchema).max(5).optional(),
  /** A discovery source completed, even if it did not surface a match. */
  discoveryChecked: z.boolean().optional(),
})
export type PlatformVerdict = z.infer<typeof PlatformVerdictSchema>

/** Statuses that represent a completed, trustworthy observation. */
export const VERIFIED_STATUSES: readonly SourceStatus[] = [
  'no_conflict',
  'similar_found',
  'confirmed_conflict',
]

/**
 * True when the source produced a usable observation. `unable_to_verify` and
 * `manual_check_recommended` are explicitly *not* verified — they must never
 * render as a green check, and they contribute 0 to research coverage.
 */
export function isVerified(status: SourceStatus): boolean {
  return VERIFIED_STATUSES.includes(status)
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A verifiable pointer backing a claim. Every material finding carries at
 * least one, so a user can check our work (§59 "View Evidence", §64 item 5).
 */
export const EvidenceSchema = z.object({
  /** Short human-readable label, e.g. "USPTO serial 88123456". */
  label: z.string().min(1),
  /** Canonical URL a human can open to verify. */
  url: z.string().url().optional(),
  /** Verbatim snippet from the source, if any. Never paraphrased. */
  snippet: z.string().max(2000).optional(),
  /** Which source produced this. */
  source: SourceIdSchema,
  /** When the underlying observation was made. */
  observedAt: z.string().datetime({ offset: true }),
})
export type Evidence = z.infer<typeof EvidenceSchema>

/* -------------------------------------------------------------------------- */
/* Matches                                                                    */
/* -------------------------------------------------------------------------- */

/** Per-dimension similarity, 0-100. Populated by the similarity engine (§16). */
export const SimilarityBreakdownSchema = z.object({
  text: z.number().min(0).max(100),
  phonetic: z.number().min(0).max(100),
  visual: z.number().min(0).max(100),
  /** Relevance of the match industry to the user industry, 0-100 (§18). */
  industry: z.number().min(0).max(100).optional(),
  /** Blended headline figure. */
  overall: z.number().min(0).max(100),
})
export type SimilarityBreakdown = z.infer<typeof SimilarityBreakdownSchema>

/** How strongly an individual match conflicts with the candidate name. */
export const MATCH_SEVERITIES = ['none', 'low', 'medium', 'high', 'critical'] as const
export const MatchSeveritySchema = z.enum(MATCH_SEVERITIES)
export type MatchSeverity = z.infer<typeof MatchSeveritySchema>

export const MatchSchema = z.object({
  /** Stable identity within the source, e.g. npm package name, USPTO serial. */
  externalId: z.string().min(1),
  /** The competing name as the source spells it. */
  name: z.string().min(1),
  /**
   * The form to compare against, when it differs from the display name.
   *
   * A company register returns "MONZO BANK LIMITED": the legal suffix is real
   * and belongs on screen, but scoring "Monzo" against it drags the similarity
   * down over three characters of boilerplate every UK company carries. The
   * adapter strips those once and records the result here so later re-scoring
   * compares like for like instead of silently undoing the work.
   */
  comparisonName: z.string().min(1).optional(),
  /** Owning entity where known (company, org, publisher, registrant). */
  owner: z.string().optional(),
  /** Free-text description used for industry classification. */
  description: z.string().max(4000).optional(),
  /** Source-native classification, e.g. Nice classes, app store category. */
  categories: z.array(z.string()).default([]),
  /** Whether the match appears to be in active use. */
  active: z.boolean().optional(),
  url: z.string().url().optional(),
  similarity: SimilarityBreakdownSchema,
  severity: MatchSeveritySchema,
  evidence: z.array(EvidenceSchema).default([]),
})
export type Match = z.infer<typeof MatchSchema>

/* -------------------------------------------------------------------------- */
/* SourceResult                                                               */
/* -------------------------------------------------------------------------- */

export const SourceErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
})
export type SourceError = z.infer<typeof SourceErrorSchema>

/**
 * The single shape every adapter returns (§6). Replacing a source means
 * replacing one adapter, not rewriting the product.
 *
 * The refinements below encode the honesty principle as data invariants, so a
 * buggy adapter fails loudly at the boundary instead of producing a report that
 * looks confident and is not.
 */
export const SourceResultSchema = z
  .object({
    source: SourceIdSchema,
    status: SourceStatusSchema,
    /** 0-100, see `computeConfidence` in @/lib/scoring/confidence. */
    confidence: z.number().min(0).max(100),
    exactMatches: z.array(MatchSchema).default([]),
    similarMatches: z.array(MatchSchema).default([]),
    evidence: z.array(EvidenceSchema).default([]),
    checkedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    error: SourceErrorSchema.optional(),
    /** Whether this result was served from cache rather than fetched fresh. */
    fromCache: z.boolean().default(false),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((r, ctx) => {
    // An unverifiable source cannot also be asserting conflicts.
    if (!isVerified(r.status) && (r.exactMatches.length > 0 || r.similarMatches.length > 0)) {
      ctx.addIssue({
        code: 'custom',
        message: `status "${r.status}" must not carry matches - it did not complete a trustworthy search`,
        path: ['status'],
      })
    }
    // Confidence 0 means we learned nothing; only an unverified state can say that.
    if (r.confidence === 0 && isVerified(r.status)) {
      ctx.addIssue({
        code: 'custom',
        message: 'confidence 0 is incompatible with a verified status',
        path: ['confidence'],
      })
    }
    // A failure must explain itself.
    if (r.status === 'unable_to_verify' && !r.error) {
      ctx.addIssue({
        code: 'custom',
        message: 'unable_to_verify requires an error explaining why',
        path: ['error'],
      })
    }
    // A confirmed conflict is a strong claim; it must be backed by evidence.
    if (r.status === 'confirmed_conflict' && r.evidence.length === 0 && r.exactMatches.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'confirmed_conflict requires evidence or an exact match',
        path: ['evidence'],
      })
    }
  })

export type SourceResult = z.infer<typeof SourceResultSchema>

