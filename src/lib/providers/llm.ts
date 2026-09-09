import 'server-only'

/**
 * The AI seam (§25).
 *
 * The rule this interface exists to enforce: **killing the AI provider must
 * leave scores, evidence and matches completely intact.** The explanation layer
 * is the last thing computed and the first thing to go, so a provider outage,
 * an exhausted allowance or a removed key costs the user a paragraph of prose
 * and nothing else.
 *
 * That is also why `complete` throws rather than returning empty text. An empty
 * string is indistinguishable from "the model had nothing to say", and the
 * caller needs to tell the user *why* there is no summary.
 *
 * Every implementation must be usable on a free tier with no card on file.
 */

export interface LLMRequest {
  /** Instructions and constraints. Kept out of the user turn deliberately. */
  system: string
  /** The evidence digest. Never raw scan data — see `ai/digest.ts`. */
  user: string
  maxOutputTokens?: number
  /** Low by default: this is summarisation of given facts, not invention. */
  temperature?: number
  /** Ask the provider to constrain output to JSON where it supports it. */
  json?: boolean
  signal?: AbortSignal
}

export interface LLMResult {
  text: string
  /** The model that actually answered, recorded alongside every summary. */
  model: string
  promptTokens: number
  completionTokens: number
}

/**
 * Why a completion could not run.
 *
 * Separated from a generic error because the user-facing message differs: a
 * missing key is a deployment fact, a rate limit is worth retrying, and an
 * exhausted allowance means "tomorrow".
 */
export type LLMUnavailableReason =
  | 'no_api_key'
  | 'budget_exhausted'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'

export class LLMUnavailableError extends Error {
  readonly reason: LLMUnavailableReason

  constructor(reason: LLMUnavailableReason, message: string) {
    super(message)
    this.name = 'LLMUnavailableError'
    this.reason = reason
  }
}

export interface LLMHealth {
  ok: boolean
  detail?: string
}

export interface LLMProvider {
  id: string
  label: string
  /** Default model id, recorded on every stored summary for explainability. */
  model: string
  complete(request: LLMRequest): Promise<LLMResult>
  healthCheck(): Promise<LLMHealth>
}
