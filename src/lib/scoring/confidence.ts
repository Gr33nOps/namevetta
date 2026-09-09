/**
 * Confidence and research coverage (§21).
 *
 * These two numbers are what let the product be honest. Confidence says how
 * much a single source's answer is worth; coverage says how much of the
 * intended research actually completed. Coverage is reported *beside* the
 * viability score and never folded into it (§2) — if Instagram could not be
 * verified, the report says so rather than quietly scoring it as free.
 */
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { isVerified, type SourceId, type SourceResult } from '@/lib/core/types'
import { SOURCE_GROUP, type WeightTable } from './weights'

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/** Trailing-window reliability for one source, from the `source_health` table. */
export interface SourceHealth {
  /** Successful calls / total calls over the trailing window, 0..1. */
  successRate: number
  /** Total calls in the window. Below `MIN_HEALTH_SAMPLES` we assume healthy. */
  samples: number
}

export const MIN_HEALTH_SAMPLES = 20

const HEALTH_FLOOR = 0.8
const HEALTH_CEILING = 0.98

/**
 * The smallest multiplier a struggling source can be reduced to.
 *
 * It used to be zero, and zero was a bug with teeth. `computeConfidence`
 * multiplies by this, `SourceResultSchema` refuses a verified result with
 * confidence 0 ("we learned nothing" is incompatible with "we found nothing"),
 * and the orchestrator discards a result that fails the schema as
 * `INVALID_ADAPTER_OUTPUT` — which it then records as another failure. So a
 * source that dipped below 80% success had every *successful* answer thrown
 * away as malformed, pushing it further down, permanently. Maven Central and
 * Bluesky were both stuck in that loop in production, and their
 * `INVALID_ADAPTER_OUTPUT` counts were this, not an adapter bug.
 *
 * A quarter is low enough that a badly degraded source barely moves a score
 * (an 85-ceiling source reports 21) and high enough that the answer it did
 * give is still an answer. Distrusting a source is not the same as discarding
 * it, and the schema is right that only an unverified status may score zero.
 */
const HEALTH_MIN_MULTIPLIER = 0.25

/**
 * Map a source's reliability onto a multiplier (§39: "if a source becomes
 * unreliable, automatically lower confidence").
 *
 * At or above 98% success the source is trusted fully; it degrades linearly to
 * 0.5 at 80%, then keeps degrading — linearly again — to
 * `HEALTH_MIN_MULTIPLIER` at zero success. Never to zero: see above.
 */
export function healthMultiplier(health: SourceHealth | undefined): number {
  if (health === undefined || health.samples < MIN_HEALTH_SAMPLES) return 1
  const { successRate } = health
  if (successRate >= HEALTH_CEILING) return 1
  if (successRate < HEALTH_FLOOR) {
    // Continue the slope below the floor rather than dropping off a cliff, so
    // a source at 79% and one at 5% are not treated identically.
    const ratio = Math.max(0, successRate) / HEALTH_FLOOR
    return HEALTH_MIN_MULTIPLIER + ratio * (0.5 - HEALTH_MIN_MULTIPLIER)
  }
  // Linear from 0.5 at the floor to 1.0 at the ceiling.
  const span = HEALTH_CEILING - HEALTH_FLOOR
  return 0.5 + ((successRate - HEALTH_FLOOR) / span) * 0.5
}

/* -------------------------------------------------------------------------- */
/* Confidence                                                                 */
/* -------------------------------------------------------------------------- */

/** Cached results are very slightly discounted against a fresh fetch. */
const CACHE_FRESHNESS_MULTIPLIER = 0.95

export interface ConfidenceInput {
  source: SourceId
  /** Whether the source produced a usable observation. */
  status: SourceResult['status']
  fromCache: boolean
  health?: SourceHealth
}

/**
 * `confidence = base_ceiling x health x freshness`, clamped to 0..100.
 *
 * A source that could not be verified scores 0 by definition: we learned
 * nothing from it, and that must be visible in coverage rather than hidden.
 */
export function computeConfidence(input: ConfidenceInput): number {
  if (!isVerified(input.status)) return 0

  const ceiling = SOURCE_MANIFEST[input.source].baseConfidenceCeiling
  const health = healthMultiplier(input.health)
  const freshness = input.fromCache ? CACHE_FRESHNESS_MULTIPLIER : 1

  /*
    Floored at 1, not 0.

    `healthMultiplier` no longer returns zero, but rounding still can: a
    ceiling of 30 against a multiplier of 0.01 rounds to nothing. Confidence 0
    on a verified status is a schema violation, and the orchestrator's response
    to a schema violation is to throw the result away — so a rounding artefact
    would silently delete a real finding. The invariant is worth defending in
    both places.
  */
  const raw = ceiling * health * freshness
  return Math.max(1, Math.round(Math.min(100, raw)))
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

export interface CoverageInput {
  /** Every source the scan intended to run — not merely those that answered. */
  intended: readonly SourceId[]
  /** Results actually produced, keyed by source. */
  results: ReadonlyMap<SourceId, Pick<SourceResult, 'status' | 'confidence'>>
  /** Category weights, so coverage reflects what mattered for this scan. */
  weights: WeightTable
}

/**
 * Research coverage, 0..100.
 *
 * Weighted by the same table the score uses, so failing to check trademarks for
 * a SaaS costs far more coverage than failing to check Google Play. A source
 * that did not answer contributes zero — the whole point.
 *
 * Sources whose group carries no weight for this category are excluded
 * entirely: not checking Google Play for a restaurant is not a gap in coverage,
 * because it was never relevant.
 */
export function computeCoverage(input: CoverageInput): number {
  // A group's weight is split across the sources in it, not replicated per
  // source. Replicating it would let coverage be dominated by however many
  // adapters happen to sit in one group — the "web" group has five, so it would
  // account for two thirds of the figure regardless of how much web presence
  // actually matters to the category. Splitting keeps the denominator equal to
  // the sum of the relevant group weights, so coverage reads as a true
  // percentage of the weighted research that completed.
  const sourcesPerGroup = new Map<string, number>()
  for (const source of input.intended) {
    const group = SOURCE_GROUP[source]
    sourcesPerGroup.set(group, (sourcesPerGroup.get(group) ?? 0) + 1)
  }

  let achieved = 0
  let possible = 0

  for (const source of input.intended) {
    const group = SOURCE_GROUP[source]
    const groupWeight = input.weights[group]
    if (groupWeight === 0) continue

    const share = groupWeight / (sourcesPerGroup.get(group) ?? 1)
    possible += share

    const result = input.results.get(source)
    if (result === undefined || !isVerified(result.status)) continue
    achieved += share * (Math.max(0, Math.min(100, result.confidence)) / 100)
  }

  if (possible === 0) return 0
  return Math.round((achieved / possible) * 100)
}
