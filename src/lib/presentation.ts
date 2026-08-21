/**
 * How domain values are presented to a human.
 *
 * This module is where the honesty principle becomes visual. §2 is not just a
 * scoring rule — a user reads colour and shape long before they read words, so
 * "verified clean" and "we could not check this" must be unmistakably different
 * at a glance. Unverified states are rendered grey and neutral, never green and
 * never amber: amber reads as "minor problem", and the truth is "no information".
 */
import { type MatchSeverity, type SourceResult, type SourceStatus } from '@/lib/core/types'
import type { TrademarkConcern, Verdict } from '@/lib/scoring/viability'
import type { ScreeningStatus } from '@/lib/trademark/provider'

export type Tone = 'ok' | 'warn' | 'danger' | 'unknown' | 'neutral'

export interface Presentation {
  label: string
  tone: Tone
  detail: string
}

export const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/35',
  warn: 'bg-warn-soft text-warn border-warn/35',
  danger: 'bg-danger-soft text-danger border-danger/35',
  unknown: 'bg-unknown-soft text-unknown border-unknown/35',
  neutral: 'bg-muted-bg text-charcoal-2 border-line',
}

/** Tone as ink, for a verdict word set in the colour of its own answer. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  unknown: 'text-unknown',
  neutral: 'text-charcoal',
}

export const TONE_FILL: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  unknown: 'bg-unknown',
  neutral: 'bg-line-strong',
}

/**
 * Glyphs are text, not colour alone, so meaning survives for colour-blind users
 * and in a screenshot. The unverified glyph is a question mark rather than a
 * warning triangle for the reason described at the top of this file.
 */
export const TONE_GLYPH: Record<Tone, string> = {
  ok: '✓',
  warn: '!',
  danger: '✕',
  unknown: '?',
  neutral: '–',
}

/* -------------------------------------------------------------------------- */
/* The score                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The primary score's name.
 *
 * "Digital" is doing real work: it tells the user what the number covers and,
 * by omission, what it does not. A bare "Viability Score" would imply the
 * trademark position is baked in, which in V1 it is not.
 */
export const SCORE_NAME = 'Score'
export const SCORE_NAME_SHORT = 'Score'

export const SCORE_EXPLAINER =
  'A weighted view of domains, code, apps, social, and web results. It does not cover trademarks.'

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

export const STATUS_PRESENTATION: Record<SourceStatus, Presentation> = {
  no_conflict: {
    label: 'Clear',
    tone: 'ok',
    detail: 'Checked with no meaningful match found.',
  },
  similar_found: {
    label: 'Review',
    tone: 'warn',
    detail: 'A close match needs a look.',
  },
  confirmed_conflict: {
    label: 'Conflict',
    tone: 'danger',
    detail: 'An exact or strong match was found.',
  },
  unable_to_verify: {
    label: 'Unverifiable',
    tone: 'unknown',
    detail: "Couldn't get a reliable result. This doesn't mean the name is free.",
  },
  manual_check_recommended: {
    label: 'Manual check',
    tone: 'unknown',
    detail: 'Check this platform directly before deciding.',
  },
}

/* -------------------------------------------------------------------------- */
/* Why a source produced nothing                                              */
/* -------------------------------------------------------------------------- */

/**
 * Four different things `unable_to_verify` can mean.
 *
 * The status is right in every case — none of them produced a trustworthy
 * observation, so none of them may score, count toward coverage, or render
 * green. But "Google Play was not searched, because it carries 2% of the score
 * for a SaaS product and a search credit is shared across everyone" is not the
 * same event as "Maven Central timed out", and the report used to file them
 * under one heading reading "Couldn't be checked".
 *
 * Classified from the error code rather than from a sixth status, deliberately:
 * a sixth status would need a database migration, a new CHECK constraint, and a
 * new branch in every consumer, to express something that is a *reason* for an
 * existing status rather than a new kind of answer. The codes already exist and
 * the adapters already set them.
 */
