import { describe, expect, it } from 'vitest'
import { CATEGORIES, type ScanContext } from '@/lib/core/scan'
import { assistVariants, buildAssistBrief, searchDestinations } from './assist'
import { suggestClasses, suggestGoodsAndServices } from './classes'
import {
  emptyScreening,
  hasAutomatedProviders,
  providerFor,
  rollUpScreening,
  TRADEMARK_IMPORT_PARSERS,
  TRADEMARK_PROVIDERS,
  type JurisdictionCheck,
} from './provider'

const ctx: ScanContext = {
  name: 'Envryn',
  category: 'saas',
  description: 'Secure developer secrets manager',
  scanType: 'deep',
}

describe('provider seam', () => {
  it('registers no automated provider in V1', () => {
    // V1 does no automated trademark research. This is the assertion that keeps
    // that a deliberate state rather than something that drifts.
    expect(TRADEMARK_PROVIDERS).toHaveLength(0)
    expect(hasAutomatedProviders()).toBe(false)
    expect(providerFor('us')).toBeUndefined()
  })

  it('registers no import parser until a format is verified', () => {
    // The import feature is optional and must not be a launch dependency.
    expect(TRADEMARK_IMPORT_PARSERS).toHaveLength(0)
  })

  it('keeps the extension point available for later jurisdictions', () => {
    // Adding USPTO later means pushing one object here — nothing restructures.
    expect(Array.isArray(TRADEMARK_PROVIDERS)).toBe(true)
  })
})

describe('rollUpScreening', () => {
  const check = (status: JurisdictionCheck['status']): JurisdictionCheck => ({
    jurisdiction: 'us',
    status,
  })

  it('is not_started with no checks', () => {
    expect(rollUpScreening([])).toBe('not_started')
    expect(emptyScreening().status).toBe('not_started')
  })

  it('is completed only when every jurisdiction is completed', () => {
    expect(rollUpScreening([check('completed'), check('completed')])).toBe('completed')
    // Partial progress must never round up to done.
    expect(rollUpScreening([check('completed'), check('not_started')])).toBe('in_progress')
    expect(rollUpScreening([check('completed'), check('in_progress')])).toBe('in_progress')
  })

  it('stays not_started when nothing has been touched', () => {
    expect(rollUpScreening([check('not_started'), check('not_started')])).toBe('not_started')
  })

  it('reports unable_to_verify when every check failed', () => {
    expect(rollUpScreening([check('unable_to_verify'), check('unable_to_verify')])).toBe(
      'unable_to_verify',
    )
  })
})

describe('assistVariants', () => {
  it('always leads with the exact name', () => {
    const variants = assistVariants('Envryn')
    expect(variants[0]?.value).toBe('Envryn')
    expect(variants[0]?.kind).toBe('exact')
  })

  it('includes confusable spellings an examiner would consider', () => {
    const values = assistVariants('Envryn', 30).map((v) => v.value)
    expect(values).toContain('envrin')
  })

  it('includes a phonetic form', () => {
    expect(assistVariants('Envryn', 30).some((v) => v.kind === 'phonetic')).toBe(true)
  })

  it('gives every variant a reason the user can read', () => {
    for (const v of assistVariants('Envryn')) {
      expect(v.reason.length).toBeGreaterThan(10)
    }
  })

  it('respects the limit and never duplicates', () => {
    const variants = assistVariants('Envryn', 6)
    expect(variants.length).toBeLessThanOrEqual(6)
    expect(new Set(variants.map((v) => v.value.toLowerCase())).size).toBe(variants.length)
  })

  it('handles a multi-word name', () => {
    const variants = assistVariants('Acme Security')
    expect(variants[0]?.value).toBe('Acme Security')
    expect(variants.some((v) => v.kind === 'normalized')).toBe(true)
  })
})

