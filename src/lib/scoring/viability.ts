/**
 * The Digital Viability Score (§19, §20, §50).
 *
 * Turns a set of `SourceResult`s into the numbers the report shows. Three rules
 * shape everything here:
 *
 *  1. Sources that could not be verified are *excluded* from the score rather
 *     than counted as clean. Their absence shows up in coverage instead (§2).
 *  2. A critical conflict caps the score outright. Averaging cannot be allowed
 *     to produce "88/100 Amazing!" for a name with a direct same-industry
 *     collision against it (§20).
 *  3. **The score is digital only.** It measures whether a name is usable across
 *     domains, code namespaces, app stores, social handles and the open web. It
 *     is not a trademark assessment and never becomes one. Trademark work is
 *     tracked separately in `@/lib/trademark` and reported beside this number,
 *     never folded into it.
 */
import type { Category } from '@/lib/core/scan'
import {
  isVerified,
  type Match,
  type MatchSeverity,
  type SourceId,
  type SourceResult,
} from '@/lib/core/types'
import type { ScreeningStatus, TrademarkScreening } from '@/lib/trademark/provider'
import { SCORING_VERSION, SOURCE_GROUP, weightsFor, type ScoreGroup } from './weights'

/* -------------------------------------------------------------------------- */
/* Subscores                                                                  */
/* -------------------------------------------------------------------------- */

const SEVERITY_PENALTY: Record<MatchSeverity, number> = {
  none: 0,
  low: 15,
  medium: 35,
  high: 60,
  critical: 90,
}

function strongestMatch(result: SourceResult): Match | undefined {
  const all = [...result.exactMatches, ...result.similarMatches]
  if (all.length === 0) return undefined
  return all.reduce((worst, m) =>
    SEVERITY_PENALTY[m.severity] > SEVERITY_PENALTY[worst.severity] ? m : worst,
  )
}

/**
 * Subscore for one source, 0..100, or `null` when the source contributes
 * nothing because it could not be verified.
 *
 * `null` is deliberately distinct from `0`: a failed check is not evidence of a
 * conflict, and treating it as one would scare users off good names just as
 * badly as false-greening would reassure them about bad ones.
 */
