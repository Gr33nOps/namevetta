import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceResult } from '@/lib/core/types'
import type { ScanSummary } from '@/lib/orchestrator/run'
import { LLMUnavailableError } from '@/lib/providers/llm'

const complete = vi.fn()
vi.mock('@/lib/providers/groq', () => ({
  groqProvider: { id: 'groq', label: 'Groq', model: 'test-model', complete: (...a: unknown[]) => complete(...a) },
}))

const { generateSummary } = await import('./summarize')

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'deep' }

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
    viability: { score: 80, rawScore: 80, caps: [], groups: [], conflicts: [], scoringVersion: 1 },
    coverage: 90,
  }
}

beforeEach(() => {
  complete.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('generateSummary', () => {
  it('returns ready with the model text when it passes grounding on the first try', async () => {
    complete.mockResolvedValueOnce({ text: 'A clean summary at 80.', model: 'test-model' })
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome).toEqual({ status: 'ready', text: 'A clean summary at 80.', model: 'test-model' })
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('retries once with a correction when the first answer fails grounding', async () => {
    complete
      .mockResolvedValueOnce({ text: 'Similar to Stripe and Notion.', model: 'test-model' })
      .mockResolvedValueOnce({ text: 'No notable conflicts turned up.', model: 'test-model' })
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome).toEqual({
      status: 'ready',
      text: 'No notable conflicts turned up.',
      model: 'test-model',
    })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('gives up as unavailable if the retry also fails grounding, never showing bad text', async () => {
    complete
      .mockResolvedValueOnce({ text: 'Similar to Stripe.', model: 'test-model' })
      .mockResolvedValueOnce({ text: 'Also similar to Notion.', model: 'test-model' })
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome.status).toBe('unavailable')
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('maps a missing key to a clear unavailable reason without retrying', async () => {
    complete.mockRejectedValueOnce(new LLMUnavailableError('no_api_key', 'no key'))
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome).toEqual({
      status: 'unavailable',
      reason: 'AI explanations are not configured on this deployment.',
    })
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('maps an exhausted budget to a same-day-specific reason', async () => {
    complete.mockRejectedValueOnce(new LLMUnavailableError('budget_exhausted', 'budget gone'))
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome.status).toBe('unavailable')
    expect((outcome as { reason: string }).reason).toContain('allowance')
  })

  it('never lets a provider crash escape as an unhandled rejection', async () => {
    complete.mockRejectedValueOnce(new Error('socket hang up'))
    const outcome = await generateSummary(ctx, summary([result()]))
    expect(outcome.status).toBe('unavailable')
  })
})
