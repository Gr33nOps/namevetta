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
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
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
 * The ceiling an exact, confirmed collision puts on the score.
 *
 * 69 lands the number one point below `promising`, so the verdict beside it
 * can never read "Mostly Clear" while a source underneath says the exact name
 * is already claimed. Chosen for that reason rather than as a round figure:
 * the verdict bands are what a reader actually acts on.
 */
const CONFIRMED_CONFLICT_MAX = 69

/**
 * Sources whose exact match is a namespace collision worth capping for.
 *
 * Every source that reports `confirmed_conflict` with an exact match
 * qualifies. There is deliberately no allow-list: the bug this closes was a
 * confirmed CPAN conflict sitting beside a score of 100 because CPAN lands in
 * the `packages` group, which carries zero weight for a restaurant. Category
 * relevance is allowed to decide *how much* a conflict costs — it is not
 * allowed to decide whether the reader is told about it.
 */
export interface DecisiveConflict {
  source: SourceId
  /** The colliding name as the source spells it. */
  name: string
  url?: string
}

/**
 * Every confirmed, exact collision in a result set.
 *
 * `confirmed_conflict` on its own is not enough: the schema permits it with
 * evidence and no match, which is a weaker claim. An `exactMatches` entry is
 * the specific thing a reader can go and look at.
 */
export function decisiveConflicts(results: readonly SourceResult[]): DecisiveConflict[] {
  const out: DecisiveConflict[] = []
  for (const r of results) {
    if (r.status !== 'confirmed_conflict') continue
    for (const m of r.exactMatches) {
      out.push({ source: r.source, name: m.name, ...(m.url === undefined ? {} : { url: m.url }) })
    }
  }
  return out
}

/**
 * Detect the digital conditions that cap the score (§20).
 *
 * Two now. The first is the original: an exact, major, same-industry business
 * presence found through web research, which caps hard at 40 because that is a
 * name somebody is already trading under.
 *
 * The second is new, and closes the hole the audit found. A weighted average
 * over the groups that answered can produce a perfect 100 while a source
 * inside a zero-weight group reports an exact, confirmed collision — a report
 * that says "100" and "confirmed conflict" on the same screen is not a report
 * anyone should trust. So any confirmed exact collision ceilings the number
 * below the "Mostly Clear" band, and the weighting still decides where under
 * that ceiling it lands.
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

  const conflicts = decisiveConflicts(results)
  if (conflicts.length > 0) {
    const first = conflicts[0] as DecisiveConflict
    caps.push({
      reason:
        conflicts.length === 1
          ? `Exact conflict confirmed on ${SOURCE_MANIFEST[first.source].label}`
          : `${conflicts.length} exact conflicts confirmed, including ${SOURCE_MANIFEST[first.source].label}`,
      maximum: CONFIRMED_CONFLICT_MAX,
    })
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
  /**
   * Exact, confirmed collisions, whatever weight their group carries.
   *
   * Carried on the result rather than recomputed by each reader, so the score,
   * the verdict and the banner above them are all looking at the same list.
   */
  conflicts: DecisiveConflict[]
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
    conflicts: decisiveConflicts(input.results),
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

/**
 * The conclusion shown to a person. A confirmed exact collision is a
 * decision-critical fact, so it outranks a category-weighted score even when
 * that score was already capped. This keeps the label, the banner and the
 * evidence in agreement for both new and stored reports.
 */
export function dominantVerdict(score: number, results: readonly SourceResult[]): Verdict {
  return decisiveConflicts(results).length > 0 ? 'risky' : verdictFor(score)
}
