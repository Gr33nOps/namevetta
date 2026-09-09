/**
 * The evidence digest (§25).
 *
 * Two jobs, and the second is the one that matters.
 *
 * **Fit the budget.** Sending a whole `ScanSummary` would be tens of thousands
 * of tokens against a measured 8,000/minute ceiling. This compacts it to under
 * `MAX_DIGEST_TOKENS`, dropping the least severe findings first so the things
 * that decide the verdict always survive.
 *
 * **Define what may be said.** The digest is not only the model's input, it is
 * the closed world the model is allowed to talk about. Every entity name and
 * every number it may legitimately mention is collected here into a `Facts`
 * index, and `grounding.ts` rejects any claim that falls outside it. That is
 * what makes "grounded" a checkable property rather than a hope: the model
 * cannot cite a competitor we never found, because the validator has the list.
 *
 * Pure and I/O-free, so it is exhaustively testable without a provider.
 */
import type { ScanContext } from '@/lib/core/scan'
import type { Match, SourceResult } from '@/lib/core/types'
import { isVerified } from '@/lib/core/types'
import { CATEGORY_LABELS } from '@/lib/core/scan'
import { activeSources, SOURCE_MANIFEST } from '@/lib/core/adapter'
import type { ScanSummary } from '@/lib/orchestrator/run'

/**
 * Hard ceiling on digest size.
 *
 * Chosen against the 8,000 tokens/minute measured limit: digest plus system
 * prompt plus a 700-token answer must leave room for several summaries a
 * minute, or one busy moment starves everyone.
 */
export const MAX_DIGEST_TOKENS = 1_400

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

export interface DigestMatch {
  name: string
  source: string
  severity: string
  similarity: number
  active: boolean
  url?: string
}

export interface DigestSourceNote {
  source: string
  reason: string
}

export interface Digest {
  name: string
  category: string
  description?: string
  score: number
  coverage: number
  caps: string[]
  /** Findings that survived the budget, most severe first. */
  findings: DigestMatch[]
  /** Sources that completed and found nothing meaningful. */
  clearSources: string[]
  /** Sources that could not be checked, with the reason. Never "clear". */
  unverifiedSources: DigestSourceNote[]
  /** Findings dropped to fit the budget, so the model can say "and N more". */
  omittedFindings: number
}

/**
 * The closed world of assertable facts.
 *
 * `grounding.ts` checks generated text against this. Anything outside it is,
 * by construction, something the scan did not establish.
 */
export interface Facts {
  /** Every entity name the model may refer to, normalised for comparison. */
  entities: Set<string>
  /** Sources that returned a verified result and may be described as checked. */
  verifiedSources: Set<string>
  /** Sources that did not, and must never be described as clear. */
  unverifiedSources: Set<string>
  /**
   * Every source's *display* label, normalised — "Companies House", "Google
   * Play", not the internal id `play_store`. The model talks about sources by
   * their label, so checking against ids never matched anything and the
   * grounding check would flag ordinary source names as fabricated entities.
   * Constant across every scan, not just the ones this digest touched: a
   * source category name is safe vocabulary regardless of whether it appears
   * in this particular report.
   */
  knownLabels: Set<string>
  /** Numbers the model may state. */
  numbers: Set<number>
  /** The score is a score, never a source count or coverage figure. */
  score: number
  /** Coverage is a percentage, never a source count. */
  coveragePercent: number
  /** Sources whose result was verified, including findings and clear checks. */
  verifiedSourceCount: number
  /** Sources that completed with no relevant conflict. */
  clearSourceCount: number
  /** Sources that did not complete automatically. */
  unverifiedSourceCount: number
}

/** Every source label the product knows about, normalised once. */
const KNOWN_LABELS = new Set(
  activeSources().map((m) => normaliseEntity(m.label)),
)

function normaliseEntity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Findings worth showing a user, ordered by how much they matter. */
function collectFindings(results: readonly SourceResult[]): DigestMatch[] {
  const out: DigestMatch[] = []
  for (const result of results) {
    if (!isVerified(result.status)) continue
    const push = (match: Match): void => {
      out.push({
        name: match.name,
        source: SOURCE_MANIFEST[result.source].label,
        severity: match.severity,
        similarity: match.similarity.overall,
        active: match.active ?? true,
        ...(match.url === undefined ? {} : { url: match.url }),
      })
    }
    result.exactMatches.forEach(push)
    result.similarMatches.forEach(push)
  }

  return out.sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    if (bySeverity !== 0) return bySeverity
    // Active conflicts before dead ones at equal severity: a live competitor is
    // a different problem from a struck-off company.
    if (a.active !== b.active) return a.active ? -1 : 1
    return b.similarity - a.similarity
  })
}

