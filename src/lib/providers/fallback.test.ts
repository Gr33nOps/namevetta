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

