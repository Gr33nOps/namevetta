import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceResult } from '@/lib/core/types'
import type { ScanContext } from '@/lib/core/scan'
import type { ScanSummary } from '@/lib/orchestrator/run'

/**
 * Integration coverage for the screening step (§7, §10).
 *
 * The orchestrator is mocked so each candidate's Quick Check outcome is
 * scripted: this exercises the pipeline logic — the exactly-five guarantee,
 * replacements filling disqualified slots, and quality-aware selection — without
 * touching the network or the (real, sequential) source adapters.
 */
vi.mock('@/lib/orchestrator/run', () => ({ runScanToCompletion: vi.fn() }))

const { runScanToCompletion } = await import('@/lib/orchestrator/run')
const mockRun = runScanToCompletion as unknown as ReturnType<typeof vi.fn>
const { screenCandidates } = await import('./screen')

function clean(score = 80): ScanSummary {
  const result: SourceResult = {
    source: 'github',
    status: 'no_conflict',
    confidence: 95,
    exactMatches: [],
    similarMatches: [],
    evidence: [],
    checkedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    fromCache: false,
  }
  return {
    results: [result],
    viability: { score, rawScore: score, caps: [], groups: [], conflicts: [], scoringVersion: 1 },
    coverage: 80,
  }
}

it('stops researching more candidates after a cancelled request', async () => {
  mockRun.mockResolvedValue(clean())
  const abort = new AbortController()
  const result = await screenCandidates({
    names: ['Willow Way', 'Maple Mill', 'Cedar Table'], category: 'restaurant', description: 'A bakery',
    signal: abort.signal, onCandidate: () => abort.abort(),
  })
  expect(result.survivors.map((candidate) => candidate.name)).toEqual(['Willow Way'])
})

function taken(): ScanSummary {
  const result: SourceResult = {
    source: 'domain',
    status: 'confirmed_conflict',
    confidence: 95,
    exactMatches: [
      {
        externalId: 'x',
        name: 'taken.com',
        categories: [],
        similarity: { overall: 100, text: 100, phonetic: 100, visual: 100 },
        severity: 'critical',
        active: true,
        evidence: [],
      },
    ],
    similarMatches: [],
    evidence: [],
    checkedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    fromCache: false,
  }
  return {
    results: [result],
    viability: { score: 10, rawScore: 10, caps: [], groups: [], conflicts: [], scoringVersion: 1 },
    coverage: 80,
  }
}

/** Script the mock from a name -> summary map. */
function script(map: Record<string, ScanSummary>): void {
  mockRun.mockImplementation(async (ctx?: ScanContext) => (ctx ? map[ctx.name] : undefined) ?? clean())
}

beforeEach(() => mockRun.mockReset())
afterEach(() => vi.clearAllMocks())

describe('screenCandidates', () => {
  it('returns exactly five when the pool has more than five clean names', async () => {
    const names = ['Cloudari', 'Marketrove', 'Lumira', 'Nordvel', 'Brixto', 'Pallova', 'Ternex', 'Vantel']
    script(Object.fromEntries(names.map((n) => [n, clean()])))

    const { ranked } = await screenCandidates({ names, category: 'saas', description: undefined })
    expect(ranked.candidates.length).toBe(5)
    // Stops once the survivor buffer is reached rather than screening the pool.
    expect(mockRun.mock.calls.length).toBeLessThan(names.length)
  })

  it('fills the five slots from replacements when early candidates are taken', async () => {
    const names = ['Cloudari', 'Marketrove', 'Lumira', 'Nordvel', 'Brixto', 'Pallova', 'Ternex', 'Vantel']
    // The first three are already taken; five clean names remain to fill the list.
    script({
      Cloudari: taken(),
      Marketrove: taken(),
      Lumira: taken(),
      Nordvel: clean(),
      Brixto: clean(),
      Pallova: clean(),
      Ternex: clean(),
      Vantel: clean(),
    })

    const { survivors, ranked } = await screenCandidates({ names, category: 'saas', description: undefined })
    expect(survivors.length).toBeGreaterThanOrEqual(5)
    expect(ranked.candidates.length).toBe(5)
    expect(ranked.candidates.map((c) => c.name)).not.toContain('Cloudari')
  })

  it('drops the weakest brand when tie-broken, keeping the five strongest', async () => {
    // Six clean names on the same digital score; brandability must decide which
    // five ship, dropping the generated-sounding one.
    const names = ['Cloudari', 'Marketrove', 'Lumira', 'Nordvel', 'Brixto', 'DataifyAI']
    script(Object.fromEntries(names.map((n) => [n, clean(80)])))

    const { ranked } = await screenCandidates({ names, category: 'saas', description: undefined })
    expect(ranked.candidates.length).toBe(5)
    expect(ranked.candidates.map((c) => c.name)).not.toContain('DataifyAI')
  })

  it('honours stopAfterSurvivors for the broader-check flow', async () => {
    const names = ['Cloudari', 'Marketrove', 'Lumira', 'Nordvel', 'Brixto']
    script(Object.fromEntries(names.map((n) => [n, clean()])))

    await screenCandidates({ names, category: 'saas', description: undefined, stopAfterSurvivors: 2 })
    expect(mockRun.mock.calls.length).toBe(2)
  })

  it('returns fewer than five, honestly, when the whole pool is taken', async () => {
    const names = ['Cloudari', 'Marketrove', 'Lumira']
    script(Object.fromEntries(names.map((n) => [n, taken()])))

    const { survivors, ranked } = await screenCandidates({ names, category: 'saas', description: undefined })
    expect(survivors.length).toBe(0)
    expect(ranked.candidates.length).toBe(0)
  })
})
