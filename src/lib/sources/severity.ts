/**
 * Match severity classification.
 *
 * One rule for every source. Severity feeds both the group subscores and the
 * §20 critical caps, so letting each adapter decide independently would make
 * the caps fire inconsistently depending on which source found the conflict.
 */
import type { MatchSeverity, SimilarityBreakdown } from '@/lib/core/types'

export interface SeverityContext {
  /**
   * Whether the conflicting thing is in active use. A dead trademark or an
   * archived repository is real evidence but a much weaker obstacle.
   */
  active?: boolean
  /**
   * True for sources where a name collision is legally meaningful rather than
   * merely inconvenient — trademarks, and registered company names.
   */
  legallyWeighted?: boolean
  /**
   * True when the candidate appears as a whole word inside the match, e.g.
   * "Vault" within "HashiCorp Vault".
   *
   * Length asymmetry crushes the blended similarity for these — "Vault" against
   * "HashiCorp Vault" scores low purely because most of the second string is
   * unmatched — yet somebody naming a product "Vault" plainly needs to see it.
   * Containment is therefore a floor on severity, not a similarity adjustment.
   */
  contained?: boolean
  /**
   * True when the candidate is the *head* of the match's name — "Monzo" in
   * "Monzo Bank Limited" — rather than merely present in it.
   *
   * The distinction is the difference between somebody trading under your name
   * and somebody who happens to use the word. Containment alone tops out at
   * `medium`, which understated an active, same-industry registered company
   * whose name is your name plus a descriptor. Leading escalates that to `high`
   * — but never to `critical`, which stays reserved for a near-exact string.
   */
  leading?: boolean
}

/**
 * Marker a source applies when a match shares the name but has no commercial
 * standing — a person, a place, a fictional character, a colour. Enrichment
 * respects it, so a later severity recompute cannot promote a Gremlins
 * character into a naming conflict.
 */
export const NON_COMMERCIAL_TAG = 'non-commercial'

/** Industry relevance at or above which a contained name is worth escalating. */
const RELATED_INDUSTRY_FLOOR = 50

const NEAR_EXACT = 95
const STRONG = 80
const MODERATE = 65

/**
 * Classify a match.
 *
 * Industry relevance gates the top of the scale: `critical` requires both a
 * near-exact name and a genuinely related field, which is the §18 principle
 * that ENVRYN CLOTHING must not outrank ENVIRON SECURITY SOFTWARE for a
 * cybersecurity product. When industry is unknown we deliberately do not assume
 * relevance, so an unclassified match tops out at `high`.
 */
export function severityFor(
  similarity: SimilarityBreakdown,
  context: SeverityContext = {},
): MatchSeverity {
  const { active = true, legallyWeighted = false } = context
  const { overall, phonetic, industry } = similarity

  // Inactive conflicts drop a step: they are worth showing, not worth blocking.
  const inactivePenalty = active ? 0 : 1

  let level: number
  if (overall >= NEAR_EXACT) level = 4
  else if (overall >= STRONG || phonetic >= 90) level = 3
  else if (overall >= MODERATE) level = 2
  else if (overall >= 40) level = 1
  else level = 0

  // Critical is reserved for a near-exact collision in a demonstrably related
  // field. Without an industry signal we cannot make that claim.
  if (level === 4) {
    const related = industry !== undefined && industry >= 70
    if (!related || !legallyWeighted) level = 3
  }

  let adjusted = Math.max(0, level - inactivePenalty)

  // Containment sets a floor: `medium` when the field is related and the source
  // carries legal weight, `low` otherwise. It never lowers an already-higher
  // reading.
  if (context.contained === true && active) {
    const related = industry !== undefined && industry >= RELATED_INDUSTRY_FLOOR
    let floor = legallyWeighted && related ? 2 : 1
    if (context.leading === true && legallyWeighted && related) floor = 3
    adjusted = Math.max(adjusted, floor)
  }

  return (['none', 'low', 'medium', 'high', 'critical'] as const)[adjusted] ?? 'none'
}
