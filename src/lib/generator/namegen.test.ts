import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMUnavailableError } from '@/lib/providers/llm'

const complete = vi.fn()
vi.mock('@/lib/providers/groq', () => ({
  groqProvider: { id: 'groq', label: 'Groq', model: 'test-model', complete: (...a: unknown[]) => complete(...a) },
}))

const { generateNames, sanitiseCandidates } = await import('./namegen')

beforeEach(() => {
  complete.mockReset()
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
    expect(sanitiseCandidates(['', '   ', 'Ok', 123 as unknown as string, null as unknown as string], undefined)).toEqual(['Ok'])
  })

  it('drops names that fail the same CandidateNameSchema a human-typed name goes through', () => {
    // Single character is below CandidateNameSchema's 2-char minimum.
    expect(sanitiseCandidates(['A', 'Ok'], undefined)).toEqual(['Ok'])
  })

  it('drops names over the max length', () => {
    const tooLong = 'X'.repeat(65)
    expect(sanitiseCandidates([tooLong, 'Ok'], undefined)).toEqual(['Ok'])
  })
})

describe('generateNames', () => {
  it('returns ready with sanitised names on a well-formed response', async () => {
    complete.mockResolvedValueOnce({
      text: JSON.stringify({ names: ['Zolvex', 'Marbrix', 'zolvex'] }),
      model: 'test-model',
    })
    const outcome = await generateNames('SaaS', 'a project tool', undefined)
    expect(outcome).toEqual({ status: 'ready', names: ['Zolvex', 'Marbrix'] })
  })

  it('asks for json-mode output', async () => {
    complete.mockResolvedValueOnce({ text: '{"names":["Ok"]}', model: 'test-model' })
    await generateNames('SaaS', undefined, undefined)
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ json: true }))
  })

  it('reports unavailable on unparsable JSON rather than throwing', async () => {
    complete.mockResolvedValueOnce({ text: 'not json at all', model: 'test-model' })
    const outcome = await generateNames('SaaS', undefined, undefined)
    expect(outcome.status).toBe('unavailable')
  })

  it('reports unavailable when the JSON does not match the expected shape', async () => {
    complete.mockResolvedValueOnce({ text: JSON.stringify({ wrong: true }), model: 'test-model' })
    const outcome = await generateNames('SaaS', undefined, undefined)
    expect(outcome.status).toBe('unavailable')
  })

  it('reports unavailable when every candidate is filtered out by sanitisation', async () => {
    // Every entry equals the seed after normalisation, so nothing survives.
    complete.mockResolvedValueOnce({ text: JSON.stringify({ names: ['Envryn', 'ENVRYN'] }), model: 'test-model' })
    const outcome = await generateNames('SaaS', undefined, 'envryn')
    expect(outcome.status).toBe('unavailable')
  })

  it('maps a missing key to a clear reason without throwing', async () => {
    complete.mockRejectedValueOnce(new LLMUnavailableError('no_api_key', 'no key'))
    const outcome = await generateNames('SaaS', undefined, undefined)
    expect(outcome).toEqual({
      status: 'unavailable',
      reason: 'Name generation is not configured on this deployment.',
    })
  })

  it('maps an exhausted budget to a same-day-specific reason', async () => {
    complete.mockRejectedValueOnce(new LLMUnavailableError('budget_exhausted', 'gone'))
    const outcome = await generateNames('SaaS', undefined, undefined)
    expect((outcome as { reason: string }).reason).toContain('allowance')
  })
})
