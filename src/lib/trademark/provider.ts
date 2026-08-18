/**
 * The trademark module boundary.
 *
 * V1 performs **no automated trademark research**. There is no bulk corpus, no
 * TSDR automation, no EUIPO integration, no WIPO querying, and nothing is
 * scraped. What V1 ships is Trademark Assist: a guided workflow that prepares
 * the user to search the official free registries themselves.
 *
 * This file exists so that stays a *product* decision rather than an
 * architectural one. `TrademarkProvider` is the seam an automated jurisdiction
 * plugs into later — USPTO, EUIPO, or any national office — without
 * restructuring the application. `TRADEMARK_PROVIDERS` is deliberately empty;
 * registering one is the whole integration.
 *
 * Roadmap: V1 Trademark Assist. Automated providers are a future optional
 * module, not a removed capability.
 */
import { z } from 'zod'
import type { Match } from '@/lib/core/types'

/* -------------------------------------------------------------------------- */
/* Jurisdictions                                                              */
/* -------------------------------------------------------------------------- */

export const JURISDICTIONS = ['us', 'eu', 'international'] as const
export const JurisdictionSchema = z.enum(JURISDICTIONS)
export type Jurisdiction = z.infer<typeof JurisdictionSchema>

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  us: 'United States',
  eu: 'European Union',
  international: 'International',
}

/* -------------------------------------------------------------------------- */
/* Screening status                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Where the user has got to with trademark research.
 *
 * `not_started` is the default and is never a passing state. Nothing in the
 * product may render an incomplete screening as clear, available, or safe.
 */
export const SCREENING_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'unable_to_verify',
] as const

export const ScreeningStatusSchema = z.enum(SCREENING_STATUSES)
export type ScreeningStatus = z.infer<typeof ScreeningStatusSchema>

/**
 * What the user concluded, when they completed a search themselves.
 *
 * Self-reported and labelled as such wherever it is shown. `unclear` exists so
 * an honest "I could not tell" has somewhere to go other than a false negative.
 */
export const SCREENING_OUTCOMES = ['no_obvious_conflict', 'possible_conflict', 'unclear'] as const
export const ScreeningOutcomeSchema = z.enum(SCREENING_OUTCOMES)
export type ScreeningOutcome = z.infer<typeof ScreeningOutcomeSchema>

export const JurisdictionCheckSchema = z.object({
  jurisdiction: JurisdictionSchema,
  status: ScreeningStatusSchema.default('not_started'),
  outcome: ScreeningOutcomeSchema.optional(),
  /** Free-text note the user recorded about what they saw. */
  note: z.string().max(2000).optional(),
  completedAt: z.string().datetime().optional(),
})
export type JurisdictionCheck = z.infer<typeof JurisdictionCheckSchema>

export const TrademarkScreeningSchema = z.object({
  status: ScreeningStatusSchema.default('not_started'),
  checks: z.array(JurisdictionCheckSchema).default([]),
  /**
   * Matches from a user-imported export, when that optional feature is used.
   * Empty in the default V1 flow — the product must not depend on it.
   */
  importedMatches: z.array(z.custom<Match>()).default([]),
})
export type TrademarkScreening = z.infer<typeof TrademarkScreeningSchema>

export function emptyScreening(): TrademarkScreening {
  return { status: 'not_started', checks: [], importedMatches: [] }
}

/**
 * Roll individual jurisdiction checks up into one overall status.
 *
 * Conservative by construction: the overall status is `completed` only when
 * every jurisdiction the user was offered has actually been completed. Partial
 * progress is `in_progress`, never done.
 */
export function rollUpScreening(checks: readonly JurisdictionCheck[]): ScreeningStatus {
  if (checks.length === 0) return 'not_started'
  if (checks.every((c) => c.status === 'completed')) return 'completed'
  if (checks.every((c) => c.status === 'not_started')) return 'not_started'
  if (checks.some((c) => c.status === 'completed' || c.status === 'in_progress')) {
    return 'in_progress'
  }
  return 'unable_to_verify'
}

/* -------------------------------------------------------------------------- */
/* Provider seam                                                              */
/* -------------------------------------------------------------------------- */

export interface TrademarkQuery {
  /** The exact candidate name. */
  name: string
  /** Ranked spelling and phonetic variants worth searching. */
  variants: string[]
  /** Nice classes believed relevant, e.g. ['009', '042']. */
  classes: string[]
  /** User-supplied product description, for goods/services relevance. */
  description?: string
}

export interface TrademarkSearchResult {
  jurisdiction: Jurisdiction
  matches: Match[]
  /** Whether the provider completed a trustworthy search. */
  status: Extract<ScreeningStatus, 'completed' | 'unable_to_verify'>
  error?: { code: string; message: string; retryable: boolean }
}

/**
 * An automated trademark source.
 *
 * Nothing implements this in V1. It is the documented extension point: adding
 * USPTO or EUIPO later means writing one of these and registering it, with no
 * change to scoring, scanning, or the report.
 *
 * An implementation must be able to run for free and within the registry's
 * published terms, or it does not belong in this product.
 */
export interface TrademarkProvider {
  readonly id: string
  readonly jurisdiction: Jurisdiction
  /** Human-readable name of the registry, shown as provenance. */
  readonly label: string
  search(query: TrademarkQuery, signal: AbortSignal): Promise<TrademarkSearchResult>
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>
}

/**
 * Registered automated providers.
 *
 * Intentionally empty in V1. When this is non-empty, the Deep Check can run
 * those jurisdictions automatically and Trademark Assist covers only the rest.
 */
export const TRADEMARK_PROVIDERS: TrademarkProvider[] = []

export function providerFor(jurisdiction: Jurisdiction): TrademarkProvider | undefined {
  return TRADEMARK_PROVIDERS.find((p) => p.jurisdiction === jurisdiction)
}

/** True when any jurisdiction can be researched automatically. */
export function hasAutomatedProviders(): boolean {
  return TRADEMARK_PROVIDERS.length > 0
}

/* -------------------------------------------------------------------------- */
/* Imported results                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Parser for a user-supplied export from an official registry.
 *
 * Several registries let a user download their own search results. Where the
 * format is documented and stable we can analyse that file locally and apply
 * the full similarity engine to it. Where it is not, we do not guess.
 *
 * V1 must not depend on this: it is an optional convenience behind a clean
 * adapter, and the guided workflow is complete without it.
 */
export interface TrademarkImportParser {
  readonly id: string
  readonly jurisdiction: Jurisdiction
  readonly label: string
  /** Accepted file extensions, e.g. ['.csv']. */
  readonly extensions: string[]
  /** Quick check before attempting a full parse. */
  canParse(sample: string): boolean
  parse(content: string): { rows: RawTrademarkRow[]; warnings: string[] }
}

/** A registry row, before the similarity engine is applied to it. */
export interface RawTrademarkRow {
  mark: string
  owner?: string
  status?: string
  classes?: string[]
  goodsServices?: string
  filingDate?: string
  reference?: string
  url?: string
}

/** Registered import parsers. Empty until a format is verified as reliable. */
export const TRADEMARK_IMPORT_PARSERS: TrademarkImportParser[] = []