export type UnverifiedReason =
  /** A deliberate choice not to spend a metered call here. Not a failure. */
  | 'skipped'
  /** The product could not run it: no credential, or the budget is spent. */
  | 'unavailable'
  /** Automatic evidence here is never trustworthy enough. The user checks it. */
  | 'manual'
  /** It was attempted and did not produce a usable answer. */
  | 'failed'

/**
 * Codes meaning "we chose not to ask".
 *
 * Listed rather than pattern-matched so adding one is a decision somebody
 * makes on purpose. `deliberatelySkipped` is what keeps these out of the
 * failure count and out of source health.
 */
export const SKIPPED_ERROR_CODES: readonly string[] = ['NOT_SEARCHED', 'NOT_APPLICABLE']

/** Codes meaning "we could not ask", through no fault of the provider. */
export const UNAVAILABLE_ERROR_CODES: readonly string[] = [
  'NO_PROVIDER',
  'NO_API_KEY',
  'BUDGET_EXHAUSTED',
  'NOT_IMPLEMENTED',
]

export function unverifiedReason(
  result: Pick<SourceResult, 'status' | 'error'>,
): UnverifiedReason | undefined {
  if (result.status === 'manual_check_recommended') return 'manual'
  if (result.status !== 'unable_to_verify') return undefined
  const code = result.error?.code ?? ''
  if (SKIPPED_ERROR_CODES.includes(code)) return 'skipped'
  if (UNAVAILABLE_ERROR_CODES.includes(code)) return 'unavailable'
  return 'failed'
}

/**
 * True when nothing went wrong and nothing was asked.
 *
 * Used by the report to file the result separately, and by health tracking to
 * not record an outcome at all — a source counted as failing every time it was
 * deliberately not called would show up on the public status page as broken.
 */
export function deliberatelySkipped(result: Pick<SourceResult, 'status' | 'error'>): boolean {
  return unverifiedReason(result) === 'skipped'
}

/**
 * Whether an outcome says anything about the provider's reliability.
 *
 * Only two things do: a usable observation, and an attempt that failed. A
 * deliberate skip was never asked; a missing credential or a spent budget is
 * our constraint, not theirs; a manual-only source makes no request at all.
 * Recording any of those is how the status page came to imply that working
 * sources were broken.
 */
export function countsTowardHealth(result: Pick<SourceResult, 'status' | 'error'>): boolean {
  const reason = unverifiedReason(result)
  return reason === undefined || reason === 'failed'
}

/**
 * How each reason reads.
 *
 * None is `ok` and none is `warn`. A skip is not good news and not a problem;
 * it is an absence, and `neutral` is the only tone that says so. Amber would
 * read as "minor problem" and green would be the false clear this whole module
 * exists to prevent.
 */
export const UNVERIFIED_PRESENTATION: Record<UnverifiedReason, Presentation> = {
  skipped: {
    label: 'Not checked here',
    tone: 'neutral',
    detail:
      'Not searched because it has little weight for this category. This is not evidence the name is unused.',
  },
  unavailable: {
    label: 'Not run',
    tone: 'unknown',
    detail:
      'This check could not run. It does not mean the name is free.',
  },
  manual: {
    label: 'Manual check',
    tone: 'unknown',
    detail: 'Check this platform directly before deciding.',
  },
  failed: {
    label: 'Unverifiable',
    tone: 'unknown',
    detail: "Couldn't get a reliable result. This doesn't mean the name is free.",
  },
}

/**
 * How one result should read, status and reason together.
 *
 * Prefer this over indexing `STATUS_PRESENTATION` directly anywhere a real
 * result is in hand: the status alone cannot tell a skip from a timeout.
 */
export function resultPresentation(
  result: Pick<SourceResult, 'status' | 'error'>,
): Presentation {
  const reason = unverifiedReason(result)
  return reason === undefined ? STATUS_PRESENTATION[result.status] : UNVERIFIED_PRESENTATION[reason]
}

