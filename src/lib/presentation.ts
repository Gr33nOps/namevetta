/**
 * How domain values are presented to a human.
 *
 * This module is where the honesty principle becomes visual. §2 is not just a
 * scoring rule — a user reads colour and shape long before they read words, so
 * "verified clean" and "we could not check this" must be unmistakably different
 * at a glance. Unverified states are rendered grey and neutral, never green and
 * never amber: amber reads as "minor problem", and the truth is "no information".
 */
import type { MatchSeverity, SourceStatus } from '@/lib/core/types'
import type { TrademarkConcern, Verdict } from '@/lib/scoring/viability'
import type { ScreeningStatus } from '@/lib/trademark/provider'

export type Tone = 'ok' | 'warn' | 'danger' | 'unknown' | 'neutral'

export interface Presentation {
  label: string
  tone: Tone
  detail: string
}

export const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  unknown: 'bg-unknown-soft text-unknown border-unknown/20',
  neutral: 'bg-muted-bg text-charcoal-2 border-line',
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
export const SCORE_NAME = 'Digital Viability Score'
export const SCORE_NAME_SHORT = 'Digital Viability'

export const SCORE_EXPLAINER =
  'How usable this name is across domains, code namespaces, app stores, social handles and the open web. It does not cover trademarks.'

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

export const STATUS_PRESENTATION: Record<SourceStatus, Presentation> = {
  no_conflict: {
    label: 'Clear',
    tone: 'ok',
    detail: 'Search completed successfully and found nothing meaningful.',
  },
  similar_found: {
    label: 'Review',
    tone: 'warn',
    detail: 'Worth investigating. See the evidence below.',
  },
  confirmed_conflict: {
    label: 'Conflict',
    tone: 'danger',
    detail: 'An exact or very strong conflict was identified.',
  },
  unable_to_verify: {
    label: 'Unverifiable',
    tone: 'unknown',
    detail: 'This source could not be checked. It is not evidence that the name is free.',
  },
  manual_check_recommended: {
    label: 'Manual check',
    tone: 'unknown',
    detail: 'Automatic evidence is not reliable enough here. Check it yourself before deciding.',
  },
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
    detail: 'No significant digital conflicts surfaced in the checks that completed.',
  },
  promising: {
    label: 'Mostly Clear',
    tone: 'ok',
    detail: 'Broadly clear digitally, with a few things worth a look.',
  },
  mixed: {
    label: 'Review',
    tone: 'warn',
    detail: 'Real digital conflicts exist. Read the evidence before committing.',
  },
  risky: {
    label: 'Conflict',
    tone: 'danger',
    detail: 'Significant digital conflicts found, including at least one that caps the score.',
  },
  avoid: {
    label: 'Serious Conflict',
    tone: 'danger',
    detail: 'Strong, direct digital conflicts were identified.',
  },
}

export const SEVERITY_PRESENTATION: Record<MatchSeverity, Presentation> = {
  none: { label: 'Not a concern', tone: 'neutral', detail: 'No meaningful overlap.' },
  low: { label: 'Low', tone: 'neutral', detail: 'Distant match, unlikely to matter.' },
  medium: { label: 'Medium', tone: 'warn', detail: 'Close enough to be worth reviewing.' },
  high: { label: 'High', tone: 'danger', detail: 'Strong overlap in name and context.' },
  critical: { label: 'Critical', tone: 'danger', detail: 'Direct conflict in the same field.' },
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
    detail: 'Trademark research has not been done. This name is unscreened.',
  },
  in_progress: {
    label: 'In progress',
    tone: 'unknown',
    detail: 'Some registries checked. Nothing can be concluded yet.',
  },
  completed: {
    label: 'Preliminary search done',
    tone: 'neutral',
    detail: 'You searched the official registries. This is preliminary research, not clearance.',
  },
  unable_to_verify: {
    label: 'Unable to verify',
    tone: 'unknown',
    detail: 'The registries could not be checked. Treat the name as unscreened.',
  },
}

export const CONCERN_PRESENTATION: Record<TrademarkConcern, Presentation> = {
  unknown: {
    label: 'Unknown',
    tone: 'unknown',
    detail: 'No completed trademark research to draw on.',
  },
  low: {
    label: 'No obvious conflict reported',
    tone: 'neutral',
    detail: 'Nothing obvious surfaced in your search. A professional search is still advisable.',
  },
  medium: {
    label: 'Ambiguous',
    tone: 'warn',
    detail: 'The results were unclear. Worth a professional search.',
  },
  high: {
    label: 'Possible conflict',
    tone: 'danger',
    detail: 'Something close enough to need professional review was found.',
  },
  critical: {
    label: 'Direct conflict',
    tone: 'danger',
    detail: 'A direct conflict was identified. Get professional advice before proceeding.',
  },
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
    return 'Nearly all intended research completed, weighted by relevance to this category.'
  }
  if (coverage >= 70) {
    return 'Some checks did not complete. Weighted by category, so this is not a simple source count.'
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
  'Preliminary trademark research only. This is not legal clearance or legal advice.'

/** The only sanctioned way to describe a clean preliminary screen. */
export const TRADEMARK_CLEAR_PHRASING =
  'No obvious conflict was reported in the registries you searched. This is preliminary research, not legal clearance.'

/** Stated on the homepage and on every report, so scope is never in doubt. */
export const SCOPE_NOTICE =
  'NameVetta researches digital availability. Trademark and legal clearance are not included.'