describe('suggestClasses', () => {
  it('suggests both 009 and 042 for software', () => {
    // The pair founders most often miss: the software as a good, and providing
    // it as a service.
    const codes = suggestClasses('saas').map((c) => c.code)
    expect(codes).toContain('009')
    expect(codes).toContain('042')
  })

  it('suggests apparel classes for fashion', () => {
    expect(suggestClasses('fashion').map((c) => c.code)).toContain('025')
  })

  it('suggests hospitality classes for a restaurant', () => {
    expect(suggestClasses('restaurant').map((c) => c.code)).toContain('043')
  })

  it('adds a class the description reveals but the category does not', () => {
    const withPayments = suggestClasses('saas', 'A payment processing platform').map((c) => c.code)
    expect(withPayments).toContain('036')
    expect(suggestClasses('saas').map((c) => c.code)).not.toContain('036')
  })

  it('gives every suggestion a title and a rationale', () => {
    for (const category of CATEGORIES) {
      for (const c of suggestClasses(category)) {
        expect(c.title.length).toBeGreaterThan(5)
        expect(c.rationale.length).toBeGreaterThan(10)
        expect(c.code).toMatch(/^\d{3}$/)
      }
    }
  })

  it('returns at least one class for every category', () => {
    for (const category of CATEGORIES) {
      expect(suggestClasses(category).length).toBeGreaterThan(0)
    }
  })
})

describe('suggestGoodsAndServices', () => {
  it('puts the user description first when supplied', () => {
    const terms = suggestGoodsAndServices('saas', 'Secure secrets manager')
    expect(terms[0]).toBe('secure secrets manager')
  })

  it('falls back to category wording with no description', () => {
    expect(suggestGoodsAndServices('saas').length).toBeGreaterThan(0)
  })
})

describe('searchDestinations', () => {
  const destinations = searchDestinations()

  it('covers the US, EU and international registries', () => {
    expect(destinations.map((d) => d.jurisdiction).sort()).toEqual(['eu', 'international', 'us'])
  })

  it('links only to free official registry search pages', () => {
    for (const d of destinations) {
      expect(d.free).toBe(true)
      expect(d.url).toMatch(/^https:\/\//)
    }
    const hosts = destinations.map((d) => new URL(d.url).hostname)
    expect(hosts).toContain('tmsearch.uspto.gov')
    expect(hosts).toContain('branddb.wipo.int')
  })

  it('gives actionable instructions and guidance for each registry', () => {
    for (const d of destinations) {
      expect(d.instructions.length).toBeGreaterThanOrEqual(3)
      expect(d.whatToLookFor.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('links to search pages rather than constructing deep query URLs', () => {
    // These are SPAs with undocumented query parameters. A stale deep link that
    // silently searched the wrong thing would be worse than no link.
    for (const d of destinations) {
      expect(new URL(d.url).search).toBe('')
    }
  })
})

describe('buildAssistBrief', () => {
  const brief = buildAssistBrief(ctx)

  it('assembles variants, classes, wording and destinations', () => {
    expect(brief.name).toBe('Envryn')
    expect(brief.variants.length).toBeGreaterThan(2)
    expect(brief.classes.length).toBeGreaterThan(0)
    expect(brief.goodsAndServices.length).toBeGreaterThan(0)
    expect(brief.destinations.length).toBe(3)
  })

  it('sets expectations about how many searches are involved', () => {
    expect(brief.estimatedSearches).toBeGreaterThanOrEqual(brief.destinations.length)
  })

  it('is pure local computation — safe to run with no network or credentials', () => {
    // Nothing in the brief may require a registry call, a key, or a quota.
    expect(() => buildAssistBrief({ ...ctx, description: undefined })).not.toThrow()
  })

  it('works for every category', () => {
    for (const category of CATEGORIES) {
      const b = buildAssistBrief({ ...ctx, category })
      expect(b.classes.length).toBeGreaterThan(0)
      expect(b.variants.length).toBeGreaterThan(0)
    }
  })
})