/** Rough token estimate, matching the provider's own accounting. */
function estimate(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 3.5)
}

export interface BuildDigestInput {
  ctx: ScanContext
  summary: ScanSummary
}

export function buildDigest({ ctx, summary }: BuildDigestInput): { digest: Digest; facts: Facts } {
  const allFindings = collectFindings(summary.results)

  const clearSources: string[] = []
  const unverifiedSources: DigestSourceNote[] = []
  const verifiedIds = new Set<string>()
  const unverifiedIds = new Set<string>()

  for (const result of summary.results) {
    const label = SOURCE_MANIFEST[result.source].label
    if (isVerified(result.status)) {
      verifiedIds.add(result.source)
      if (result.status === 'no_conflict') clearSources.push(label)
    } else {
      unverifiedIds.add(result.source)
      unverifiedSources.push({
        source: label,
        // The reason is carried through verbatim. "We did not look" and "we
        // looked and found nothing" must never collapse into one another, and
        // the model needs the distinction stated to reproduce it.
        reason: result.error?.message ?? 'Not checked.',
      })
    }
  }

  const digest: Digest = {
    name: ctx.name,
    category: CATEGORY_LABELS[ctx.category] ?? ctx.category,
    ...(ctx.description === undefined || ctx.description.trim() === ''
      ? {}
      : { description: ctx.description }),
    score: summary.viability.score,
    coverage: summary.coverage,
    caps: summary.viability.caps.map((cap) => cap.reason),
    findings: [],
    clearSources,
    unverifiedSources,
    omittedFindings: 0,
  }

  // Add findings until the budget is reached. Severity order means the ones
  // that decide the verdict are never the ones dropped.
  const overhead = estimate(digest)
  let used = overhead
  for (const finding of allFindings) {
    const cost = estimate(finding)
    if (used + cost > MAX_DIGEST_TOKENS) break
    digest.findings.push(finding)
    used += cost
  }
  digest.omittedFindings = allFindings.length - digest.findings.length

  // Every capitalised word that actually appears in the digest — a cap
  // reason ("Exact major same-industry business"), a category label, a source
  // name — is fact the model is allowed to hand back. The alternative was
  // enumerating each digest field into its own allow-list by hand, which is
  // exactly the kind of place a new field quietly falls through the cracks;
  // deriving it from what was actually sent closes that gap for good.
  const digestWords = new Set<string>()
  for (const match of digestToPrompt(digest).matchAll(/[A-Z][A-Za-z0-9&'.-]*/g)) {
    digestWords.add(normaliseEntity(match[0]))
  }

  const facts: Facts = {
    entities: new Set([
      normaliseEntity(ctx.name),
      // Every finding, including the ones dropped for budget: the model cannot
      // see them, so it will not cite them, but a name it happens to produce
      // that we genuinely did find is not a hallucination.
      ...allFindings.map((f) => normaliseEntity(f.name)),
      ...digestWords,
    ]),
    verifiedSources: verifiedIds,
    unverifiedSources: unverifiedIds,
    knownLabels: KNOWN_LABELS,
    numbers: new Set<number>([
      summary.viability.score,
      allFindings.length,
      digest.findings.length,
      digest.omittedFindings,
      clearSources.length,
      unverifiedSources.length,
      summary.results.length,
      ...allFindings.map((f) => f.similarity),
    ]),
    score: summary.viability.score,
    coveragePercent: summary.coverage,
    verifiedSourceCount: verifiedIds.size,
    clearSourceCount: clearSources.length,
    unverifiedSourceCount: unverifiedSources.length,
  }

  return { digest, facts }
}

/**
 * Serialised form sent to the model.
 *
 * Compact, not pretty-printed. `estimate()` above sizes the budget against
 * `JSON.stringify(value)` with no indentation; sending an indented version here
 * would mean the actual payload is reliably bigger than what was budgeted for,
 * which on a large digest is a real gap against the measured 8,000
 * tokens/minute ceiling, not a cosmetic one.
 */
export function digestToPrompt(digest: Digest): string {
  return JSON.stringify(digest)
}

export { normaliseEntity }
