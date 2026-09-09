import 'server-only'

/**
 * Groq LLM provider — free tier only.
 *
 * Limits measured against the live API rather than taken from documentation,
 * because the planning assumption (30 requests/minute, 6,000 tokens/minute) was
 * wrong in both directions:
 *
 *   x-ratelimit-limit-requests: 1000   (per day; the bucket refills one request
 *                                       every 86.4s, which is 86,400/1000)
 *   x-ratelimit-limit-tokens:   8000   (per minute)
 *
 * So requests are plentiful and **tokens per minute are the binding
 * constraint**. One summary costs roughly 2,000 tokens all-in, which is about
 * four per minute sustained. Two things follow, and both are implemented here:
 * the digest is capped hard before it is ever sent, and calls are serialised
 * rather than fired concurrently — a scan finishing three names at once must
 * not spend the whole minute's tokens in one burst and fail all three.
 *
 * The key is read server-side only and never logged.
 */
import { env } from '@/lib/env'
import { isDatabaseConfigured } from '@/lib/db/client'
import { consumeProviderBudget } from '@/lib/db/quota'
import {
  LLMUnavailableError,
  type LLMHealth,
  type LLMProvider,
  type LLMRequest,
  type LLMResult,
} from './llm'

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
export const GROQ_PROVIDER_ID = 'groq'

/**
 * Default model.
 *
 * Newest general-purpose text model available on this account, verified
 * against the model catalog and a live JSON completion in September 2026.
 * This is the backup for Gemini 3.8 Flash.
 */
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'

/** Measured ceiling. Kept as a named constant so the pacer explains itself. */
const TOKENS_PER_MINUTE = 8_000

/**
 * Self-imposed ceiling, below the measured one.
 *
 * Leaves room for the estimate to be wrong. Token counts here are estimated
 * from character length rather than tokenised properly — carrying a real
 * tokeniser for a budget guard is not worth the bundle — so the guard has to
 * tolerate being off by a meaningful margin without ever hitting the real wall.
 */
const TOKEN_BUDGET_PER_MINUTE = 6_000

const REQUEST_TIMEOUT_MS = 20_000
// This account enforces 1,000 output tokens/minute for Qwen. A 1,200-token
// request is rejected even with an empty window. Instruct mode needs no
// reasoning reserve; 700 covers the bounded name lists and explanations.
const MAX_OUTPUT_TOKENS = 700

/* ── token pacing ─────────────────────────────────────────────────────────── */

interface Spend {
  at: number
  tokens: number
}

/** Rolling one-minute window of estimated spend, per process. */
let spends: Spend[] = []

/**
 * Serialisation point.
 *
 * Every call chains onto this promise, so two scans completing at the same
 * moment queue rather than collide. Without it the token window is checked by
 * both before either has spent anything, and both proceed.
 */
let chain: Promise<unknown> = Promise.resolve()

function spentInWindow(now: number): number {
  spends = spends.filter((s) => now - s.at < 60_000)
  return spends.reduce((total, s) => total + s.tokens, 0)
}

/**
 * Rough token estimate.
 *
 * ~4 characters per token is the usual rule of thumb for English prose, and the
 * digest is mostly names and short labels. Deliberately rounded up: over-
 * estimating costs a little throughput, under-estimating costs a 429.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

/* ── provider ─────────────────────────────────────────────────────────────── */

interface GroqChoice {
  message?: { content?: string }
}

