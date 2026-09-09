/**
 * Name comparison (§26, §52).
 *
 * Ranks 2–5 researched candidates and explains the outcome from the evidence
 * that produced it — never from a generated narrative.
 *
 * The honesty problem comparison introduces, which single-name reports do not
 * have: **two candidates can be scored from different amounts of evidence.** If
 * `Envryn` completed 90% of its intended checks and `Vaultara` only 50%, their
 * scores are not directly comparable, and quietly ranking one above the other
 * would be exactly the false confidence this product exists to avoid. So
 * coverage disparity is detected and surfaced rather than smoothed over.
 */
import type { ScanSummary } from '@/lib/orchestrator/run'
import { GROUP_LABELS, type ScoreGroup } from '@/lib/scoring/weights'
import { dominantVerdict, type Verdict } from '@/lib/scoring/viability'

export interface Candidate {
  name: string
  summary: ScanSummary
}

export interface RankedCandidate {
  /** Generator-only RDAP observation, separate from overall research scores. */
  domain?: { name: string; checkedAt: string }
  name: string
  /** 1-based position. Ties share a rank. */
  rank: number
  score: number
  coverage: number
  verdict: Verdict
  /** Per-group subscores, null where the group produced no usable answer. */
  groups: { group: ScoreGroup; label: string; subscore: number | null }[]
  /** Groups where this candidate clearly beats the field. */
  strengths: string[]
  /** Groups where this candidate clearly trails the leader. */
  weaknesses: string[]
  /** Caps that fired, which matter more than any group difference. */
  caps: string[]
}

export interface ComparisonResult {
  candidates: RankedCandidate[]
  /** The top-ranked name, or undefined when the result is genuinely a tie. */
  winner: string | undefined
  /** Plain explanation of why the winner leads, grounded in group differences. */
  winnerReason: string
  /**
   * Set when candidates were researched to materially different depths, which
   * makes their scores less comparable than they look.
   */
  coverageWarning: string | undefined
  /** True when the top two are close enough that the order is not meaningful. */
  tooCloseToCall: boolean
}

/** Below this gap the leader is not meaningfully ahead. */
const DECISIVE_MARGIN = 5

/** A group difference worth mentioning in an explanation. */
const NOTABLE_GROUP_GAP = 15

/** Coverage spread beyond this makes scores unsafe to compare directly. */
const COVERAGE_DISPARITY = 20

function groupsOf(summary: ScanSummary): { group: ScoreGroup; label: string; subscore: number | null }[] {
  return summary.viability.groups
    // Groups carrying no weight for this category were never relevant.
    .filter((g) => g.weight > 0)
    .map((g) => ({ group: g.group, label: GROUP_LABELS[g.group], subscore: g.subscore }))
}

/**
 * Compare candidates and explain the ordering.
 *
 * Every explanation is derived from the group scores actually computed. Nothing
 * here invents a rationale, and where the evidence does not support a clear
 * answer it says so instead of manufacturing one.
 */
export function compareCandidates(candidates: readonly Candidate[]): ComparisonResult {
  const scored = candidates.map((c) => ({
    name: c.name,
    score: c.summary.viability.score,
    coverage: c.summary.coverage,
    verdict: dominantVerdict(c.summary.viability.score, c.summary.results),
    groups: groupsOf(c.summary),
    caps: c.summary.viability.caps.map((cap) => cap.reason),
  }))

  const ordered = [...scored].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const leader = ordered[0]
  const runnerUp = ordered[1]

  const margin =
    leader !== undefined && runnerUp !== undefined ? leader.score - runnerUp.score : 0
  const tooCloseToCall = ordered.length > 1 && margin < DECISIVE_MARGIN

  // Rank with ties sharing a position, so two names on 88 are both 1st.
  const ranked: RankedCandidate[] = ordered.map((c, index) => {
    const rank = ordered.findIndex((other) => other.score === c.score) + 1
    return {
      name: c.name,
      rank,
      score: c.score,
      coverage: c.coverage,
      verdict: c.verdict,
      groups: c.groups,
      caps: c.caps,
      strengths: strengthsOf(c, ordered),
      weaknesses: index === 0 ? [] : weaknessesAgainst(c, leader),
    }
  })

  return {
    candidates: ranked,
    winner: tooCloseToCall ? undefined : leader?.name,
    winnerReason: explainLeader(leader, runnerUp, ordered, tooCloseToCall),
    coverageWarning: coverageWarningFor(ordered),
    tooCloseToCall,
  }
}

