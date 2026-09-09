import { describe, expect, it } from 'vitest'
import { checkGrounding } from './grounding'
import type { Facts } from './digest'

const LABELS = [
  'domains', 'github', 'npm', 'pypi', 'youtube', 'appstore', 'googleplay',
  'webpresence', 'wikidata', 'secedgar', 'companieshouseuk', 'socialidentity',
]

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    entities: new Set(['envryn', 'envrynsecurity']),
    verifiedSources: new Set(['github', 'domain']),
    unverifiedSources: new Set(['play_store']),
    knownLabels: new Set(LABELS),
    numbers: new Set([55, 71, 3, 80]),
    score: 55,
    coveragePercent: 71,
    verifiedSourceCount: 3,
    clearSourceCount: 1,
    unverifiedSourceCount: 1,
    ...overrides,
  }
}

describe('checkGrounding', () => {
  it('passes plain text that stays inside the digest', () => {
    const text =
      'Envryn scored 55 out of 100, with 71% research coverage. The closest match, ' +
      'Envryn Security, was found on GitHub.'
    expect(checkGrounding(text, facts()).ok).toBe(true)
  })

  it('rejects every forbidden legal-conclusion phrase', () => {
    const result = checkGrounding('This name is legally safe to register.', facts())
    expect(result.ok).toBe(false)
    expect(result.failures.some((f) => f.rule === 'forbidden_phrase')).toBe(true)
  })

  it('rejects a number that never appeared in the digest', () => {
    // 92 is not in facts().numbers — a model inventing a friendlier score.
    const result = checkGrounding('This name scored 92 out of 100.', facts())
    expect(result.ok).toBe(false)
    expect(result.failures).toContainEqual({ rule: 'unknown_number', detail: '92' })
  })

  it('does not let a coverage percentage become a checked-source count', () => {
    const result = checkGrounding('No conflicts were found in the 71 checked sources.', facts())
    expect(result.ok).toBe(false)
    expect(result.failures).toContainEqual({ rule: 'unknown_number', detail: '71' })
  })

  it('allows coverage only when it is described as coverage', () => {
    expect(checkGrounding('Research coverage was 71%.', facts()).ok).toBe(true)
  })

  it('rejects a competitor name that was never found', () => {
    const result = checkGrounding('This is similar to Stripe and Notion.', facts())
    expect(result.ok).toBe(false)
    expect(result.failures.some((f) => f.rule === 'unknown_entity' && f.detail.includes('Stripe'))).toBe(
      true,
    )
  })

  it('allows small counting numbers without requiring them in the digest', () => {
    // "one strong match" reads naturally and is not a fabricated statistic.
    const result = checkGrounding('There was one strong match worth reviewing.', facts())
    expect(result.ok).toBe(true)
  })

  it('does not flag a source label mentioned in prose', () => {
    const result = checkGrounding('This was found via GitHub and Companies House.', facts({
      verifiedSources: new Set(['github', 'companies_house']),
    }))
    expect(result.ok).toBe(true)
  })

  it('does not flag common capitalised words', () => {
    const result = checkGrounding('The App Store and Google Play were both checked in January.', facts())
    expect(result.ok).toBe(true)
  })

  it('allows a short all-caps acronym without requiring it in the digest', () => {
    const result = checkGrounding('It found several URLs worth checking by hand.', facts())
    expect(result.ok).toBe(true)
  })

  it('allows a reordering of a known multi-word label', () => {
    // "Companies House (UK)" reordered, exactly as a real model output did.
    const result = checkGrounding('This was listed on UK Companies House.', facts({
      entities: new Set(['envryn', 'uk', 'companies', 'house']),
    }))
    expect(result.ok).toBe(true)
  })

  it('still rejects a multi-word phrase where not every word is known', () => {
    const result = checkGrounding('This was listed on UK Rival Systems.', facts({
      entities: new Set(['envryn', 'uk']),
    }))
    expect(result.ok).toBe(false)
  })
})
