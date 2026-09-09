import 'server-only'

/**
 * Cross-instance response cache, backing `source_cache` (0001, wired up in
 * 0005).
 *
 * Layered under the in-process cache in `src/lib/sources/rate-limit.ts`: that
 * one is checked first because it costs nothing, and only a miss there reaches
 * here. A cold serverless instance that would otherwise re-spend a rate-limit
 * token or a Tavily credit finds a warm answer instead.
 *
 * Every operation is best-effort. A cache read or write failing must never
 * fail a scan — worst case, this degrades back to hitting the upstream API,
 * exactly like today.
 */
import { isDatabaseConfigured, serviceClient } from './client'

/** Sweep expired rows on roughly 1 in 50 writes rather than on a schedule. */
const SWEEP_PROBABILITY = 0.02

export async function getCachedResult<T>(source: string, cacheKey: string): Promise<T | undefined> {
  if (!isDatabaseConfigured()) return undefined
  try {
    const { data, error } = await serviceClient()
      .from('source_cache')
      .select('payload, expires_at')
      .eq('source', source)
      .eq('cache_key', cacheKey)
      .maybeSingle()

    if (error !== null || data === null) return undefined
    const row = data as { payload: unknown; expires_at: string }
    if (new Date(row.expires_at).getTime() <= Date.now()) return undefined
    return row.payload as T
  } catch {
    return undefined
  }
}

export async function putCachedResult(
  source: string,
  cacheKey: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!isDatabaseConfigured()) return
  try {
    await serviceClient()
      .from('source_cache')
      .upsert(
        {
          source,
          cache_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        },
        { onConflict: 'source,cache_key' },
      )

    if (Math.random() < SWEEP_PROBABILITY) {
      void serviceClient()
        .rpc('sweep_source_cache')
        .then(() => {}, () => {})
    }
  } catch {
    // A failed write just means the next instance pays the upstream cost too.
  }
}