/**
 * Every label here is built from the same three words the per-source status
 * system uses (Clear / Review / Conflict), so the overall verdict and an
 * individual source's status never read as two different vocabularies.
 */
export const VERDICT_PRESENTATION: Record<Verdict, Presentation> = {
  strong: {
    label: 'Clear',
    tone: 'ok',
    detail: 'No major conflicts in completed checks.',
  },
  promising: {
    label: 'Mostly Clear',
    tone: 'ok',
    detail: 'Mostly clear, with a few things to review.',
  },
  mixed: {
    label: 'Review',
    tone: 'warn',
    detail: 'Review the findings before using this name.',
  },
  risky: {
    label: 'Conflict',
    tone: 'danger',
    detail: 'Significant conflicts found. The score is capped.',
  },
  avoid: {
    label: 'Serious Conflict',
    tone: 'danger',
    detail: 'Strong, direct conflicts found.',
  },
}

export const SEVERITY_PRESENTATION: Record<MatchSeverity, Presentation> = {
  none: { label: 'No concern', tone: 'neutral', detail: 'No meaningful overlap.' },
  low: { label: 'Low', tone: 'neutral', detail: 'Distant match.' },
  medium: { label: 'Medium', tone: 'warn', detail: 'Worth reviewing.' },
  high: { label: 'High', tone: 'danger', detail: 'Strong name and context overlap.' },
  critical: { label: 'Critical', tone: 'danger', detail: 'Direct conflict in the same use.' },
}

/* -------------------------------------------------------------------------- */
/* Trademark screening                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Note the tones: no screening state is ever `ok`. Even a completed screening
 * with nothing found is `neutral`, because the user performed a preliminary
 * search — not a clearance — and the colour must not overstate that.
 */
export const SCREENING_PRESENTATION: Record<ScreeningStatus, Presentation> = {
  not_started: {
    label: 'Not started',
    tone: 'unknown',
    detail: 'No trademark research yet.',
  },
  in_progress: {
    label: 'In progress',
    tone: 'unknown',
    detail: 'Some registries checked. No conclusion yet.',
  },
  completed: {
    label: 'Preliminary search done',
    tone: 'neutral',
    detail: 'Official registries searched. This is not legal clearance.',
  },
  unable_to_verify: {
    label: 'Unable to verify',
    tone: 'unknown',
    detail: "Couldn't check the registries. Treat the name as unscreened.",
  },
}

export const CONCERN_PRESENTATION: Record<TrademarkConcern, Presentation> = {
  unknown: {
    label: 'Unknown',
    tone: 'unknown',
    detail: 'No completed trademark research.',
  },
  low: {
    label: 'No obvious conflict reported',
    tone: 'neutral',
    detail: 'Nothing obvious found. A professional search may still be needed.',
  },
  medium: {
    label: 'Ambiguous',
    tone: 'warn',
    detail: 'Results were unclear. Consider a professional search.',
  },
  high: {
    label: 'Possible conflict',
    tone: 'danger',
    detail: 'A close result needs professional review.',
  },
  critical: {
    label: 'Direct conflict',
    tone: 'danger',
    detail: 'A direct conflict was found. Get professional advice.',
  },
}


/**
 * What the report actually says, in one sentence.
 *
 * The verdict's own `detail` string describes the score and nothing else, so a
 * 94 announced "No significant digital conflicts surfaced" while two sources
 * below it said Review and two more were never checked. That is the headline
 * contradicting its own page.
 *
 * This keeps the verdict word, which is consistent with the rest of the
 * product, and makes the sentence carry the counts that were already on screen
 * further down. Nothing is recomputed; these are the same results the findings
 * list renders.
 *
 * A confirmed conflict leads, because it is the one finding that decides the
 * answer. It is counted separately from "to review" for the same reason the
 * score is now ceilinged when one exists: "3 sources to review" is what a
 * near-miss looks like, and a confirmed collision is not a near-miss.
 */
