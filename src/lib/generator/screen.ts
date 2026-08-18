/**
 * Screening pipeline (§12).
 *
 * "Generate, auto Quick Check, discard failures, return top 5" — the
 * generator's whole value proposition is that a candidate a user sees has
 * actually been researched, not merely invented. This is the step that makes
 * that true: every AI-suggested name runs through the identical Quick Check
 * orchestrator a single search uses, no shortcut version.
 */
import { MAX_COMPARE_NAMES, type Category, type ScanContext } from '@/lib/core/scan'
import { isVerified, type SourceId } from '@/lib/core/types'
import { compareCandidates, type Candidate, type ComparisonResult } from '@/lib/compare/rank'
import { runScanToCompletion, type ScanSummary } from '@/lib/orchestrator/run'

/**
 * Sources whose *exact* conflict is disqualifying for a freshly-invented name.
 *
 * These are the binary, unambiguous ones the PDF's spec names — "occupied
 * brands, bad domains, crowded web names, namespace conflicts" — deliberately
 * excluding trademark (V1 does no automated trademark research, so there is
 * nothing honest to check here) and excluding sources whose exact match is a
 * matter of degree rather than a hard occupancy fact (Wikidata, web presence).
 * An exact hit on any of these means someone else already has this name in a
 * place that matters, which a Quick Check candidate can't talk its way past.
 */
const DISQUALIFYING_SOURCES: readonly SourceId[] = ['domain', 'github', 'npm', 'pypi']

/** Below this score a name is not worth showing even with no exact conflict. */
const MINIMUM_SCORE = 45

export interface ScreenedCandidate {
  name: string
  summary: ScanSummary
}

export interface DisqualifiedCandidate {
  name: string
  reason: string
}

export interface ScreeningResult {
  /** Every candidate that passed screening, most survivors typically more than 5. */
  survivors: ScreenedCandidate[]
  disqualified: DisqualifiedCandidate[]
  /**
   * The top `MAX_COMPARE_NAMES` survivors by score, run back through the same
   * comparison logic Compare Names uses — "return the top 5" means exactly
   * that: `ranked.candidates` is bounded, `survivors` above is not.
   */
  ranked: ComparisonResult
}

/** Why, if at all, a completed Quick Check disqualifies its candidate. */
export function disqualificationReason(summary: ScanSummary): string | undefined {
  for (const result of summary.results) {
    if (!isVerified(result.status)) continue
    if (!DISQUALIFYING_SOURCES.includes(result.source)) continue
    if (result.exactMatches.length === 0) continue

    const taken = result.exactMatches[0]
    const label =
      result.source === 'domain'
        ? 'the exact domain is already registered'
        : result.source === 'github'
          ? `the exact name is already taken on GitHub${taken === undefined ? '' : ` (${taken.name})`}`
          : result.source === 'npm'
            ? 'the exact package name is already taken on npm'
            : 'the exact package name is already taken on PyPI'
    return label
  }

  if (summary.viability.score < MINIMUM_SCORE) {
    return `scored only ${summary.viability.score}/100 once everything else was weighed`
  }

  return undefined
}

export interface ScreenCandidatesInput {
  names: readonly string[]
  category: Category
  description: string | undefined
  /** Called after each candidate's Quick Check completes, for progress UI. */
  onCandidate?: (name: string, summary: ScanSummary) => void
}

/**
 * Research every generated name and keep only the ones that survive.
 *
 * Sequential, matching `/api/compare`'s own reasoning: N names in parallel
 * would fire N simultaneous requests at every source at once, which is
 * exactly the burst the per-source rate limiters exist to prevent — and here
 * N is ~30, not ~3.
 */
export async function screenCandidates({
  names,
  category,
  description,
  onCandidate,
}: ScreenCandidatesInput): Promise<ScreeningResult> {
  const survivors: ScreenedCandidate[] = []
  const disqualified: DisqualifiedCandidate[] = []

  for (const name of names) {
    const ctx: ScanContext = {
      name,
      category,
      scanType: 'quick',
      ...(description === undefined ? {} : { description }),
    }
    const summary = await runScanToCompletion(ctx)
    onCandidate?.(name, summary)

    const reason = disqualificationReason(summary)
    if (reason === undefined) {
      survivors.push({ name, summary })
    } else {
      disqualified.push({ name, reason })
    }
  }

  // Rank all survivors, then hand only the top slice to `compareCandidates` —
  // its strengths/weaknesses logic ("beats the average of the others") was
  // built and tuned for the 2-5 candidates Compare Names actually shows, and
  // that average would be diluted into meaninglessness run against ~30.
  const topSurvivors = [...survivors]
    .sort((a, b) => b.summary.viability.score - a.summary.viability.score)
    .slice(0, MAX_COMPARE_NAMES)
  const candidates: Candidate[] = topSurvivors.map((s) => ({ name: s.name, summary: s.summary }))
  const ranked = compareCandidates(candidates)

  return { survivors, disqualified, ranked }
}
