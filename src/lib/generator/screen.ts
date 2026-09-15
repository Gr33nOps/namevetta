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
import { assessBrandability } from '@/lib/generator/quality'
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

/**
 * How many candidates a bounded run will check per name it is asked for.
 *
 * Three, because a coined name usually survives: a request for five names
 * typically settles inside ten checks, and the ceiling of fifteen only comes
 * into play on a run where the model returned mostly occupied names. That
 * ceiling exists to return something within the route's time budget rather
 * than to be reached.
 */
const SCREEN_ATTEMPTS_PER_SURVIVOR = 3

/**
 * Extra survivors to collect beyond the five that ship, so the ranker chooses
 * the best five from a slightly larger set rather than screening the whole pool.
 *
 * The generated pool arrives ranked best-first by brandability, so screening in
 * order and stopping a couple past five yields "the best five free names" while
 * bounding how many sequential Quick Checks a run costs. Without this, a
 * `/generate` run screened every candidate in the pool — reliable, but minutes
 * of checks the result never needed.
 */
const SELECTION_BUFFER = 2

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
  if (!summary.results.some((result) => isVerified(result.status))) {
    return 'no sources could verify this name'
  }
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

  if (summary.viability.caps.length > 0) {
    return 'a confirmed conflict or a serious similarity needs review'
  }

  if (summary.viability.score < MINIMUM_SCORE) {
    return `scored only ${summary.viability.score}/100 once everything else was weighed`
  }

  return undefined
}

export interface ScreenCandidatesInput {
  signal?: AbortSignal
  names: readonly string[]
  category: Category
  description: string | undefined
  includeSpecialized?: boolean
  /** Called after each candidate's Quick Check completes, for progress UI. */
  onCandidate?: (name: string, summary: ScanSummary) => void
  /**
   * Stop as soon as this many candidates have survived, leaving the rest of
   * the batch unchecked. Undefined screens everything.
   */
  stopAfterSurvivors?: number
}

/**
 * Research every generated name and keep only the ones that survive.
 *
 * Sequential, matching `/api/compare`'s own reasoning: N names in parallel
 * would fire N simultaneous requests at every source at once, which is
 * exactly the burst the per-source rate limiters exist to prevent — and here
 * N is a generated batch, not a hand-picked shortlist.
 */
export async function screenCandidates({
  names,
  category,
  description,
  includeSpecialized = false,
  onCandidate,
  stopAfterSurvivors,
  signal,
}: ScreenCandidatesInput): Promise<ScreeningResult> {
  const survivors: ScreenedCandidate[] = []
  const disqualified: DisqualifiedCandidate[] = []

  /*
    How many survivors to collect before ranking. A caller that sets
    `stopAfterSurvivors` (the broader-check flow) wants exactly that many, first
    ones that pass. `/generate` leaves it undefined and gets a small buffer over
    the five it ships, so the top five are chosen by quality rather than by
    whichever five happened to be checked first.
  */
  const surviveGoal = stopAfterSurvivors ?? MAX_COMPARE_NAMES + SELECTION_BUFFER

  for (const name of names) {
    if (signal?.aborted) break
    const ctx: ScanContext = {
      name,
      category,
      scanType: 'quick',
      ...(includeSpecialized ? { includeSpecialized: true } : {}),
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

    /*
      Enough. Each candidate above is a whole Quick Check against every source,
      run one at a time to stay inside the rate limiters, so the difference
      between stopping here and screening the whole pool is minutes. Because the
      pool arrives ranked best-first, the survivors collected here are the best
      free names, not merely the first — so a small buffer over the five shipped
      is all the ranker needs.

      The second condition is the backstop for a pool that goes badly. When
      almost nothing survives, the first condition never fires and every
      candidate gets checked, which can outlast the route's own `maxDuration`
      and return nothing. Giving up after `SCREEN_ATTEMPTS_PER_SURVIVOR` tries
      per name still returns the few that passed, in time to show them.
    */
    if (survivors.length >= surviveGoal) break
    if (survivors.length + disqualified.length >= surviveGoal * SCREEN_ATTEMPTS_PER_SURVIVOR) {
      break
    }
  }

  // Rank all survivors, then hand only the top slice to `compareCandidates` —
  // its strengths/weaknesses logic ("beats the average of the others") was
  // built and tuned for the 2-5 candidates Compare Names actually shows, and
  // that average would be diluted into meaninglessness across the full batch.
  //
  // Digital viability decides the order; brandability breaks ties. Two names
  // that are equally free should be ordered by which is the better brand, so a
  // strong, clean name is never ranked below a clumsy one they both scored the
  // same on digitally.
  const topSurvivors = [...survivors]
    .sort(
      (a, b) =>
        b.summary.viability.score - a.summary.viability.score ||
        assessBrandability(b.name).score - assessBrandability(a.name).score ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_COMPARE_NAMES)
  const candidates: Candidate[] = topSurvivors.map((s) => ({ name: s.name, summary: s.summary }))
  const ranked = compareCandidates(candidates)

  return { survivors, disqualified, ranked }
}