export function headlineSentence(results: readonly SourceResult[], base: string): string {
  const conflicts = results.filter((r) => r.status === 'confirmed_conflict').length
  const review = results.filter((r) => r.status === 'similar_found').length
  const skipped = results.filter((r) => deliberatelySkipped(r)).length
  const unchecked = results.filter(
    (r) => r.status === 'unable_to_verify' && !deliberatelySkipped(r),
  ).length
  const manual = results.filter((r) => r.status === 'manual_check_recommended').length

  const caveats: string[] = []
  if (conflicts > 0) {
    caveats.push(`${conflicts} confirmed ${conflicts === 1 ? 'conflict' : 'conflicts'}`)
  }
  if (review > 0) {
    // "to review" rather than "needs a look": the rows above carry a Review
    // badge, and the verdict copy for a near-clear score already says "worth a
    // look", so repeating it read as a stutter.
    caveats.push(`${review} ${review === 1 ? 'source' : 'sources'} to review`)
  }
  if (unchecked > 0) {
    caveats.push(`${unchecked} couldn't be checked`)
  }
  if (manual > 0) {
    caveats.push('manual verification needed')
  }
  if (skipped > 0) {
    caveats.push(`${skipped} not checked for this category`)
  }

  if (caveats.length === 0) return base
  return `${base} ${caveats.join(', ')}.`
}

/**
 * The line that has to outrank the score.
 *
 * A report showing 100 in green while a source underneath reported a confirmed
 * exact collision was the worst thing the audit found, and capping the number
 * only fixes half of it: the reader still needs one sentence, above the
 * arithmetic, naming what was found and where.
 */
export function conflictBanner(
  /*
    Optional because a stored report predates the field. A scan persisted
    before `conflicts` existed deserializes without it, and a banner that
    throws would take the whole report down rather than degrade — the same
    reasoning that keeps one broken source from breaking a scan.
  */
  conflicts: readonly { source: string; name: string }[] | undefined,
): string {
  if (conflicts === undefined || conflicts.length === 0) return ''
  const first = conflicts[0] as { source: string; name: string }
  if (conflicts.length === 1) {
    return `“${first.name}” is already claimed.`
  }
  return `“${first.name}” is already claimed in ${conflicts.length} sources.`
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

export function coverageTone(coverage: number): Tone {
  if (coverage >= 90) return 'neutral'
  if (coverage >= 70) return 'warn'
  return 'danger'
}

/**
 * Coverage is weighted by how much each source matters to this category, not
 * a plain count of checks completed — the caveat says so, since a raw
 * fraction (12 of 14 sources) can otherwise look like it disagrees with the
 * number shown.
 */
export function coverageCaveat(coverage: number): string {
  if (coverage >= 90) {
    return 'Nearly all intended research completed.'
  }
  if (coverage >= 70) {
    return 'Some checks did not complete. This is weighted by category.'
  }
  return 'Many checks did not complete. Treat this score as provisional.'
}

/* -------------------------------------------------------------------------- */
/* Wording rules                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Phrases that must never appear in anything a user reads.
 *
 * Each one asserts a legal conclusion this product is not entitled to reach.
 * `wording.test.ts` scans the source for these, so the rule is enforced rather
 * than merely documented — a well-meaning copy edit cannot reintroduce them.
 */
export const FORBIDDEN_PHRASES: readonly string[] = [
  'legally safe',
  'trademark cleared',
  'trademark clearance complete',
  'guaranteed available',
  'safe to register',
  'legally clear',
  'no legal risk',
  'cleared for use',
]

/** The standing disclaimer on every trademark surface. */
export const TRADEMARK_DISCLAIMER =
  'Preliminary trademark research only. Not legal clearance or legal advice.'

/** The only sanctioned way to describe a clean preliminary screen. */
export const TRADEMARK_CLEAR_PHRASING =
  'No obvious conflict was reported in the registries you searched. This is preliminary research, not legal clearance.'

/** Stated on the homepage and on every report, so scope is never in doubt. */
export const SCOPE_NOTICE =
  'Digital research only. Trademark and legal clearance are not included.'
