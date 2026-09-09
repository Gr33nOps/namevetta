import { describe, expect, it } from 'vitest'
import { sourcesFor } from '@/lib/core/adapter'
import { CATEGORIES } from '@/lib/core/scan'
import type { Match, SourceId, SourceResult } from '@/lib/core/types'
import type { TrademarkScreening } from '@/lib/trademark/provider'
import { computeConfidence, computeCoverage, healthMultiplier } from './confidence'
import {
  computeViability,
  decisiveConflicts,
  detectCaps,
  dominantVerdict,
  sourceSubscore,
  trademarkAdvisory,
  verdictFor,
} from './viability'
import { conflictBanner, VERDICT_PRESENTATION } from '@/lib/presentation'
import { CATEGORY_WEIGHTS, SCORE_GROUPS, SOURCE_GROUP } from './weights'

const now = new Date().toISOString()
const later = new Date(Date.now() + 3_600_000).toISOString()

function match(over: Partial<Match> = {}): Match {
  return {
    externalId: 'x',
    name: 'Environ',
    categories: [],
    similarity: { text: 80, phonetic: 80, visual: 80, overall: 80 },
    severity: 'medium',
    evidence: [],
    ...over,
  }
}

function res(source: SourceId, over: Partial<SourceResult> = {}): SourceResult {
  return {
    source,
    status: 'no_conflict',
    confidence: 90,
    exactMatches: [],
    similarMatches: [],
    evidence: [],
    checkedAt: now,
    expiresAt: later,
    fromCache: false,
    ...over,
  }
}

/* -------------------------------------------------------------------------- */

