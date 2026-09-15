import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./gemini', () => ({ geminiProvider: { complete: vi.fn() } }))
vi.mock('./groq', () => ({ groqProvider: { complete: vi.fn() } }))
import { geminiProvider } from './gemini'
import { groqProvider } from './groq'
import { completeWithFallback } from './fallback'
import { LLMUnavailableError } from './llm'
const request = { system: 's', user: 'u' }
it('preserves the backup rate limit so retries wait for capacity', async () => {
  vi.mocked(geminiProvider.complete).mockRejectedValue(new LLMUnavailableError('provider_error', 'Unavailable'))
  const limited = new LLMUnavailableError('rate_limited', 'Wait')
  vi.mocked(groqProvider.complete).mockRejectedValue(limited)
  await expect(completeWithFallback(request)).rejects.toBe(limited)
})
beforeEach(() => vi.resetAllMocks())
it('keeps Gemini primary', async () => {
  vi.mocked(geminiProvider.complete).mockResolvedValue({ text: 'ok', model: 'gemini-3.8-flash', promptTokens: 1, completionTokens: 1 })
  expect((await completeWithFallback(request)).model).toBe('gemini-3.8-flash')
  expect(groqProvider.complete).not.toHaveBeenCalled()
})
it('uses Groq when Gemini fails', async () => {
  vi.mocked(geminiProvider.complete).mockRejectedValue(new Error('outage'))
  vi.mocked(groqProvider.complete).mockResolvedValue({ text: 'ok', model: 'qwen/qwen3.8-27b', promptTokens: 1, completionTokens: 1 })
  expect((await completeWithFallback(request)).model).toBe('qwen/qwen3.8-27b')
})
it('does not start fallback after cancellation', async () => {
  await expect(completeWithFallback({ ...request, signal: AbortSignal.abort() })).rejects.toBeDefined()
  expect(geminiProvider.complete).not.toHaveBeenCalled()
  expect(groqProvider.complete).not.toHaveBeenCalled()
})


it('does not retry a failed primary on every stage of the same run', async () => {
  const signal = new AbortController().signal
  vi.mocked(geminiProvider.complete).mockRejectedValue(new LLMUnavailableError('timeout', 'Slow primary'))
  vi.mocked(groqProvider.complete).mockResolvedValue({ text: 'backup', model: 'groq', promptTokens: 1, completionTokens: 1 })
  expect((await completeWithFallback({ ...request, signal })).text).toBe('backup')
  expect((await completeWithFallback({ ...request, signal })).text).toBe('backup')
  expect(geminiProvider.complete).toHaveBeenCalledTimes(1)
})

it('returns to Gemini once the backup cooldown expires', async () => {
  vi.useFakeTimers()
  try {
    const signal = new AbortController().signal
    vi.mocked(geminiProvider.complete).mockRejectedValueOnce(new LLMUnavailableError('timeout', 'Slow primary'))
      .mockResolvedValue({ text: 'gemini', model: 'gemini', promptTokens: 1, completionTokens: 1 })
    vi.mocked(groqProvider.complete).mockResolvedValue({ text: 'backup', model: 'groq', promptTokens: 1, completionTokens: 1 })
    await completeWithFallback({ ...request, signal })
    vi.advanceTimersByTime(61_000)
    expect((await completeWithFallback({ ...request, signal })).text).toBe('gemini')
  } finally { vi.useRealTimers() }
})

it('retries a quick Gemini failure once before using Groq', async () => {
  vi.mocked(geminiProvider.complete).mockRejectedValueOnce(new LLMUnavailableError('provider_error', 'High demand'))
    .mockResolvedValue({ text: 'gemini', model: 'gemini', promptTokens: 1, completionTokens: 1 })
  expect((await completeWithFallback(request)).text).toBe('gemini')
  expect(groqProvider.complete).not.toHaveBeenCalled()
})

it('tries the primary again if the working backup becomes unavailable', async () => {
  const signal = new AbortController().signal
  vi.mocked(geminiProvider.complete).mockRejectedValueOnce(new LLMUnavailableError('timeout', 'Slow primary'))
    .mockResolvedValue({ text: 'recovered', model: 'gemini', promptTokens: 1, completionTokens: 1 })
  vi.mocked(groqProvider.complete).mockResolvedValueOnce({ text: 'backup', model: 'groq', promptTokens: 1, completionTokens: 1 })
    .mockRejectedValue(new LLMUnavailableError('rate_limited', 'Busy'))
  await completeWithFallback({ ...request, signal })
  expect((await completeWithFallback({ ...request, signal })).text).toBe('recovered')
})
