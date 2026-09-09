import { describe, expect, it } from 'vitest'
import { CATEGORIES, type ScanContext } from '@/lib/core/scan'
import type { Match, SourceResult } from '@/lib/core/types'
import { NON_COMMERCIAL_TAG } from '@/lib/sources/severity'
import {
  classifyMatch,
  classifyScan,
  classifyText,
  isUnclassified,
  mergeClassifications,
} from './classify'
import { classifyScanContext, enrichResult } from './enrich'
import { explainRelevance, industryRelevance, primaryIndustry } from './relevance'
import { CATEGORY_INDUSTRIES, industryById, INDUSTRIES, SECTORS } from './taxonomy'

const now = new Date().toISOString()
const later = new Date(Date.now() + 3_600_000).toISOString()

function match(over: Partial<Match> = {}): Match {
  return {
    externalId: 'x',
    name: 'Environ',
    categories: [],
    similarity: { text: 90, phonetic: 90, visual: 90, overall: 90 },
    severity: 'medium',
    evidence: [],
    ...over,
  }
}

function result(over: Partial<SourceResult> = {}): SourceResult {
  return {
    source: 'web',
    status: 'similar_found',
    confidence: 50,
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

describe('taxonomy', () => {
  it('has unique ids and a known sector for every node', () => {
    const ids = INDUSTRIES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const node of INDUSTRIES) {
      expect(SECTORS).toContain(node.sector)
      expect(node.keywords.length).toBeGreaterThan(2)
      expect(node.label.length).toBeGreaterThan(2)
    }
  })

  it('covers enough ground to be useful', () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(35)
  })

  it('maps every category to real nodes', () => {
    for (const category of CATEGORIES) {
      for (const id of CATEGORY_INDUSTRIES[category]) {
        expect(industryById(id), `${category} -> ${id}`).toBeDefined()
      }
    }
  })

  it('leaves "other" unseeded rather than inventing an industry', () => {
    expect(CATEGORY_INDUSTRIES.other).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */

describe('classifyText', () => {
  it('places security software', () => {
    const c = classifyText('A secrets manager with encryption for developers')
    expect([...c.scores.keys()]).toContain('security')
  })

  it('places apparel', () => {
    expect([...classifyText('Streetwear clothing brand').scores.keys()]).toContain('fashion')
  })

  it('places restaurants', () => {
    expect([...classifyText('A neighbourhood bistro and cafe').scores.keys()]).toContain(
      'restaurant',
    )
  })

  it('returns nothing for text it cannot place', () => {
    expect(isUnclassified(classifyText('lorem ipsum dolor sit amet'))).toBe(true)
    expect(isUnclassified(classifyText(undefined))).toBe(true)
    expect(isUnclassified(classifyText('   '))).toBe(true)
  })

  it('respects word boundaries', () => {
    // "app" must not fire on "apparel", and "bar" must not fire on "barcode".
    const apparel = classifyText('Premium apparel and garments')
    expect([...apparel.scores.keys()]).toContain('fashion')
    const barcode = classifyText('A barcode scanning barcode library')
    expect([...barcode.scores.keys()]).not.toContain('restaurant')
  })

  it('weights specific phrases above generic single words', () => {
    // "record label" should pin music more strongly than the bare word "label".
    const specific = classifyText('An independent record label')
    expect(specific.scores.get('music')).toBe(1)
  })
})

describe('mergeClassifications', () => {
  it('keeps the strongest evidence per node', () => {
    const merged = mergeClassifications([
      { classification: { scores: new Map([['security', 0.4]]) }, weight: 1 },
      { classification: { scores: new Map([['security', 1]]) }, weight: 0.5 },
    ])
    expect(merged.scores.get('security')).toBe(0.5)
  })
})

describe('classifyScan', () => {
  it('seeds from the category alone', () => {
    expect(isUnclassified(classifyScan('fashion'))).toBe(false)
  })

  it('lets the description sharpen a vague category', () => {
    // §3: that tiny description field is what turns "SaaS" into "security SaaS".
    const vague = classifyScan('saas')
    const sharp = classifyScan('saas', 'Secure developer secrets manager with encryption')
    expect([...vague.scores.keys()]).not.toContain('security')
    expect(sharp.scores.get('security')).toBeGreaterThan(vague.scores.get('security') ?? 0)
  })

  it('stays unclassified for "other" with no description', () => {
    expect(isUnclassified(classifyScan('other'))).toBe(true)
  })
})

describe('classifyMatch', () => {
  it('uses source-native categories', () => {
    expect([...classifyMatch({ categories: ['Games'] }).scores.keys()]).toContain('gaming')
  })

  it('falls back to the description', () => {
    expect(
      [...classifyMatch({ description: 'Skin care preparations and cosmetics' }).scores.keys()],
    ).toContain('beauty')
  })

  it('returns nothing when the source gave us nothing usable', () => {
    expect(isUnclassified(classifyMatch({}))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */

describe('industryRelevance', () => {
  const security = classifyScan('saas', 'Secure developer secrets manager with encryption')

  it('scores the same industry at the top', () => {
    // Caps at 90 rather than 100 because prose-derived classification carries a
    // 0.9 discount against a source-assigned category — a description is a
    // weaker signal than a genre Apple stamped on an app.
    const other = classifyMatch({ description: 'Computer security and encryption software' })
    expect(industryRelevance(security, other)).toBeGreaterThanOrEqual(90)
  })

  it('scores a neighbouring field in the middle', () => {
    const devTools = classifyMatch({ description: 'An open source SDK and CLI for developers' })
    const score = industryRelevance(security, devTools)
    expect(score).toBeGreaterThan(30)
    expect(score).toBeLessThan(90)
  })

  it('scores an unrelated field low', () => {
    const clothing = classifyMatch({ description: 'Streetwear clothing and footwear brand' })
    expect(industryRelevance(security, clothing)).toBeLessThan(20)
  })

  it('settles the roadmap example', () => {
    // §18, the case this whole module exists for: for a cybersecurity product,
    // ENVRYN CLOTHING must not weigh the same as ENVIRON SECURITY SOFTWARE.
    const clothing = classifyMatch({ description: 'ENVRYN CLOTHING — apparel and streetwear' })
    const securitySoftware = classifyMatch({
      description: 'ENVIRON SECURITY SOFTWARE — computer security software',
    })
    expect(industryRelevance(security, securitySoftware)!).toBeGreaterThan(
      industryRelevance(security, clothing)!,
    )
  })

  it('returns undefined rather than guessing when either side is unclassified', () => {
    // Inventing even a neutral 50 would let a fabricated value flow into
    // severity and into the score caps.
    expect(industryRelevance(security, classifyMatch({}))).toBeUndefined()
    expect(industryRelevance(classifyScan('other'), security)).toBeUndefined()
  })

  it('never leaves the 0..100 range', () => {
    for (const category of CATEGORIES) {
      const a = classifyScan(category, 'a platform for people')
      for (const node of INDUSTRIES) {
        const b = classifyMatch({ description: node.keywords.join(' ') })
        const score = industryRelevance(a, b)
        if (score === undefined) continue
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('explainRelevance and primaryIndustry', () => {
  const security = classifyScan('saas', 'Encryption and security software')

  it('explains a direct overlap', () => {
    const other = classifyMatch({ description: 'Computer security software' })
    expect(explainRelevance(security, other).toLowerCase()).toContain('both operate')
  })

  it('admits when it cannot tell', () => {
    expect(explainRelevance(security, classifyMatch({})).toLowerCase()).toContain(
      'not enough information',
    )
  })

  it('names the primary industry', () => {
    expect(primaryIndustry(security)).toBe('Security & privacy')
    expect(primaryIndustry(classifyMatch({}))).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */

describe('enrichResult', () => {
  const ctx: ScanContext = {
    name: 'Envryn',
    category: 'saas',
    description: 'Secure developer secrets manager with encryption',
    scanType: 'deep',
  }
  const scan = classifyScanContext(ctx)

  it('adds an industry figure to matches it can classify', () => {
    const enriched = enrichResult(
      ctx,
      scan,
      result({
        similarMatches: [
          match({ name: 'Environ Security', description: 'Computer security software' }),
        ],
      }),
    )
    expect(enriched.similarMatches[0]?.similarity.industry).toBeGreaterThan(50)
  })

  it('leaves industry undefined when the match cannot be classified', () => {
    const enriched = enrichResult(
      ctx,
      scan,
      result({ similarMatches: [match({ name: 'Environ' })] }),
    )
    expect(enriched.similarMatches[0]?.similarity.industry).toBeUndefined()
  })

  it('lowers severity for a same-name match in an unrelated field', () => {
    // The behaviour §18 asks for, end to end.
    const clothing = enrichResult(
      ctx,
      scan,
      result({
        exactMatches: [
          match({ name: 'Envryn', description: 'Clothing and apparel brand, streetwear' }),
        ],
      }),
    )
    const softwareMatch = enrichResult(
      ctx,
      scan,
      result({
        exactMatches: [
          match({ name: 'Envryn', description: 'Computer security software and encryption' }),
        ],
      }),
    )

    const rank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 } as const
    expect(rank[clothing.exactMatches[0]!.severity]).toBeLessThan(
      rank[softwareMatch.exactMatches[0]!.severity],
    )
  })

  it('never promotes a non-commercial match, whatever the name similarity', () => {
    // Regression guard. Wikidata returns people, fictional characters and
    // colours that share the name; the adapter downgrades them, and enrichment
    // must not recompute over that. A Gremlins character is not a conflict.
    const enriched = enrichResult(
      ctx,
      scan,
      result({
        exactMatches: [
          match({
            name: 'Envryn',
            categories: ['wikidata', NON_COMMERCIAL_TAG],
            description: 'fictional character in a film franchise',
            similarity: { text: 100, phonetic: 100, visual: 100, overall: 100 },
          }),
        ],
      }),
    )
    expect(enriched.exactMatches[0]?.severity).toBe('low')
  })

  it('passes unverifiable results through untouched', () => {
    const untouched = result({
      status: 'unable_to_verify',
      confidence: 0,
      error: { code: 'TIMEOUT', message: 'timed out', retryable: true },
    })
    expect(enrichResult(ctx, scan, untouched)).toBe(untouched)
  })

  it('passes results with no matches through untouched', () => {
    const clean = result({ status: 'no_conflict' })
    expect(enrichResult(ctx, scan, clean)).toBe(clean)
  })

  it('is deterministic', () => {
    const build = () =>
      result({ similarMatches: [match({ description: 'Computer security software' })] })
    const a = enrichResult(ctx, scan, build())
    const b = enrichResult(ctx, scan, build())
    expect(a.similarMatches[0]?.similarity).toEqual(b.similarMatches[0]?.similarity)
    expect(a.similarMatches[0]?.severity).toBe(b.similarMatches[0]?.severity)
  })
})