describe('weight tables', () => {
  it('sum to exactly 100 for every category', () => {
    for (const category of CATEGORIES) {
      const total = Object.values(CATEGORY_WEIGHTS[category]).reduce((a, b) => a + b, 0)
      expect(total, `${category} weights must sum to 100`).toBe(100)
    }
  })

  it('contain no trademark group at all', () => {
    // V1 performs no automated trademark research, so a trademark weight would
    // imply a measurement that was never taken.
    expect(SCORE_GROUPS).not.toContain('trademark')
    for (const category of CATEGORIES) {
      expect(Object.keys(CATEGORY_WEIGHTS[category])).not.toContain('trademark')
    }
  })

  it('use only known groups and non-negative weights', () => {
    for (const category of CATEGORIES) {
      const table = CATEGORY_WEIGHTS[category]
      expect(Object.keys(table).sort()).toEqual([...SCORE_GROUPS].sort())
      for (const v of Object.values(table)) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('weight the groups each category actually lives or dies on', () => {
    expect(CATEGORY_WEIGHTS.developer_tool.packages).toBeGreaterThan(
      CATEGORY_WEIGHTS.restaurant.packages,
    )
    expect(CATEGORY_WEIGHTS.creator_brand.social).toBeGreaterThan(CATEGORY_WEIGHTS.saas.social)
    expect(CATEGORY_WEIGHTS.mobile_app.play_store).toBeGreaterThan(CATEGORY_WEIGHTS.saas.play_store)
    expect(CATEGORY_WEIGHTS.restaurant.web).toBeGreaterThan(CATEGORY_WEIGHTS.developer_tool.web)
  })

  it('maps every source to a group', () => {
    for (const entry of sourcesFor('deep')) {
      expect(SCORE_GROUPS).toContain(SOURCE_GROUP[entry.id])
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('healthMultiplier', () => {
  it('assumes healthy until there is enough evidence to say otherwise', () => {
    expect(healthMultiplier(undefined)).toBe(1)
    expect(healthMultiplier({ successRate: 0.1, samples: 3 })).toBe(1)
  })

  it('trusts a reliable source fully', () => {
    expect(healthMultiplier({ successRate: 0.99, samples: 100 })).toBe(1)
  })

  it('degrades a flaky source', () => {
    const m = healthMultiplier({ successRate: 0.89, samples: 100 })
    expect(m).toBeGreaterThan(0.5)
    expect(m).toBeLessThan(1)
  })

  it('heavily discounts a source failing more than one call in five', () => {
    const m = healthMultiplier({ successRate: 0.7, samples: 100 })
    expect(m).toBeLessThan(0.5)
    expect(m).toBeGreaterThan(0)
  })

  it('keeps degrading below the floor rather than flattening', () => {
    const bad = healthMultiplier({ successRate: 0.7, samples: 100 })
    const worse = healthMultiplier({ successRate: 0.2, samples: 100 })
    expect(worse).toBeLessThan(bad)
  })

  it('never returns zero, however badly a source is doing', () => {
    /*
      Zero here multiplies confidence to zero, and a verified result with zero
      confidence fails `SourceResultSchema` — so the orchestrator discarded the
      *successful* answers of any source below 80%, recorded that as another
      failure, and locked it there. The floor is what breaks that loop.
    */
    for (const successRate of [0, 0.05, 0.3, 0.5, 0.79]) {
      expect(healthMultiplier({ successRate, samples: 100 })).toBeGreaterThan(0)
    }
  })

  it('leaves a degraded source able to produce a schema-valid result', () => {
    // The invariant the loop violated, asserted end to end.
    const confidence = computeConfidence({
      source: 'maven_central',
      status: 'no_conflict',
      fromCache: true,
      health: { successRate: 0.38, samples: 200 },
    })
    expect(confidence).toBeGreaterThan(0)
  })
})

describe('computeConfidence', () => {
  it('gives an official API its full ceiling', () => {
    expect(computeConfidence({ source: 'github', status: 'no_conflict', fromCache: false })).toBe(95)
  })

  it('caps web-derived sources far below first-party ones', () => {
    const web = computeConfidence({ source: 'web', status: 'similar_found', fromCache: false })
    const github = computeConfidence({ source: 'github', status: 'similar_found', fromCache: false })
    expect(web).toBeLessThan(github)
    expect(web).toBeLessThanOrEqual(50)
  })

  it('scores an unverifiable source at zero regardless of its ceiling', () => {
    expect(computeConfidence({ source: 'github', status: 'unable_to_verify', fromCache: false })).toBe(0)
    expect(
      computeConfidence({ source: 'socials', status: 'manual_check_recommended', fromCache: false }),
    ).toBe(0)
  })

  it('discounts cached results slightly', () => {
    const fresh = computeConfidence({ source: 'github', status: 'no_conflict', fromCache: false })
    const cached = computeConfidence({ source: 'github', status: 'no_conflict', fromCache: true })
    expect(cached).toBeLessThan(fresh)
  })
})

/* -------------------------------------------------------------------------- */

describe('computeCoverage', () => {
  const weights = CATEGORY_WEIGHTS.saas

  it('is 100 when every intended source answered with full confidence', () => {
    const intended: SourceId[] = ['github', 'npm']
    const results = new Map(
      intended.map((s) => [s, { status: 'no_conflict' as const, confidence: 100 }]),
    )
    expect(computeCoverage({ intended, results, weights })).toBe(100)
  })

  it('drops when a source could not be verified', () => {
    const intended: SourceId[] = ['github', 'web']
    const results = new Map([
      ['github' as SourceId, { status: 'no_conflict' as const, confidence: 100 }],
      ['web' as SourceId, { status: 'unable_to_verify' as const, confidence: 0 }],
    ])
    const coverage = computeCoverage({ intended, results, weights })
    expect(coverage).toBeLessThan(100)
    expect(coverage).toBeGreaterThan(0)
  })

  it('weights the gap by how much the missing source mattered', () => {
    const missing = (source: SourceId): number =>
      computeCoverage({
        intended: ['github', 'web', 'play_store'],
        results: new Map(
          (['github', 'web', 'play_store'] as SourceId[]).map((s) => [
            s,
            s === source
              ? { status: 'unable_to_verify' as const, confidence: 0 }
              : { status: 'no_conflict' as const, confidence: 100 },
          ]),
        ),
        weights,
      })
    // Web presence carries 34 for a SaaS; Google Play carries 2.
    expect(missing('web')).toBeLessThan(missing('play_store'))
  })

  it('ignores sources irrelevant to the category rather than counting them as gaps', () => {
    const coverage = computeCoverage({
      intended: ['web', 'play_store'],
      results: new Map([['web' as SourceId, { status: 'no_conflict' as const, confidence: 100 }]]),
      weights: CATEGORY_WEIGHTS.restaurant,
    })
    expect(coverage).toBe(100)
  })
})

/* -------------------------------------------------------------------------- */

describe('sourceSubscore', () => {
  it('gives a clean source full marks', () => {
    expect(sourceSubscore(res('github'))).toBe(100)
  })

  it('returns null — not zero — for an unverifiable source', () => {
    const r = res('web', {
      status: 'unable_to_verify',
      confidence: 0,
      error: { code: 'TIMEOUT', message: 'timed out', retryable: true },
    })
    expect(sourceSubscore(r)).toBeNull()
  })

  it('penalises in proportion to severity', () => {
    const low = sourceSubscore(
      res('web', { status: 'similar_found', similarMatches: [match({ severity: 'low' })] }),
    )
    const high = sourceSubscore(
      res('web', { status: 'similar_found', similarMatches: [match({ severity: 'high' })] }),
    )
    expect(low).toBeGreaterThan(high!)
  })
})

/* -------------------------------------------------------------------------- */

describe('detectCaps', () => {
  it('caps an exact major same-industry business at 40', () => {
    const caps = detectCaps([
      res('web', {
        status: 'confirmed_conflict',
        exactMatches: [
          match({
            severity: 'high',
            similarity: { text: 100, phonetic: 100, visual: 100, industry: 90, overall: 100 },
          }),
        ],
      }),
    ])
    expect(caps).toContainEqual({ reason: 'Exact major same-industry business', maximum: 40 })
  })

  it('does not apply the same-industry cap to an exact match in an unrelated industry', () => {
    const caps = detectCaps([
      res('web', {
        status: 'confirmed_conflict',
        exactMatches: [
          match({
            severity: 'high',
            similarity: { text: 100, phonetic: 100, visual: 100, industry: 5, overall: 100 },
          }),
        ],
      }),
    ])
    // Industry relevance still decides whether the hard 40 cap fires.
    expect(caps.map((c) => c.maximum)).not.toContain(40)
    // It does not decide whether the reader hears about the collision at all:
    // an exact confirmed conflict always ceilings below "Mostly Clear".
    expect(caps.map((c) => c.maximum)).toContain(69)
  })

  it('never emits a trademark cap, because V1 gathers no trademark evidence', () => {
    // A cap fired from evidence we never collected would be fabricated.
    const caps = detectCaps([
      res('github', {
        status: 'confirmed_conflict',
        exactMatches: [match({ severity: 'critical' })],
      }),
    ])
    expect(caps.map((c) => c.reason.toLowerCase()).join(' ')).not.toContain('trademark')
  })

  it('ignores conflicts reported by a source that could not be verified', () => {
    const caps = detectCaps([
      res('web', {
        status: 'unable_to_verify',
        confidence: 0,
        error: { code: 'DOWN', message: 'upstream unavailable', retryable: true },
      }),
    ])
    expect(caps).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * The audit finding, in one place.
 *
 * A real production report showed **Vetta Score 100** and "48 of 53 checks
 * clear" on the same screen as a confirmed exact CPAN conflict. Nothing was
 * broken: CPAN sits in the `packages` group, `packages` carries zero weight
 * for a restaurant, and a weighted average over the groups that answered
 * cannot see a group it is not averaging. The arithmetic was right and the
 * report was untrustworthy, which is the worse of the two failures.
 */
describe('a confirmed conflict beside a perfect score', () => {
  /** A restaurant scan: `packages` weight is 0, so CPAN cannot move the average. */
  const restaurantWithCpanConflict = () => [
    res('domain', { status: 'no_conflict' }),
    res('web', { status: 'no_conflict' }),
    res('socials', { status: 'manual_check_recommended', confidence: 0 }),
    res('cpan', {
      status: 'confirmed_conflict',
      exactMatches: [
        match({
          externalId: 'cpan:northbeam',
          name: 'Northbeam',
          severity: 'high',
          similarity: { text: 100, phonetic: 100, visual: 100, overall: 100 },
        }),
      ],
    }),
  ]

  it('is exactly the shape that used to score 100', () => {
    // The weighting is untouched: the group genuinely carries nothing here.
    expect(CATEGORY_WEIGHTS.restaurant.packages).toBe(0)
    const groups = computeViability({
      category: 'restaurant',
      results: restaurantWithCpanConflict(),
    }).groups
    expect(groups.find((g) => g.group === 'packages')?.weight).toBe(0)
  })

  it('no longer lets the score contradict the finding', () => {
    const viability = computeViability({
      category: 'restaurant',
      results: restaurantWithCpanConflict(),
    })

    // The average is still 100 — the weighting was not vandalised to fix this.
    expect(viability.rawScore).toBe(100)
    // But the number a person reads cannot say "clear" over a confirmed
    // collision, so it is ceilinged below the "Mostly Clear" band.
    expect(viability.score).toBeLessThan(70)
    expect(viability.caps.map((c) => c.maximum)).toContain(69)
  })

  it('never labels such a report Clear or Mostly Clear', () => {
    const { score } = computeViability({
      category: 'restaurant',
      results: restaurantWithCpanConflict(),
    })
    const label = VERDICT_PRESENTATION[verdictFor(score)].label
    expect(label).not.toBe('Clear')
    expect(label).not.toBe('Mostly Clear')
    // And the tone can never be the green one.
    expect(VERDICT_PRESENTATION[verdictFor(score)].tone).not.toBe('ok')
  })

  it('names the collision above the score, not only under it', () => {
    const { conflicts } = computeViability({
      category: 'restaurant',
      results: restaurantWithCpanConflict(),
    })
    expect(conflicts).toHaveLength(1)
    expect(conflictBanner(conflicts)).toContain('Northbeam')
  })

  it('applies the ceiling whatever the category, since an exact match is exact', () => {
    for (const category of CATEGORIES) {
      const { score } = computeViability({
        category,
        results: restaurantWithCpanConflict(),
      })
      expect(score, `${category} must not read as clear over an exact conflict`).toBeLessThan(70)
    }
  })

  it('leaves a clean report alone', () => {
    // The cap must not fire on anything short of a confirmed exact collision,
    // or every report becomes a warning and the warning stops meaning anything.
    const clean = computeViability({
      category: 'restaurant',
      results: [res('domain'), res('web'), res('cpan')],
    })
    expect(clean.score).toBe(100)
    expect(clean.caps).toEqual([])
    expect(conflictBanner(clean.conflicts)).toBe('')
  })

  it('does not fire on a near miss, only on an exact one', () => {
    const nearMiss = computeViability({
      category: 'restaurant',
      results: [
        res('domain'),
        res('web', { status: 'similar_found', similarMatches: [match({ severity: 'medium' })] }),
      ],
    })
    expect(nearMiss.caps.map((c) => c.maximum)).not.toContain(69)
  })

  it('ignores a conflict claimed by a source that could not be verified', () => {
    // The schema forbids matches on an unverified result; this pins the
    // reader's half of that rule too.
    expect(
      decisiveConflicts([
        res('cpan', {
          status: 'unable_to_verify',
          confidence: 0,
          error: { code: 'LOOKUP_FAILED', message: 'unreachable', retryable: true },
        }),
      ]),
    ).toEqual([])
  })
})

describe('computeViability', () => {
  it('scores a completely clean name at the top', () => {
    const results = sourcesFor('deep').map((s) => res(s.id))
    const v = computeViability({ category: 'saas', results })
    expect(v.score).toBe(100)
    expect(v.caps).toHaveLength(0)
    expect(verdictFor(v.score)).toBe('strong')
  })

  it('caps a clean-everywhere name against a major same-industry business', () => {
    const clean = sourcesFor('deep')
      .filter((s) => SOURCE_GROUP[s.id] !== 'web')
      .map((s) => res(s.id))
    const results = [
      ...clean,
      res('web', {
        status: 'confirmed_conflict',
        exactMatches: [
          match({
            severity: 'high',
            similarity: { text: 99, phonetic: 99, visual: 99, industry: 95, overall: 99 },
          }),
        ],
      }),
    ]

    const v = computeViability({ category: 'saas', results })
    expect(v.rawScore).toBeGreaterThan(50)
    expect(v.score).toBeLessThanOrEqual(40)
  })

  it('does not punish a quick scan for running fewer sources', () => {
    const quick = sourcesFor('quick').map((s) => res(s.id))
    const v = computeViability({ category: 'saas', results: quick })
    expect(v.score).toBe(100)
  })

  it('excludes unverifiable sources from the average instead of zeroing them', () => {
    const withFailure = [
      res('github'),
      res('npm'),
      res('web', {
        status: 'unable_to_verify',
        confidence: 0,
        error: { code: 'TIMEOUT', message: 'timed out', retryable: true },
      }),
    ]
    const v = computeViability({ category: 'saas', results: withFailure })
    expect(v.score).toBe(100)
    expect(v.groups.find((g) => g.group === 'web')?.subscore).toBeNull()
  })

  it('stamps the scoring version so old reports stay explainable', () => {
    const v = computeViability({ category: 'saas', results: [res('github')] })
    // Bumped to 2 when trademark left the automatic score.
    expect(v.scoringVersion).toBeGreaterThanOrEqual(2)
  })

  it('is deterministic: identical evidence always yields an identical score', () => {
    const build = (): SourceResult[] => [
      res('github'),
      res('web', { status: 'similar_found', similarMatches: [match()] }),
    ]
    const a = computeViability({ category: 'saas', results: build() })
    const b = computeViability({ category: 'saas', results: build() })
    expect(a.score).toBe(b.score)
  })
})

/* -------------------------------------------------------------------------- */

describe('trademarkAdvisory', () => {
  const screening = (over: Partial<TrademarkScreening> = {}): TrademarkScreening => ({
    status: 'not_started',
    checks: [],
    importedMatches: [],
    ...over,
  })

  it('reports unknown concern when no screening has happened', () => {
    const a = trademarkAdvisory(undefined)
    expect(a.status).toBe('not_started')
    expect(a.concern).toBe('unknown')
  })

  it('never reports a reassuring concern for an incomplete screening', () => {
    // The single most important rule in the scoring module: partial trademark
    // work must never read as good news.
    for (const status of ['not_started', 'in_progress', 'unable_to_verify'] as const) {
      const a = trademarkAdvisory(screening({ status }))
      expect(a.concern).toBe('unknown')
      expect(a.summary.toLowerCase()).not.toContain('no conflict')
    }
  })

  it('reports low concern only when the user completed and found nothing', () => {
    const a = trademarkAdvisory(
      screening({
        status: 'completed',
        checks: [{ jurisdiction: 'us', status: 'completed', outcome: 'no_obvious_conflict' }],
      }),
    )
    expect(a.concern).toBe('low')
    expect(a.summary.toLowerCase()).toContain('preliminary')
  })

  it('escalates when the user reported a possible conflict', () => {
    const a = trademarkAdvisory(
      screening({
        status: 'completed',
        checks: [{ jurisdiction: 'us', status: 'completed', outcome: 'possible_conflict' }],
      }),
    )
    expect(a.concern).toBe('high')
  })

  it('reports medium concern when the user could not tell', () => {
    const a = trademarkAdvisory(
      screening({
        status: 'completed',
        checks: [{ jurisdiction: 'us', status: 'completed', outcome: 'unclear' }],
      }),
    )
    expect(a.concern).toBe('medium')
  })

  it('escalates to critical on an imported critical match', () => {
    const a = trademarkAdvisory(
      screening({
        status: 'completed',
        checks: [{ jurisdiction: 'us', status: 'completed', outcome: 'no_obvious_conflict' }],
        importedMatches: [match({ severity: 'critical' })],
      }),
    )
    expect(a.concern).toBe('critical')
  })

  it('never claims legal clearance in any summary', () => {
    const states: TrademarkScreening[] = [
      screening(),
      screening({ status: 'in_progress' }),
      screening({ status: 'unable_to_verify' }),
      screening({
        status: 'completed',
        checks: [{ jurisdiction: 'us', status: 'completed', outcome: 'no_obvious_conflict' }],
      }),
    ]
    for (const s of states) {
      const summary = trademarkAdvisory(s).summary.toLowerCase()
      for (const banned of ['legally safe', 'cleared', 'guaranteed', 'safe to register']) {
        expect(summary).not.toContain(banned)
      }
    }
  })
})

describe('verdictFor', () => {
  it('covers the full range in order', () => {
    expect(verdictFor(100)).toBe('strong')
    expect(verdictFor(85)).toBe('strong')
    expect(verdictFor(70)).toBe('promising')
    expect(verdictFor(50)).toBe('mixed')
    expect(verdictFor(30)).toBe('risky')
    expect(verdictFor(0)).toBe('avoid')
  })

  it('makes a confirmed exact conflict the dominant conclusion even beside a high score', () => {
    const conflict = res('npm', {
      status: 'confirmed_conflict',
      exactMatches: [match({ name: 'Northbeam', severity: 'high' })],
    })
    expect(dominantVerdict(100, [conflict])).toBe('risky')
  })
})
