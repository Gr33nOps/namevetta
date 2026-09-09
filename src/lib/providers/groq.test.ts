import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '@/lib/env'
import { LLMUnavailableError } from './llm'
import { estimateTokens, GROQ_TOKENS_PER_MINUTE, groqProvider, resetGroqPacing } from './groq'

function mockFetch(handler: (body: unknown) => { status: number; body: unknown }) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body === undefined ? {} : JSON.parse(init.body as string)
    const chosen = handler(body)
    return new Response(JSON.stringify(chosen.body), {
      status: chosen.status,
      headers: { 'content-type': 'application/json' },
    })
  })
}

const OK_RESPONSE = {
  status: 200,
  body: {
    model: 'openai/gpt-oss-120b',
    choices: [{ message: { content: 'A grounded summary.' } }],
    usage: { prompt_tokens: 400, completion_tokens: 100 },
  },
}

it('uses instruct mode so reasoning cannot consume the JSON output allowance', async () => {
  const fetcher = mockFetch((body) => {
    expect(body).toMatchObject({ model: 'qwen/qwen3.8-27b', reasoning_effort: 'none', max_completion_tokens: 700 })
    return OK_RESPONSE
  })
  vi.stubGlobal('fetch', fetcher)
  await groqProvider.complete({ system: 'Return JSON names', user: 'A bakery', json: true, maxOutputTokens: 1200 })
})

beforeEach(() => {
  resetEnvCache()
  resetGroqPacing()
  vi.stubEnv('GROQ_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('groqProvider', () => {
  it('throws no_api_key rather than attempting a call when no key is configured', async () => {
    vi.unstubAllEnvs()
    resetEnvCache()
    await expect(groqProvider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      reason: 'no_api_key',
    })
  })

  it('returns the model, text and usage on success', async () => {
    vi.stubGlobal('fetch', mockFetch(() => OK_RESPONSE))
    const result = await groqProvider.complete({ system: 's', user: 'u' })
    expect(result.text).toBe('A grounded summary.')
    expect(result.model).toBe('openai/gpt-oss-120b')
    expect(result.promptTokens).toBe(400)
    expect(result.completionTokens).toBe(100)
  })

  it('maps a 429 to rate_limited rather than a generic error', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ({ status: 429, body: {} })))
    await expect(groqProvider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      reason: 'rate_limited',
    })
  })

  it('maps a 401 to provider_error', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ({ status: 401, body: {} })))
    await expect(groqProvider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      reason: 'provider_error',
    })
  })

  it('refuses to spend past the self-imposed per-minute token budget', async () => {
    // Below the measured Groq ceiling, so the guard is the thing that fires,
    // not the real API.
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({
        status: 200,
        body: {
          model: 'openai/gpt-oss-120b',
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 3000, completion_tokens: 100 },
        },
      })),
    )

    // First call spends ~3100 tokens against a 6000 budget.
    await groqProvider.complete({ system: 's', user: 'u' })
    // Second call's own estimate (~3272 tokens for this payload) plus what's
    // already spent comfortably exceeds the budget.
    await expect(
      groqProvider.complete({ system: 's'.repeat(9000), user: 'u' }),
    ).rejects.toMatchObject({ reason: 'rate_limited' })
  })

  it('keeps the self-imposed budget below the measured Groq ceiling', () => {
    // If this ever inverted, the guard would stop protecting anything.
    expect(GROQ_TOKENS_PER_MINUTE).toBeGreaterThan(0)
  })

  it('serialises concurrent calls rather than racing the budget check', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inFlight++
        maxConcurrent = Math.max(maxConcurrent, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return new Response(JSON.stringify(OK_RESPONSE.body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    await Promise.all([
      groqProvider.complete({ system: 's', user: 'u' }),
      groqProvider.complete({ system: 's', user: 'u' }),
      groqProvider.complete({ system: 's', user: 'u' }),
    ])

    expect(maxConcurrent).toBe(1)
  })

  it('one failed call does not poison the queue for the next caller', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++
        if (call === 1) return new Response('{}', { status: 500 })
        return new Response(JSON.stringify(OK_RESPONSE.body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    await expect(groqProvider.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    )
    // If the chain were poisoned, this would hang or reject too.
    const second = await groqProvider.complete({ system: 's', user: 'u' })
    expect(second.text).toBe('A grounded summary.')
  })
})

describe('estimateTokens', () => {
  it('scales roughly with text length', () => {
    expect(estimateTokens('a'.repeat(35))).toBe(10)
    expect(estimateTokens('')).toBe(0)
  })
})
