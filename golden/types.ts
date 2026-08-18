/**
 * The golden dataset (§54).
 *
 * "This is essential if we're claiming better quality."
 *
 * Every scoring and similarity decision in this product is a judgement call —
 * blend weights, phonetic thresholds, industry keywords, severity boundaries.
 * Each one was tuned by hand, and without a labelled dataset there is nothing
 * stopping the next tuning pass from silently making the engine worse.
 *
 * A case asserts a *range*, never an exact number. Pinning exact values would
 * produce a suite that breaks on every harmless adjustment and teaches everyone
 * to update expectations without thinking — which is worse than no suite. The
 * ranges encode what actually matters: this pair must be recognised as a
 * conflict, that pair must not be.
 */
import type { Category } from '@/lib/core/scan'
import type { MatchSeverity } from '@/lib/core/types'

export const SEVERITY_RANK: Record<MatchSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

/**
 * What kind of risk a case represents.
 *
 * `conflict` cases drive the **false-negative** rate — §54 calls this the most
 * important metric, because missing a real problem is how we tell somebody a
 * bad name is fine.
 *
 * `clear` cases drive the **false-positive** rate — scaring a user away from a
 * perfectly good name is a real cost, not a safe default.
 */
export type CaseKind = 'conflict' | 'clear'

export interface GoldenCase {
  id: string
  kind: CaseKind
  /** The name being researched. */
  candidate: string
  /** What the user is building. */
  category: Category
  description?: string
  /** The competing name that was discovered. */
  match: string
  /** How the source described the competing thing, if at all. */
  matchDescription?: string
  /** Source-native categories, e.g. an App Store genre. */
  matchCategories?: string[]
  /** Whether the competing thing appears active. */
  active?: boolean
  /** True for sources where a collision is legally meaningful. */
  legallyWeighted?: boolean

  expect: Expectation

  /** Grouping labels for the report breakdown. */
  tags: string[]
  /** Why this case is in the dataset. Read when a case fails. */
  note: string
}

export interface Expectation {
  /** Blended similarity floor, 0–100. */
  minOverall?: number
  /** Blended similarity ceiling, 0–100. */
  maxOverall?: number
  minPhonetic?: number
  maxPhonetic?: number
  minText?: number
  maxText?: number
  /** Severity must be at least this. Drives false negatives. */
  severityAtLeast?: MatchSeverity
  /** Severity must be at most this. Drives false positives. */
  severityAtMost?: MatchSeverity
  minIndustry?: number
  maxIndustry?: number
  /**
   * True when we should be unable to place the industry at all. Asserting this
   * matters as much as asserting a number: the product must not invent
   * relevance from nothing.
   */
  industryUnknown?: boolean
}

export interface CaseFailure {
  field: string
  expected: string
  actual: string
}

export interface CaseOutcome {
  case: GoldenCase
  passed: boolean
  failures: CaseFailure[]
  /** Set when a `conflict` case was under-detected. */
  falseNegative: boolean
  /** Set when a `clear` case was over-detected. */
  falsePositive: boolean
}

export interface BenchmarkReport {
  total: number
  passed: number
  failed: number
  /** Missed real conflicts. The metric that matters most. */
  falseNegatives: CaseOutcome[]
  /** Flagged things that were fine. */
  falsePositives: CaseOutcome[]
  /** Failures that are neither — a range assertion drifted. */
  otherFailures: CaseOutcome[]
  byTag: Record<string, { total: number; passed: number }>
}
