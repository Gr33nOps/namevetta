import { describe, expect, it } from 'vitest'
import type { Match, SourceResult } from '@/lib/core/types'
import type { ScanSummary } from '@/lib/orchestrator/run'
import { disqualificationReason } from './screen'

function match(overrides: Partial<Match> = {}): Match {
  return {
    externalId: 'x',
    name: 'Taken',
    categories: [],
    similarity: { overall: 100, text: 100, phonetic: 100, visual: 100 },
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
    confidence: 95,
    exactMatches: [],
    similarMatches: [],
    evidence: [],
    checkedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    fromCache: false,
    ...overrides,
  }
}

function summary(results: SourceResult[], score = 80): ScanSummary {
  return {
    results,
    viability: { score, rawScore: score, caps: [], groups: [], conflicts: [], scoringVersion: 1 },
    coverage: 80,
  }
}

describe('disqualificationReason', () => {
  it('excludes a capped conflict even when its numeric score is above the shortlist floor', () => {
    const scan = summary([result({ source: 'youtube', status: 'confirmed_conflict', exactMatches: [match()] })], 69)
    scan.viability.caps = [{ maximum: 69, reason: 'An exact conflict was confirmed on YouTube' }]
    expect(disqualificationReason(scan)).toContain('conflict')
  })
  it('does not shortlist a name when all checks failed to verify', () => {
    expect(disqualificationReason({ ...summary([result({ status: 'unable_to_verify' })]), coverage: 0 })).toBeDefined()
  })
  it('passes a clean scan with no exact conflicts and a decent score', () => {
    const s = summary([result({ source: 'domain' }), result({ source: 'github' })])
    expect(disqualificationReason(s)).toBeUndefined()
  })

  it('disqualifies an exact domain conflict', () => {
    const s = summary([
      result({ source: 'domain', status: 'confirmed_conflict', exactMatches: [match()] }),
    ])
    expect(disqualificationReason(s)).toContain('domain')
  })

  it('disqualifies an exact GitHub namespace conflict and names it', () => {
    const s = summary([
      result({
        source: 'github',
        status: 'confirmed_conflict',
        exactMatches: [match({ name: 'zolvex/zolvex' })],
      }),
    ])
    expect(disqualificationReason(s)).toContain('zolvex/zolvex')
  })

  it('disqualifies an exact npm conflict', () => {
    const s = summary([
      result({ source: 'npm', status: 'confirmed_conflict', exactMatches: [match()] }),
    ])
    expect(disqualificationReason(s)).toContain('npm')
  })

  it('disqualifies an exact PyPI conflict', () => {
    const s = summary([
      result({ source: 'pypi', status: 'confirmed_conflict', exactMatches: [match()] }),
    ])
    expect(disqualificationReason(s)).toContain('PyPI')
  })

  it('does not disqualify on a similar (non-exact) match', () => {
    const s = summary([
      result({ source: 'npm', status: 'similar_found', similarMatches: [match()] }),
    ])
    expect(disqualificationReason(s)).toBeUndefined()
  })

  it('does not disqualify on an exact conflict from a non-disqualifying source', () => {
    // Wikidata and web presence are deliberately excluded — see the comment
    // in screen.ts on why trademark-style judgement calls don't disqualify.
    const s = summary([
      result({ source: 'wikidata', status: 'confirmed_conflict', exactMatches: [match()] }),
    ])
    expect(disqualificationReason(s)).toBeUndefined()
  })

  it('ignores an unverified result even if it were somehow marked with matches', () => {
    const s = summary([
      result({ source: 'domain', status: 'unable_to_verify', confidence: 0 }),
      result({ source: 'github' }),
    ])
    expect(disqualificationReason(s)).toBeUndefined()
  })

  it('disqualifies a low score even with no exact conflict anywhere', () => {
    const s = summary([result({ source: 'domain' })], 30)
    expect(disqualificationReason(s)).toContain('30')
  })

  it('checks exact-conflict sources before falling back to the score floor', () => {
    // A domain conflict should be the stated reason even if the score also
    // happens to be low — the more specific, more useful explanation wins.
    const s = summary(
      [result({ source: 'domain', status: 'confirmed_conflict', exactMatches: [match()] })],
      20,
    )
    expect(disqualificationReason(s)).toContain('domain')
  })
})