interface Scored {
  name: string
  score: number
  coverage: number
  groups: { group: ScoreGroup; label: string; subscore: number | null }[]
  caps: string[]
}

/** Groups where this candidate beats the average of the others notably. */
function strengthsOf(candidate: Scored, all: readonly Scored[]): string[] {
  const others = all.filter((c) => c.name !== candidate.name)
  if (others.length === 0) return []

  const out: string[] = []
  for (const group of candidate.groups) {
    if (group.subscore === null) continue

    const comparable = others
      .map((o) => o.groups.find((g) => g.group === group.group)?.subscore)
      .filter((v): v is number => v !== null && v !== undefined)
    if (comparable.length === 0) continue

    const average = comparable.reduce((a, b) => a + b, 0) / comparable.length
    if (group.subscore - average >= NOTABLE_GROUP_GAP) out.push(group.label)
  }
  return out
}

/** Groups where this candidate trails the leader notably. */
function weaknessesAgainst(candidate: Scored, leader: Scored | undefined): string[] {
  if (leader === undefined) return []

  const out: string[] = []
  for (const group of candidate.groups) {
    if (group.subscore === null) continue
    const leaderScore = leader.groups.find((g) => g.group === group.group)?.subscore
    if (leaderScore === null || leaderScore === undefined) continue
    if (leaderScore - group.subscore >= NOTABLE_GROUP_GAP) out.push(group.label)
  }
  return out
}

function explainLeader(
  leader: Scored | undefined,
  runnerUp: Scored | undefined,
  all: readonly Scored[],
  tooClose: boolean,
): string {
  if (leader === undefined) return 'No candidates were researched.'
  if (runnerUp === undefined) return `${leader.name} was the only candidate researched.`

  if (tooClose) {
    const tied = all.filter((candidate) => candidate.score === leader.score).map((candidate) => candidate.name)
    if (tied.length > 2) {
      const last = tied.at(-1)
      const first = tied.slice(0, -1).join(', ')
      return `${first} and ${last} are tied at ${leader.score}. Compare the individual findings below instead.`
    }
    return `${leader.name} and ${runnerUp.name} score within ${DECISIVE_MARGIN} points of each other. That gap is too small to call one better. Compare the individual findings below instead.`
  }

  // A cap on the runner-up is the most decisive thing that can happen, so it
  // leads the explanation when present.
  if (runnerUp.caps.length > 0 && leader.caps.length === 0) {
    return `${leader.name} leads because ${runnerUp.name} hit a hard limit: ${runnerUp.caps[0]?.toLowerCase()}. That caps its score regardless of how it performs elsewhere.`
  }

  const gaps = leader.groups
    .map((group) => {
      const rival = runnerUp.groups.find((g) => g.group === group.group)?.subscore
      if (group.subscore === null || rival === null || rival === undefined) return undefined
      return { label: group.label, gap: group.subscore - rival }
    })
    .filter((g): g is { label: string; gap: number } => g !== undefined && g.gap >= NOTABLE_GROUP_GAP)
    .sort((a, b) => b.gap - a.gap)

  if (gaps.length === 0) {
    return `${leader.name} leads ${runnerUp.name} by ${leader.score - runnerUp.score} points, spread across several areas rather than driven by any single one.`
  }

  const named = gaps.slice(0, 2).map((g) => g.label.toLowerCase())
  const list = named.length === 2 ? `${named[0]} and ${named[1]}` : named[0]
  return `${leader.name} leads mainly on ${list}, where it scores clearly higher than ${runnerUp.name}.`
}

/**
 * Warn when candidates were researched to different depths.
 *
 * This is the comparison-specific honesty rule. A name that scores 92 from half
 * the checks is not demonstrably better than one scoring 88 from all of them,
 * and presenting them as a ranked list implies a confidence the evidence does
 * not support.
 */
function coverageWarningFor(candidates: readonly Scored[]): string | undefined {
  if (candidates.length < 2) return undefined

  const coverages = candidates.map((c) => c.coverage)
  const highest = Math.max(...coverages)
  const lowest = Math.min(...coverages)
  if (highest - lowest < COVERAGE_DISPARITY) return undefined

  const weakest = candidates.find((c) => c.coverage === lowest)
  return `These names were not researched to the same depth. Coverage ranges from ${lowest}% to ${highest}%. ${weakest?.name ?? 'One candidate'} has the least evidence behind it, so its score is the least reliable here. Compare the completed checks rather than the totals alone.`
}
