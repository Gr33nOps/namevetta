import 'server-only'
import { groqProvider } from './groq'
import { geminiProvider } from './gemini'
import type { LLMRequest, LLMResult } from './llm'
import { LLMUnavailableError } from './llm'

// One signal spans a naming run. After a Gemini failure, use Groq first for a
// short cooldown so a real outage does not cost a timeout at every stage. The
// cooldown expires, so a brief high-demand spike does not hand the rest of the
// run to the backup model.
const BACKUP_COOLDOWN_MS = 60_000
const backupRuns = new WeakMap<AbortSignal, number>()
// Gemini's "high demand" 503s usually clear within seconds.
const QUICK_FAILURE_MS = 10_000
const PRIMARY_RETRY_DELAY_MS = 2_000

function providerFailure(primaryError: unknown, fallbackError: unknown): unknown {
  if (fallbackError instanceof LLMUnavailableError && fallbackError.reason === 'rate_limited') return fallbackError
  if (primaryError instanceof LLMUnavailableError && ['no_api_key', 'budget_exhausted'].includes(primaryError.reason)) return fallbackError
  return primaryError
}

function inCooldown(signal: AbortSignal | undefined): boolean {
  const since = signal ? backupRuns.get(signal) : undefined
  if (since === undefined) return false
  if (Date.now() - since < BACKUP_COOLDOWN_MS) return true
  backupRuns.delete(signal!)
  return false
}

async function completePrimary(request: LLMRequest): Promise<LLMResult> {
  const started = Date.now()
  try {
    return await geminiProvider.complete(request)
  } catch (error) {
    const quickProviderError =
      error instanceof LLMUnavailableError &&
      error.reason === 'provider_error' &&
      Date.now() - started < QUICK_FAILURE_MS
    if (!quickProviderError) throw error
    request.signal?.throwIfAborted()
    await new Promise((resolve) => setTimeout(resolve, PRIMARY_RETRY_DELAY_MS))
    request.signal?.throwIfAborted()
    return geminiProvider.complete(request)
  }
}

export async function completeWithFallback(request: LLMRequest): Promise<LLMResult> {
  request.signal?.throwIfAborted()
  if (inCooldown(request.signal)) {
    try { return await groqProvider.complete(request) }
    catch (fallbackError) {
      request.signal!.throwIfAborted()
      try {
        const result = await geminiProvider.complete(request)
        backupRuns.delete(request.signal!)
        return result
      } catch (primaryError) { throw providerFailure(primaryError, fallbackError) }
    }
  }
  try { return await completePrimary(request) }
  catch (primaryError) {
    request.signal?.throwIfAborted()
    try {
      const result = await groqProvider.complete(request)
      if (request.signal) backupRuns.set(request.signal, Date.now())
      return result
    }
    catch (fallbackError) {
      // Preserve either provider's cooldown instead of retrying an outage
      // immediately while the remaining provider is still rate limited.
      throw providerFailure(primaryError, fallbackError)
    }
  }
}