interface GroqResponse {
  model?: string
  choices?: GroqChoice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

async function callGroq(key: string, request: LLMRequest): Promise<LLMResult> {
  const model = DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Honour a caller abort as well as our own timeout.
  const onAbort = (): void => controller.abort()
  request.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        // Near-zero: this is restatement of supplied facts. Sampling variety is
        // exactly the behaviour the grounding validator would then reject.
        temperature: request.temperature ?? 0.2,
        max_completion_tokens: Math.min(request.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
        // Qwen instruct mode leaves the output budget for the requested answer.
        // Thinking mode can exhaust it before emitting the required JSON.
        reasoning_effort: 'none',
        ...(request.json === true ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    if (response.status === 429) {
      throw new LLMUnavailableError('rate_limited', 'The AI service is rate-limited right now.')
    }
    if (response.status === 401 || response.status === 403) {
      throw new LLMUnavailableError('provider_error', 'The AI service rejected our credentials.')
    }
    if (!response.ok) {
      throw new LLMUnavailableError('provider_error', `The AI service returned ${response.status}.`)
    }

    const data = (await response.json()) as GroqResponse
    const text = data.choices?.[0]?.message?.content
    if (text === undefined || text.trim() === '') {
      throw new LLMUnavailableError('provider_error', 'The AI service returned an empty response.')
    }

    return {
      text,
      model: data.model ?? model,
      promptTokens: data.usage?.prompt_tokens ?? estimateTokens(request.system + request.user),
      completionTokens: data.usage?.completion_tokens ?? estimateTokens(text),
    }
  } catch (cause) {
    if (cause instanceof LLMUnavailableError) throw cause
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new LLMUnavailableError('timeout', 'The AI service did not respond in time.')
    }
    throw new LLMUnavailableError('provider_error', 'The AI service could not be reached.')
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', onAbort)
  }
}

export const groqProvider: LLMProvider = {
  id: GROQ_PROVIDER_ID,
  label: 'Groq',
  model: DEFAULT_MODEL,

  async complete(request: LLMRequest): Promise<LLMResult> {
    const key = env().GROQ_API_KEY
    if (key === undefined) {
      throw new LLMUnavailableError('no_api_key', 'AI explanations are not configured.')
    }

    // Queue behind any in-flight call. The `catch` keeps one failure from
    // poisoning the chain for every caller after it.
    const run = chain.then(
      () => paced(key, request),
      () => paced(key, request),
    )
    chain = run.catch(() => undefined)
    return run
  },

  async healthCheck(): Promise<LLMHealth> {
    const key = env().GROQ_API_KEY
    if (key === undefined) return { ok: false, detail: 'No API key configured' }
    try {
      await callGroq(key, { system: 'Reply with OK.', user: 'ping', maxOutputTokens: 5 })
      return { ok: true }
    } catch (cause) {
      return { ok: false, detail: cause instanceof Error ? cause.message : 'unknown' }
    }
  },
}

/**
 * Budget, then token pacing, then the call.
 *
 * Order matters: the monthly ceiling is the one that must never be crossed, so
 * it is checked before anything is spent.
 */
async function paced(key: string, request: LLMRequest): Promise<LLMResult> {
  if (isDatabaseConfigured()) {
    const allowed = await consumeProviderBudget(GROQ_PROVIDER_ID, env().AI_MONTHLY_BUDGET)
    if (!allowed) {
      throw new LLMUnavailableError(
        'budget_exhausted',
        'The monthly AI allowance for this deployment has been used.',
      )
    }
  }

  const estimate = estimateTokens(request.system + request.user) + Math.min(request.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)

  const now = Date.now()
  if (spentInWindow(now) + estimate > TOKEN_BUDGET_PER_MINUTE) {
    // Refuse rather than sleep. The scan has already finished and the user is
    // looking at a complete report; making them wait 40 seconds for a paragraph
    // is worse than telling them the summary is briefly unavailable.
    throw new LLMUnavailableError(
      'rate_limited',
      'The AI service is briefly at its request limit.',
    )
  }

  const result = await callGroq(key, request)

  // Record what was actually spent, not the estimate, so the window self-corrects.
  spends.push({ at: Date.now(), tokens: result.promptTokens + result.completionTokens })
  return result
}

/** Reset the pacing window. Test-only. */
export function resetGroqPacing(): void {
  spends = []
  chain = Promise.resolve()
}

/** The measured ceiling, exported so tests assert against the real number. */
export const GROQ_TOKENS_PER_MINUTE = TOKENS_PER_MINUTE
