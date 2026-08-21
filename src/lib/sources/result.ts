/**
 * Helpers for constructing `SourceResult`s.
 *
 * Adapters should never assemble the object literally — the timestamps, TTL and
 * confidence all derive from the manifest and the scoring rules, and doing that
 * by hand in fifteen places is how they drift apart.
 */
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import type { Evidence, Match, SourceId, SourceResult, SourceStatus } from '@/lib/core/types'
import { computeConfidence, type SourceHealth } from '@/lib/scoring/confidence'
import { healthFor } from '@/lib/sources/health'
import { SourceRequestError } from '@/lib/sources/http'

export interface BuildResultInput {
  source: SourceId
  status: SourceStatus
  exactMatches?: Match[]
  similarMatches?: Match[]
  evidence?: Evidence[]
  error?: SourceResult['error']
  fromCache?: boolean
  health?: SourceHealth
  meta?: Record<string, unknown>
}

export function buildResult(input: BuildResultInput): SourceResult {
  const manifest = SOURCE_MANIFEST[input.source]
  const now = new Date()
  const fromCache = input.fromCache ?? false
  // Health is applied automatically so every adapter benefits without having to
  // remember to pass it. A source that has been failing or being throttled
  // reports lower confidence on the calls that do succeed, which is exactly what
  // §39 asks for.
  const health = input.health ?? healthFor(input.source)

  const result: SourceResult = {
    source: input.source,
    status: input.status,
    confidence: computeConfidence({
      source: input.source,
      status: input.status,
      fromCache,
      ...(health === undefined ? {} : { health }),
    }),
    exactMatches: input.exactMatches ?? [],
    similarMatches: input.similarMatches ?? [],
    evidence: input.evidence ?? [],
    checkedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + manifest.cacheTtlSeconds * 1000).toISOString(),
    fromCache,
  }
  if (input.error !== undefined) result.error = input.error
  if (input.meta !== undefined) result.meta = input.meta
  return result
}

/**
 * Build the result for a source that could not be checked.
 *
 * Used by the orchestrator for timeouts and thrown adapter errors, and by
 * adapters themselves when a required credential is absent. The distinction that
 * matters is that this is never mistaken for "nothing found".
 */
export function unverifiable(
  source: SourceId,
  code: string,
  message: string,
  retryable = true,
): SourceResult {
  return buildResult({
    source,
    status: 'unable_to_verify',
    error: { code, message, retryable },
  })
}

/**
 * Give every JSON API adapter the same honest failure result. The provider name
 * remains visible to the researcher, while the error code still feeds source
 * health without letting an upstream error look like a clear result.
 */
export function requestFailure(source: SourceId, provider: string, cause: unknown): SourceResult {
  if (cause instanceof SourceRequestError) {
    if (cause.code === 'RATE_LIMITED') return unverifiable(source, 'RATE_LIMITED', `${provider} rate-limited this request.`, true)
    if (cause.code === 'TIMEOUT') return unverifiable(source, 'TIMEOUT', `${provider} did not answer in time.`, true)
    if (cause.code === 'BAD_JSON') return unverifiable(source, 'MALFORMED_RESPONSE', `${provider} returned malformed JSON.`, false)
    if (cause.status !== undefined && cause.status >= 500) return unverifiable(source, 'UPSTREAM_ERROR', `${provider} responded ${cause.status}.`, true)
  }
  return unverifiable(source, 'LOOKUP_FAILED', `${provider} could not be reached.`, true)
}

/** Convenience for the common "we looked, nothing there" outcome. */
export function clean(source: SourceId, evidence: Evidence[] = []): SourceResult {
  return buildResult({ source, status: 'no_conflict', evidence })
}

/** Timestamped evidence pointing at something a human can open. */
export function makeEvidence(
  source: SourceId,
  label: string,
  url?: string,
  snippet?: string,
): Evidence {
  const e: Evidence = { label, source, observedAt: new Date().toISOString() }
  if (url !== undefined) e.url = url
  if (snippet !== undefined) e.snippet = snippet
  return e
}

/**
 * Decide the overall status for a source from what it found.
 *
 * Kept in one place so "exact match means confirmed_conflict" is a rule of the
 * system rather than a judgement each adapter makes differently.
 */
export function statusFromMatches(exact: Match[], similar: Match[]): SourceStatus {
  if (exact.length > 0) return 'confirmed_conflict'
  if (similar.length > 0) return 'similar_found'
  return 'no_conflict'
}