export function sourceSubscore(result: SourceResult): number | null {
  if (!isVerified(result.status)) return null
  if (result.status === 'no_conflict') return 100

  const worst = strongestMatch(result)
  if (worst === undefined) {
    return result.status === 'confirmed_conflict' ? 10 : 85
  }

  const penalty = SEVERITY_PENALTY[worst.severity] * (worst.similarity.overall / 100)
  return Math.max(0, Math.min(100, Math.round(100 - penalty)))
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export interface GroupScore {
  group: ScoreGroup
  /** 0..100, or null when no source in the group produced a usable answer. */
  subscore: number | null
  weight: number
  contributors: SourceId[]
}

function groupSubscore(results: readonly SourceResult[]): {
  subscore: number | null
  contributors: SourceId[]
} {
  let weighted = 0
  let totalConfidence = 0
  const contributors: SourceId[] = []

  for (const r of results) {
    const sub = sourceSubscore(r)
    if (sub === null || r.confidence === 0) continue
    weighted += sub * r.confidence
    totalConfidence += r.confidence
    contributors.push(r.source)
  }

  if (totalConfidence === 0) return { subscore: null, contributors }
  return { subscore: Math.round(weighted / totalConfidence), contributors }
}

/* -------------------------------------------------------------------------- */
/* Critical caps                                                              */
/* -------------------------------------------------------------------------- */

export interface AppliedCap {
  reason: string
  maximum: number
}

const SAME_INDUSTRY_THRESHOLD = 70

/**
 * Detect the digital conditions that cap the score (§20).
 *
 * Only one cap survives the V1 trademark removal: an exact, major, same-industry
 * business presence found through web research. The two trademark caps are gone
 * from the automatic path because V1 performs no automated trademark research —
 * a cap fired from evidence we never gathered would be fabricated.
 *
 * Trademark findings can still cap, but only once the user has actually
 * completed screening; that path is `screeningCaps` below.
 */
export function detectCaps(results: readonly SourceResult[]): AppliedCap[] {
  const caps: AppliedCap[] = []

  const webMatches: Match[] = []
  for (const r of results) {
    if (!isVerified(r.status)) continue
    if (SOURCE_GROUP[r.source] !== 'web') continue
    webMatches.push(...r.exactMatches, ...r.similarMatches)
  }

  const majorSameIndustryBusiness = webMatches.some(
    (m) =>
      m.similarity.overall >= 95 &&
      (m.similarity.industry ?? 0) >= SAME_INDUSTRY_THRESHOLD &&
      (m.severity === 'high' || m.severity === 'critical'),
  )
  if (majorSameIndustryBusiness) {
    caps.push({ reason: 'Exact major same-industry business', maximum: 40 })
  }

  return caps
}

/* -------------------------------------------------------------------------- */
/* Trademark advisory                                                         */
/* -------------------------------------------------------------------------- */

export type TrademarkConcern = 'unknown' | 'low' | 'medium' | 'high' | 'critical'

export interface TrademarkAdvisory {
  status: ScreeningStatus
  concern: TrademarkConcern
  /** Plain statement of what this does and does not tell the user. */
  summary: string
}

/**
 * Summarise trademark screening for display beside the score.
 *
 * The concern level is `unknown` for anything short of a completed screening.
 * There is no state in which an unfinished trademark check produces a
 * reassuring reading — that is the single most important rule in this file.
 */
export function trademarkAdvisory(screening: TrademarkScreening | undefined): TrademarkAdvisory {
  if (screening === undefined || screening.status === 'not_started') {
    return {
      status: 'not_started',
      concern: 'unknown',
      summary:
        'No trademark research has been done. The score beside this covers digital presence only.',
    }
  }

  if (screening.status === 'in_progress') {
    return {
      status: 'in_progress',
      concern: 'unknown',
      summary: 'Trademark research is partly done. Nothing can be concluded from it yet.',
    }
  }

  if (screening.status === 'unable_to_verify') {
    return {
      status: 'unable_to_verify',
      concern: 'unknown',
      summary: 'Trademark research could not be completed. Treat the name as unscreened.',
    }
  }

  // Completed. Derive concern from what the user reported and from any imported
  // registry rows, taking the worst signal available.
  const reportedConflict = screening.checks.some((c) => c.outcome === 'possible_conflict')
  const reportedUnclear = screening.checks.some((c) => c.outcome === 'unclear')
  const importedWorst = screening.importedMatches.reduce<MatchSeverity>((worst, m) => {
    return SEVERITY_PENALTY[m.severity] > SEVERITY_PENALTY[worst] ? m.severity : worst
  }, 'none')

  if (importedWorst === 'critical' || (reportedConflict && importedWorst === 'high')) {
    return {
      status: 'completed',
      concern: 'critical',
      summary: 'A direct conflict was identified. Speak to a trademark professional before proceeding.',
    }
  }
  if (reportedConflict || importedWorst === 'high') {
    return {
      status: 'completed',
      concern: 'high',
      summary: 'A possible conflict was identified and needs professional review.',
    }
  }
  if (reportedUnclear || importedWorst === 'medium') {
    return {
      status: 'completed',
      concern: 'medium',
      summary: 'The results were ambiguous. A professional search is worthwhile.',
    }
  }

  return {
    status: 'completed',
    concern: 'low',
    summary:
      'You reported no obvious conflict in the registries you searched. This is preliminary research, not legal clearance.',
  }
}

/* -------------------------------------------------------------------------- */
/* Viability                                                                  */
/* -------------------------------------------------------------------------- */

export interface ViabilityInput {
  category: Category
  results: readonly SourceResult[]
}

export interface ViabilityResult {
  /** Final 0..100 Digital Viability Score, after caps. */
  score: number
  /** Score before caps — kept so the report can explain the drop. */
  rawScore: number
  caps: AppliedCap[]
  groups: GroupScore[]
  scoringVersion: number
}

/**
 * Compute the Digital Viability Score.
 *
 * Weights renormalize over the groups that actually produced an answer, so a
 * Quick Check is not punished for running fewer sources — the gap is reported
 * through coverage instead. This is the §2 separation applied to arithmetic.
 */
export function computeViability(input: ViabilityInput): ViabilityResult {
  const weights = weightsFor(input.category)

  const byGroup = new Map<ScoreGroup, SourceResult[]>()
  for (const r of input.results) {
    const group = SOURCE_GROUP[r.source]
    const bucket = byGroup.get(group)
    if (bucket === undefined) byGroup.set(group, [r])
    else bucket.push(r)
  }

  const groups: GroupScore[] = []
  let weightedTotal = 0
  let effectiveWeight = 0

  for (const [group, weight] of Object.entries(weights) as [ScoreGroup, number][]) {
    const groupResults = byGroup.get(group) ?? []
    const { subscore, contributors } = groupSubscore(groupResults)
    groups.push({ group, subscore, weight, contributors })

    if (weight === 0 || subscore === null) continue
    weightedTotal += subscore * weight
    effectiveWeight += weight
  }

  const rawScore = effectiveWeight === 0 ? 0 : Math.round(weightedTotal / effectiveWeight)

  const caps = detectCaps(input.results)
  const ceiling = caps.reduce((min, cap) => Math.min(min, cap.maximum), 100)

  return {
    score: Math.min(rawScore, ceiling),
    rawScore,
    caps,
    groups,
    scoringVersion: SCORING_VERSION,
  }
}

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

export type Verdict = 'strong' | 'promising' | 'mixed' | 'risky' | 'avoid'

export const VERDICT_LABELS: Record<Verdict, string> = {
  strong: 'Clear',
  promising: 'Mostly Clear',
  mixed: 'Review',
  risky: 'Conflict',
  avoid: 'Serious Conflict',
}

/** Map a Digital Viability Score onto the label shown beside it (§1, §59). */
export function verdictFor(score: number): Verdict {
  if (score >= 85) return 'strong'
  if (score >= 70) return 'promising'
  if (score >= 50) return 'mixed'
  if (score >= 30) return 'risky'
  return 'avoid'
}
