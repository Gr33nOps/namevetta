import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/db/client', () => ({ isDatabaseConfigured: () => false }))
import { resetEnvCache } from '@/lib/env'
import { geminiProvider } from './gemini'
beforeEach(() => { vi.stubEnv('GEMINI_API_KEY', 'test-secret'); resetEnvCache() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetEnvCache() })
it('sends JSON mode and returns the actual Gemini model', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ modelVersion: 'gemini-3.8-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"names":["Copper Apron"]}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8 } }))
  vi.stubGlobal('fetch', fetcher)
  const result = await geminiProvider.complete({ system: 'Naming instructions', user: 'A bakery', json: true })
  expect(result.model).toBe('gemini-3.8-flash')
  const [url, options] = fetcher.mock.calls[0]!
  expect(url).not.toContain('test-secret')
  expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json')
  expect(JSON.parse(options.body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' })
})
it('rejects truncated output instead of returning broken names', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"names":[' }] } }] })))
  await expect(geminiProvider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({ reason: 'provider_error' })
})
