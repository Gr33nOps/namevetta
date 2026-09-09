import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMUnavailableError } from '@/lib/providers/llm'

const complete = vi.fn()
vi.mock('@/lib/providers/groq', () => ({
  groqProvider: { id: 'groq', label: 'Groq', model: 'test-model', complete: (...a: unknown[]) => complete(...a) },
}))

const { generateNames, sanitiseCandidates, filterQuality, rankByQuality } = await import('./namegen')

/** A batch response shaped like the provider's, for the mock. */
function batch(names: unknown[]): { text: string; model: string } {
  return { text: JSON.stringify({ names }), model: 'test-model' }
}

/** Twenty-plus distinct, clean, non-famous coined names for pool tests. */
const GOOD_POOL = [
  'Cloudari', 'Marketrove', 'Nordvel', 'Lumira', 'Nordvel', 'Brixto', 'Pallova', 'Ternex',
  'Vantel', 'Kestril', 'Orbane', 'Halcyra', 'Juniro', 'Wyndel', 'Sablon', 'Corvina', 'Tavira',
  'Miravel', 'Dovern', 'Rundis', 'Calyx', 'Feldspar',
]

beforeEach(() => {
  complete.mockReset()
})

it('requests distinctive word pairs rather than crowded literal feature names', async () => {
  complete.mockResolvedValue(batch(GOOD_POOL))
  await generateNames('Software', 'An offline file viewer', undefined, { maxAttempts: 1 })
  expect(complete.mock.calls[0]?.[0].user).toContain('distinctive two-word')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('sanitiseCandidates', () => {
  it('trims, dedupes case-insensitively, and preserves first-seen casing', () => {
    expect(sanitiseCandidates(['Zolvex', 'zolvex', ' Zolvex ', 'Marbrix'], undefined)).toEqual([
      'Zolvex',
      'Marbrix',
    ])
  })

  it('drops the seed name itself, case-insensitively', () => {
    expect(sanitiseCandidates(['Envryn', 'ENVRYN', 'Envrynix'], 'envryn')).toEqual(['Envrynix'])
  })

  it('drops empty strings, whitespace-only entries and non-strings', () => {
    expect(sanitiseCandidates(['', '   ', 'Ok', 123, null], undefined)).toEqual(['Ok'])
  })

  it('drops names that fail the same CandidateNameSchema a human-typed name goes through', () => {
    expect(sanitiseCandidates(['A', 'Ok'], undefined)).toEqual(['Ok'])
  })

  it('drops names over the max length', () => {
    const tooLong = 'X'.repeat(65)
    expect(sanitiseCandidates([tooLong, 'Ok'], undefined)).toEqual(['Ok'])
  })
})

describe('filterQuality', () => {
  it('drops famous names and records why', () => {
    const { kept, dropped } = filterQuality(['Cloudari', 'Tekken', 'Google'])
    expect(kept).toContain('Cloudari')
    expect(kept).not.toContain('Tekken')
    expect(kept).not.toContain('Google')
    expect(dropped.some((d) => /tekken/i.test(d.reason))).toBe(true)
  })

  it('drops brandability failures', () => {
    const { kept } = filterQuality(['Cloudari', 'Bcdfgh', 'One Two Three Four'])
    expect(kept).toEqual(['Cloudari'])
  })

  it('keeps genuinely good names', () => {
    const { kept } = filterQuality(['Cloudari', 'Marketrove', 'Nordvel'])
    expect(kept).toEqual(['Cloudari', 'Marketrove', 'Nordvel'])
  })
})

describe('rankByQuality', () => {
  it('orders stronger brand names ahead of weaker ones', () => {
    const ranked = rankByQuality(['DataifyAI', 'Cloudari', 'QuantumSphereHub'])
    expect(ranked[0]).toBe('Cloudari')
  })

  it('is a stable sort for equal scores', () => {
    const names = ['Lumira', 'Zephyra']
    // Both clean; ties fall back to original order.
    const ranked = rankByQuality(names)
    expect(new Set(ranked)).toEqual(new Set(names))
  })
})

describe('generateNames', () => {
  it('returns a ready, quality-ranked pool from a healthy batch', async () => {
    complete.mockResolvedValueOnce(batch(GOOD_POOL))
    const outcome = await generateNames('SaaS', 'a project tool', undefined)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.names.length).toBeGreaterThanOrEqual(5)
    expect(outcome.names.length).toBeLessThanOrEqual(18)
  })

  it('never lets a famous name or garbage into the pool', async () => {
    complete.mockResolvedValueOnce(batch([...GOOD_POOL, 'Tekken', 'Google', 'Bcdfgh', 'a b c d e']))
    const outcome = await generateNames('Game', 'a fighting game', undefined)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.names).not.toContain('Tekken')
    expect(outcome.names).not.toContain('Google')
    expect(outcome.names).not.toContain('Bcdfgh')
  })

  it('collapses near-duplicate families into one member', async () => {
    complete.mockResolvedValueOnce(
      batch(['Cloudari', 'Cloudarri', 'Cloudari Works', 'Cloudaro', 'Nordvel', 'Marketrove']),
    )
    const outcome = await generateNames('SaaS', 'infra tooling', undefined)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const sameIdea = outcome.names.filter((n) => /^cloudar/i.test(n))
    expect(sameIdea.length).toBe(1)
  })

  it('refills across attempts, accumulating names it has not seen', async () => {
    complete
      .mockResolvedValueOnce(batch(['Cloudari', 'Marketrove', 'Nordvel']))
      .mockResolvedValueOnce(batch(['Lumira', 'Pallova', 'Brixto']))
      .mockResolvedValueOnce(batch(['Vantel', 'Kestril']))
    const outcome = await generateNames('SaaS', 'a tool', undefined)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.names).toEqual(
      expect.arrayContaining(['Cloudari', 'Lumira', 'Vantel']),
    )
    expect(complete).toHaveBeenCalledTimes(3)
  })

  it('excludes already-seen names on refill so the model is asked for new ones', async () => {
    complete
      .mockResolvedValueOnce(batch(['Cloudari', 'Marketrove']))
      .mockResolvedValueOnce(batch(['Lumira']))
      .mockResolvedValueOnce(batch(['Nordvel']))
    await generateNames('SaaS', 'a tool', undefined)
    // The second call's user prompt should list the first batch as excluded.
    const secondCall = complete.mock.calls[1]?.[0] as { user: string } | undefined
    expect(secondCall?.user).toMatch(/Cloudari/)
    expect(secondCall?.user).toMatch(/do not repeat/i)
  })

  it('asks for json-mode output', async () => {
    complete.mockResolvedValueOnce(batch(GOOD_POOL))
    await generateNames('SaaS', 'x', undefined)
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ json: true }))
  })

  it('does not crash on malformed JSON and reports unavailable', async () => {
    complete.mockResolvedValue({ text: 'not json at all', model: 'test-model' })
    const outcome = await generateNames('SaaS', 'x', undefined)
    expect(outcome.status).toBe('unavailable')
  })

  it('reports unavailable when the JSON never matches the expected shape', async () => {
    complete.mockResolvedValue({ text: JSON.stringify({ wrong: true }), model: 'test-model' })
    const outcome = await generateNames('SaaS', 'x', undefined)
    expect(outcome.status).toBe('unavailable')
  })

  it('reports unavailable when every candidate is filtered out', async () => {
    // All famous or garbage: nothing survives quality filtering.
    complete.mockResolvedValue(batch(['Tekken', 'Google', 'Bcdfgh']))
    const outcome = await generateNames('SaaS', 'x', undefined)
    expect(outcome.status).toBe('unavailable')
  })

  it('maps a missing key to a clear reason without throwing', async () => {
    complete.mockRejectedValue(new LLMUnavailableError('no_api_key', 'no key'))
    const outcome = await generateNames('SaaS', 'x', undefined)
    expect(outcome).toEqual({
      status: 'unavailable',
      reason: 'Name generation is not configured on this deployment.',
    })
  })

  it('maps an exhausted budget to a same-day-specific reason', async () => {
    complete.mockRejectedValue(new LLMUnavailableError('budget_exhausted', 'gone'))
    const outcome = await generateNames('SaaS', 'x', undefined)
    expect((outcome as { reason: string }).reason).toContain('allowance')
  })

  it('salvages an earlier good batch when a later refill fails', async () => {
    complete
      .mockResolvedValueOnce(batch(['Cloudari', 'Marketrove', 'Nordvel', 'Lumira']))
      .mockRejectedValueOnce(new LLMUnavailableError('rate_limited', 'slow down'))
    const outcome = await generateNames('SaaS', 'a tool', undefined)
    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.names).toEqual(expect.arrayContaining(['Cloudari']))
  })
})

it('excludes earlier rejected families from replacement batches', async () => {
  complete.mockResolvedValue(batch(['Cedar Table', 'Cedar Tables', 'Copper Apron', 'Sunday Crumb']))
  const result = await generateNames('Restaurant', 'A bakery', undefined, { exclude: ['Cedar Table'], maxAttempts: 1 })
  expect(result.status).toBe('ready')
  if (result.status === 'ready') expect(result.names.every((name) => !name.startsWith('Cedar'))).toBe(true)
  expect(complete).toHaveBeenCalledTimes(1)
})

it('keeps only original candidates accepted by the editorial review', async () => {
  complete.mockResolvedValueOnce(batch(['Paper Lantern', 'Injected Name', 'Paper Lantern']))
  const { curateNames } = await import('./namegen')
  expect(await curateNames(['Paper Lantern', 'Mild Folio'], 'Offline document tool')).toEqual(['Paper Lantern'])
})

it('classifies transient AI failures so generation can recover', async () => {
  complete.mockRejectedValue(new LLMUnavailableError('rate_limited', 'busy'))
  expect(await generateNames('SaaS', 'An offline file app', undefined)).toMatchObject({ status: 'unavailable', retryable: true, retryAfterMs: 61000 })
})
