import { describe, expect, it } from 'vitest'
import type { ScanSummary } from '@/lib/orchestrator/run'
import type { ScoreGroup } from '@/lib/scoring/weights'
import { compareCandidates, type Candidate } from './rank'

function summary(over: {
  score?: number
  coverage?: number
  caps?: { reason: string; maximum: number }[]
  groups?: Partial<Record<ScoreGroup, number | null>>
}): ScanSummary {
  const defaults: Partial<Record<ScoreGroup, number | null>> = {
    domain: 80,
    web: 80,
    github: 80,
    packages: 80,
  }
  const groupValues = { ...defaults, ...over.groups }

  return {
    results: [],
    coverage: over.coverage ?? 90,
    viability: {
      score: over.score ?? 80,
      rawScore: over.score ?? 80,
      caps: over.caps ?? [],
      conflicts: [],
      scoringVersion: 2,
      groups: (Object.entries(groupValues) as [ScoreGroup, number | null][]).map(
        ([group, subscore]) => ({ group, subscore, weight: 25, contributors: [] }),
      ),
    },
  }
}

const candidate = (name: string, s: Parameters<typeof summary>[0]): Candidate => ({
  name,
  summary: summary(s),
})

describe('compareCandidates', () => {
  it('ranks by score, highest first', () => {
    const result = compareCandidates([
      candidate('Beta', { score: 70 }),
      candidate('Alpha', { score: 92 }),
      candidate('Gamma', { score: 55 }),
    ])
    expect(result.candidates.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(result.winner).toBe('Alpha')
  })

  it('gives tied candidates the same rank', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 88 }),
      candidate('Beta', { score: 88 }),
    ])
    expect(result.candidates.map((c) => c.rank)).toEqual([1, 1])
  })

  it('declines to pick a winner when the gap is not meaningful', () => {
    // A 2-point gap is noise, not a verdict. Declaring a winner would imply a
    // precision the scoring does not have.
    const result = compareCandidates([
      candidate('Alpha', { score: 82 }),
      candidate('Beta', { score: 80 }),
    ])
    expect(result.tooCloseToCall).toBe(true)
    expect(result.winner).toBeUndefined()
    expect(result.winnerReason.toLowerCase()).toContain('too small')
  })

  it('picks a winner when the gap is decisive', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 92 }),
      candidate('Beta', { score: 61 }),
    ])
    expect(result.tooCloseToCall).toBe(false)
    expect(result.winner).toBe('Alpha')
  })

  it('explains the win from the groups that actually differ', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 92, groups: { web: 95, domain: 90 } }),
      candidate('Beta', { score: 60, groups: { web: 30, domain: 88 } }),
    ])
    // Web differs by 65 points; domain by 2. The explanation must name web.
    expect(result.winnerReason.toLowerCase()).toContain('web')
    expect(result.winnerReason.toLowerCase()).not.toContain('domains,')
  })

  it('leads the explanation with a cap when one fired', () => {
    // A cap is the most decisive thing that can happen to a candidate, so it
    // outranks any group-level difference in the explanation.
    const result = compareCandidates([
      candidate('Alpha', { score: 88 }),
      candidate('Beta', {
        score: 40,
        caps: [{ reason: 'Exact major same-industry business', maximum: 40 }],
      }),
    ])
    expect(result.winnerReason).toContain('hard limit')
    expect(result.winnerReason.toLowerCase()).toContain('same-industry business')
  })

  it('surfaces caps on the candidate that hit them', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 88 }),
      candidate('Beta', {
        score: 40,
        caps: [{ reason: 'Exact major same-industry business', maximum: 40 }],
      }),
    ])
    expect(result.candidates.find((c) => c.name === 'Beta')?.caps).toHaveLength(1)
    expect(result.candidates.find((c) => c.name === 'Alpha')?.caps).toHaveLength(0)
  })
})

