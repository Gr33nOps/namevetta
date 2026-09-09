import { describe, expect, it } from 'vitest'
import type { ScanContext } from '@/lib/core/scan'
import type { Match, SourceResult } from '@/lib/core/types'
import type { ScanSummary } from '@/lib/orchestrator/run'
import { buildDigest, digestToPrompt, MAX_DIGEST_TOKENS } from './digest'

const ctx: ScanContext = {
  name: 'Envryn',
  category: 'saas',
  scanType: 'deep',
  description: 'Cybersecurity SaaS',
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    externalId: 'x',
    name: 'Envryn Security',
    categories: [],
    similarity: { overall: 80, text: 80, phonetic: 80, visual: 80 },
    severity: 'high',
    active: true,
    evidence: [],
    ...overrides,
  }
}

function result(overrides: Partial<SourceResult> = {}): SourceResult {
  return {
    source: 'github',
    status: 'no_conflict',
    confidence: 90,
    exactMatches: [],
    similarMatches: [],
    evidence: [],
    checkedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    fromCache: false,
    ...overrides,
  }
}

function summary(results: SourceResult[]): ScanSummary {
  return {
    results,
    viability: {
      score: 55,
      rawScore: 60,
      caps: [{ reason: 'Exact major same-industry business', maximum: 55 }],
      groups: [],
      conflicts: [],
      scoringVersion: 1,
    },
    coverage: 71,
  }
}

describe('buildDigest', () => {
  it('carries the headline figures through unchanged', () => {
    const { digest, facts } = buildDigest({ ctx, summary: summary([]) })
    expect(digest.name).toBe('Envryn')
    expect(digest.score).toBe(55)
    expect(digest.coverage).toBe(71)
    expect(digest.caps).toEqual(['Exact major same-industry business'])
    expect(facts.coveragePercent).toBe(71)
    expect(facts.verifiedSourceCount).toBe(0)
  })

  it('sorts findings by severity, active before inactive at equal severity', () => {
    const results = [
      result({
        source: 'github',
        status: 'confirmed_conflict',
        exactMatches: [match({ name: 'Low one', severity: 'low', similarity: { overall: 40, text: 40, phonetic: 40, visual: 40 } })],
      }),
      result({
        source: 'npm',
        status: 'confirmed_conflict',
        exactMatches: [match({ name: 'Critical one', severity: 'critical' })],
      }),
      result({
        source: 'domain',
        status: 'confirmed_conflict',
        exactMatches: [match({ name: 'Dead high one', severity: 'high', active: false })],
      }),
      result({
        source: 'youtube',
        status: 'confirmed_conflict',
        exactMatches: [match({ name: 'Live high one', severity: 'high', active: true })],
      }),
    ]
    const { digest } = buildDigest({ ctx, summary: summary(results) })
    expect(digest.findings.map((f) => f.name)).toEqual([
      'Critical one',
      'Live high one',
      'Dead high one',
      'Low one',
    ])
  })

  it('separates clear sources from unverified ones, never merging them', () => {
    const results = [
      result({ source: 'github', status: 'no_conflict' }),
      result({
        source: 'play_store',
        status: 'unable_to_verify',
        confidence: 0,
        error: { code: 'NOT_SEARCHED', message: 'Google Play was not searched.', retryable: false },
      }),
    ]
    const { digest, facts } = buildDigest({ ctx, summary: summary(results) })
    expect(digest.clearSources).toEqual(['GitHub'])
    expect(digest.unverifiedSources).toEqual([
      { source: 'Google Play', reason: 'Google Play was not searched.' },
    ])
    expect(facts.verifiedSources.has('github')).toBe(true)
    expect(facts.unverifiedSources.has('play_store')).toBe(true)
    expect(facts.unverifiedSources.has('github')).toBe(false)
  })

  it('drops the least severe findings first once the token budget is hit', () => {
    // Enough matches that the digest cannot possibly fit under budget whole.
    const results = [
      result({
        source: 'github',
        status: 'confirmed_conflict',
        similarMatches: Array.from({ length: 200 }, (_, i) =>
          match({
            name: `Candidate Number ${i} With A Fairly Long Descriptive Name`,
            severity: i === 0 ? 'critical' : 'low',
            similarity: { overall: i === 0 ? 99 : 41, text: 40, phonetic: 40, visual: 40 },
          }),
        ),
      }),
    ]
    const { digest } = buildDigest({ ctx, summary: summary(results) })
    expect(digest.findings.length).toBeLessThan(200)
    expect(digest.omittedFindings).toBeGreaterThan(0)
    // The one finding that must never be dropped for budget reasons.
    expect(digest.findings[0]?.name).toBe('Candidate Number 0 With A Fairly Long Descriptive Name')
    expect(digestToPrompt(digest).length).toBeLessThan(MAX_DIGEST_TOKENS * 4)
  })

  it('puts every finding name in the facts index, including ones dropped for budget', () => {
    const results = [
      result({
        source: 'github',
        status: 'confirmed_conflict',
        similarMatches: Array.from({ length: 100 }, (_, i) =>
          match({ name: `Padding Candidate ${i}`, severity: 'low', similarity: { overall: 41, text: 40, phonetic: 40, visual: 40 } }),
        ),
      }),
    ]
    const { digest, facts } = buildDigest({ ctx, summary: summary(results) })
    expect(digest.omittedFindings).toBeGreaterThan(0)
    // Every candidate is a real fact even if it didn't make the token budget —
    // the model just never sees it, so it can't cite it either way.
    expect(facts.entities.has('paddingcandidate99')).toBe(true)
  })

  it('omits an empty description rather than sending an empty field', () => {
    const bare: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'deep' }
    const { digest } = buildDigest({ ctx: bare, summary: summary([]) })
    expect('description' in digest).toBe(false)
  })
})
