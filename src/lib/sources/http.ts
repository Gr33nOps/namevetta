/**
 * Shared HTTP client for source adapters.
 *
 * Centralised so that timeout, retry, backoff and error classification behave
 * identically across every source — §56 asks for these, and having each adapter
 * roll its own is how inconsistent failure handling creeps in.
 *
 * The important design choice: a non-2xx response is *not* automatically an
 * error. A 404 from a package registry is the most informative answer we can
 * get ("this name is unused"), so callers receive the status and decide.
 */
import { userAgent } from '@/lib/env'

/** Thrown when a request cannot produce a usable answer. */
export class SourceRequestError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number | undefined

  constructor(code: string, message: string, retryable: boolean, status?: number) {
    super(message)
    this.name = 'SourceRequestError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

export interface HttpOptions {
  /** Abort signal from the orchestrator, carrying the per-source timeout. */
  signal?: AbortSignal
  headers?: Record<string, string>
  method?: 'GET' | 'POST' | 'HEAD'
  body?: string
  /** Retry attempts for transient failures. Total tries = retries + 1. */
  retries?: number
  /** Base delay for exponential backoff, in ms. */
  backoffMs?: number
  /**
   * Status codes the caller wants returned rather than thrown. 404 is included
   * by default because "not found" is usually the answer, not a failure.
   */
  expectedStatuses?: number[]
}

export interface HttpResponse {
  status: number
  ok: boolean
  text: string
  headers: Headers
}

const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 250

/** Transient conditions worth a retry; everything else fails fast. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Perform an HTTP request with retry and backoff.
 *
 * Honours the caller's abort signal at every stage, including between retries,
 * so a per-source timeout genuinely bounds total time rather than only bounding
 * each individual attempt.
 */
export async function request(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const {
    signal,
    headers = {},
    method = 'GET',
    body,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    expectedStatuses = [404],
  } = options

  let lastError: SourceRequestError | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted === true) {
      throw new SourceRequestError('TIMEOUT', 'Request timed out', true)
    }

    try {
      const init: RequestInit = {
        method,
        headers: { 'user-agent': userAgent(), accept: 'application/json', ...headers },
        // `redirect: follow` is the default; stated explicitly because several
        // registries redirect canonical names and we want to land on the target.
        redirect: 'follow',
      }
      if (signal !== undefined) init.signal = signal
      if (body !== undefined) init.body = body

      const response = await fetch(url, init)
      const text = await response.text()

      if (response.ok || expectedStatuses.includes(response.status)) {
        return { status: response.status, ok: response.ok, text, headers: response.headers }
      }

      const retryable = isRetryableStatus(response.status)

      // 429 gets its own code so callers and health tracking can tell "we were
      // throttled" apart from "the service is broken". They mean different
      // things, and neither means the name is clear.
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        const waitMs = retryAfter === null ? 0 : Number.parseInt(retryAfter, 10) * 1000
        lastError = new SourceRequestError(
          'RATE_LIMITED',
          'Upstream rate limit reached.',
          true,
          429,
        )
        // Respect an explicit Retry-After when the provider supplies one and it
        // is short enough to be worth waiting for.
        if (Number.isFinite(waitMs) && waitMs > 0 && waitMs <= 5_000 && attempt < retries) {
          await sleep(waitMs)
          continue
        }
        if (attempt >= retries) throw lastError
      } else {
        lastError = new SourceRequestError(
          `HTTP_${response.status}`,
          `Upstream responded ${response.status}`,
          retryable,
          response.status,
        )
        if (!retryable) throw lastError
      }
    } catch (cause) {
      if (cause instanceof SourceRequestError) {
        lastError = cause
        if (!cause.retryable) throw cause
      } else if (cause instanceof Error && cause.name === 'AbortError') {
        throw new SourceRequestError('TIMEOUT', 'Request timed out', true)
      } else {
        lastError = new SourceRequestError(
          'NETWORK',
          cause instanceof Error ? cause.message : 'Network request failed',
          true,
        )
      }
    }

    if (attempt < retries) {
      // Exponential backoff with jitter, so a rate-limited upstream is not hit
      // by every concurrent scan at exactly the same moment.
      const delay = backoffMs * 2 ** attempt + Math.random() * backoffMs
      await sleep(delay)
    }
  }

  throw lastError ?? new SourceRequestError('UNKNOWN', 'Request failed', true)
}

/** Request and parse JSON, mapping malformed bodies onto a clear error. */
export async function requestJson<T = unknown>(
  url: string,
  options: HttpOptions = {},
): Promise<{ status: number; ok: boolean; data: T | undefined }> {
  const response = await request(url, options)
  if (response.text.trim() === '') {
    return { status: response.status, ok: response.ok, data: undefined }
  }
  try {
    return { status: response.status, ok: response.ok, data: JSON.parse(response.text) as T }
  } catch {
    throw new SourceRequestError('BAD_JSON', 'Upstream returned malformed JSON', false, response.status)
  }
}
