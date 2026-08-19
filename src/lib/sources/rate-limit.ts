/**
 * Shared rate limiting and response caching for source adapters.
 *
 * Several of our sources are free but explicitly rate-limited — Apple's iTunes
 * Search API documents roughly 20 requests per minute, and Wikidata operates
 * under a fair-use policy rather than an unmetered guarantee. "Free" and
 * "unlimited" are not the same thing, and treating them as the same is how a
 * service gets itself blocked.
 *
 * The invariant that matters most: **when the limiter refuses a call, the
 * adapter reports `unable_to_verify`, never a clean result.** A throttled source
 * has told us nothing, and nothing is not the same as nothing-found.
 *
 * Caching is two layers: the in-process `Map` below costs nothing and is
 * checked first, and a miss there falls through to the Postgres-backed cache
 * in `@/lib/db/cache` before ever calling upstream. The second layer is what
 * makes a repeat scan on a cold serverless instance not re-spend the rate
 * limit (or a Tavily credit) a warm instance would have avoided.
 */
import { getCachedResult, putCachedResult } from '@/lib/db/cache'

/** Thrown when a call is refused locally rather than attempted upstream. */
export class RateLimitedError extends Error {
  readonly code = 'RATE_LIMITED'
  readonly retryAfterMs: number

  constructor(source: string, retryAfterMs: number) {
    super(`Local rate limit reached for ${source}; not calling upstream.`)
    this.name = 'RateLimitedError'
    this.retryAfterMs = retryAfterMs
  }
}

/* -------------------------------------------------------------------------- */
/* Token bucket                                                               */
/* -------------------------------------------------------------------------- */

interface Bucket {
  tokens: number
  lastRefill: number
  capacity: number
  refillPerMs: number
}

const buckets = new Map<string, Bucket>()

/**
 * Acquire permission to make one request.
 *
 * Best-effort by design: serverless instances do not share memory, so this
 * bounds per-instance burst rather than enforcing a global ceiling. Paired with
 * the response cache below — which removes most repeat traffic entirely — it
 * keeps us comfortably inside published limits without pretending to a
 * distributed guarantee we cannot make on free infrastructure.
 */
export function acquire(key: string, requestsPerMinute: number): void {
  const now = Date.now()
  const capacity = Math.max(1, requestsPerMinute)
  const refillPerMs = capacity / 60_000

  let bucket = buckets.get(key)
  if (bucket === undefined) {
    bucket = { tokens: capacity, lastRefill: now, capacity, refillPerMs }
    buckets.set(key, bucket)
  }

  const elapsed = now - bucket.lastRefill
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs)
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    const waitMs = Math.ceil((1 - bucket.tokens) / bucket.refillPerMs)
    throw new RateLimitedError(key, waitMs)
  }

  bucket.tokens -= 1
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear()
}

/* -------------------------------------------------------------------------- */
/* Response cache                                                             */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/** Bound the in-process cache so a long-lived instance cannot grow unbounded. */
const MAX_CACHE_ENTRIES = 500

export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (entry === undefined) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return entry.value as T
}

export function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest insertion. Map preserves insertion order, so the first
    // key is the least recently added.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

export function resetCache(): void {
  cache.clear()
}

/**
 * Cache-then-limit wrapper.
 *
 * Order matters: a cache hit must not consume a rate-limit token, because a
 * cached answer involves no upstream call at all. Checking the cache first is
 * what lets a burst of identical scans stay well inside a 20/minute ceiling.
 *
 * Three tiers, in order: in-process map, then the persisted cache (best
 * effort — a miss there is silent, never an error), then upstream. A fresh
 * fetch is written back to both, so the next request on *this* instance and
 * the next cold start elsewhere both benefit.
 */
export async function throttledFetch<T>(options: {
  source: string
  cacheKey: string
  ttlSeconds: number
  requestsPerMinute: number
  fetcher: () => Promise<T>
}): Promise<{ value: T; fromCache: boolean }> {
  const local = cacheGet<T>(options.cacheKey)
  if (local !== undefined) return { value: local, fromCache: true }

  const persisted = await getCachedResult<T>(options.source, options.cacheKey)
  if (persisted !== undefined) {
    cacheSet(options.cacheKey, persisted, options.ttlSeconds)
    return { value: persisted, fromCache: true }
  }

  acquire(options.source, options.requestsPerMinute)

  const value = await options.fetcher()
  cacheSet(options.cacheKey, value, options.ttlSeconds)
  void putCachedResult(options.source, options.cacheKey, value, options.ttlSeconds)
  return { value, fromCache: false }
}