describe('strengths and weaknesses', () => {
  it('names a group where a candidate clearly beats the field', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 90, groups: { github: 100 } }),
      candidate('Beta', { score: 70, groups: { github: 20 } }),
    ])
    expect(result.candidates[0]?.strengths).toContain('GitHub')
  })

  it('names where a trailing candidate falls behind the leader', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 90, groups: { web: 95 } }),
      candidate('Beta', { score: 60, groups: { web: 25 } }),
    ])
    expect(result.candidates[1]?.weaknesses).toContain('Web & business presence')
  })

  it('claims nothing when the groups are close', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 80, groups: { web: 80, github: 80 } }),
      candidate('Beta', { score: 79, groups: { web: 79, github: 78 } }),
    ])
    expect(result.candidates[0]?.strengths).toEqual([])
    expect(result.candidates[1]?.weaknesses).toEqual([])
  })

  it('ignores groups that produced no answer rather than treating them as zero', () => {
    // An unchecked group is absent, not a failure. Comparing against it would
    // manufacture a difference from missing data.
    const result = compareCandidates([
      candidate('Alpha', { score: 90, groups: { github: 100 } }),
      candidate('Beta', { score: 70, groups: { github: null } }),
    ])
    expect(result.candidates[0]?.strengths).not.toContain('GitHub')
    expect(result.candidates[1]?.weaknesses).not.toContain('GitHub')
  })
})

describe('coverage disparity', () => {
  it('warns when candidates were researched to very different depths', () => {
    // The honesty rule unique to comparison: a 92 from half the checks is not
    // demonstrably better than an 88 from all of them.
    const result = compareCandidates([
      candidate('Alpha', { score: 92, coverage: 95 }),
      candidate('Beta', { score: 88, coverage: 45 }),
    ])
    expect(result.coverageWarning).toBeDefined()
    expect(result.coverageWarning).toContain('45%')
    expect(result.coverageWarning).toContain('95%')
    expect(result.coverageWarning).toContain('Beta')
  })

  it('stays quiet when coverage is comparable', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 92, coverage: 90 }),
      candidate('Beta', { score: 70, coverage: 85 }),
    ])
    expect(result.coverageWarning).toBeUndefined()
  })
})

describe('edge cases', () => {
  it('handles a single candidate without pretending it won a contest', () => {
    const result = compareCandidates([candidate('Alpha', { score: 90 })])
    expect(result.winner).toBe('Alpha')
    expect(result.winnerReason).toContain('only candidate')
    expect(result.tooCloseToCall).toBe(false)
  })

  it('handles an empty set without throwing', () => {
    const result = compareCandidates([])
    expect(result.candidates).toEqual([])
    expect(result.winner).toBeUndefined()
    expect(result.coverageWarning).toBeUndefined()
  })

  it('is deterministic, including the tie-break order', () => {
    const build = (): Candidate[] => [
      candidate('Zeta', { score: 80 }),
      candidate('Alpha', { score: 80 }),
    ]
    const a = compareCandidates(build())
    const b = compareCandidates(build())
    expect(a.candidates.map((c) => c.name)).toEqual(b.candidates.map((c) => c.name))
    // Equal scores fall back to name order rather than input order.
    expect(a.candidates[0]?.name).toBe('Alpha')
  })

  it('never claims a winner it cannot justify', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 50 }),
      candidate('Beta', { score: 50 }),
      candidate('Gamma', { score: 50 }),
    ])
    expect(result.winner).toBeUndefined()
    expect(result.tooCloseToCall).toBe(true)
  })

  it('names every candidate in a three-way tie', () => {
    const result = compareCandidates([
      candidate('Alpha', { score: 100 }),
      candidate('Beta', { score: 100 }),
      candidate('Gamma', { score: 100 }),
    ])
    expect(result.winner).toBeUndefined()
    expect(result.winnerReason).toContain('Alpha, Beta and Gamma')
  })
})
