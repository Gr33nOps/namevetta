import 'server-only'
import { env } from '@/lib/env'
import { isDatabaseConfigured } from '@/lib/db/client'
import { consumeProviderBudget } from '@/lib/db/quota'
import { LLMUnavailableError, type LLMProvider } from './llm'

export const geminiProvider: LLMProvider = {
  id: 'gemini', label: 'Gemini', model: 'gemini-3.8-flash',
  async complete(request) {
    request.signal?.throwIfAborted()
    const { GEMINI_API_KEY: key, GEMINI_MODEL: model, AI_MONTHLY_BUDGET: budget } = env()
    if (!key) throw new LLMUnavailableError('no_api_key', 'The AI service is not configured.')
    if (isDatabaseConfigured() && !await consumeProviderBudget('gemini', budget)) {
      throw new LLMUnavailableError('budget_exhausted', 'The AI allowance has been reached.')
    }
    const signal = AbortSignal.any([AbortSignal.timeout(20_000), ...(request.signal ? [request.signal] : [])])
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxOutputTokens ?? 700,
            ...(model.startsWith('gemini-3.') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
            ...(model.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            ...(request.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      })
      if (!response.ok) throw new LLMUnavailableError(response.status === 429 ? 'rate_limited' : 'provider_error', 'The AI service could not respond.')
      const data = await response.json() as { modelVersion?: string; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
      const candidate = data.candidates?.[0]
      const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
      if (!text || (candidate?.finishReason && candidate.finishReason !== 'STOP')) throw new LLMUnavailableError('provider_error', 'The AI response was incomplete.')
      return { text, model: data.modelVersion ?? model, promptTokens: data.usageMetadata?.promptTokenCount ?? 0, completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0 }
    } catch (error) {
      if (error instanceof LLMUnavailableError) throw error
      throw new LLMUnavailableError(signal.aborted ? 'timeout' : 'provider_error', 'The AI service could not respond.')
    }
  },
  async healthCheck() { return { ok: Boolean(env().GEMINI_API_KEY), detail: 'Configuration check only.' } },
}
