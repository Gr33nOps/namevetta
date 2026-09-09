import 'server-only'
import { groqProvider } from './groq'
import { geminiProvider } from './gemini'
import type { LLMRequest, LLMResult } from './llm'
import { LLMUnavailableError } from './llm'

export async function completeWithFallback(request: LLMRequest): Promise<LLMResult> {
  request.signal?.throwIfAborted()
  try { return await geminiProvider.complete(request) }
  catch (primaryError) {
    request.signal?.throwIfAborted()
    try { return await groqProvider.complete(request) }
    catch (fallbackError) {
      // Preserve either provider's cooldown instead of retrying an outage
      // immediately while the remaining provider is still rate limited.
      if (fallbackError instanceof LLMUnavailableError && fallbackError.reason === 'rate_limited') throw fallbackError
      if (primaryError instanceof LLMUnavailableError && primaryError.reason === 'no_api_key') throw fallbackError
      throw primaryError
    }
  }
}
