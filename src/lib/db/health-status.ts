import 'server-only'

/**
 * Read-only access to the persisted health snapshot, for the public `/status`
 * page. Deliberately separate from `src/lib/sources/health.ts`: that module's
 * `seed` is scan-scoped state used to feed confidence during a live scan, and
 * reusing it here would tangle an unrelated read with orchestration timing.
 * This just asks Postgres what the last 24 hours looked like.
 */
import { isDatabaseConfigured, serviceClient } from './client'

export interface PublicSourceHealth {
  requests: number
  successes: number
  successRate: number
}

/** Trailing-24h counts per source, or an empty map when unavailable. */
export async function publicHealthSnapshot(): Promise<Map<string, PublicSourceHealth>> {
  const out = new Map<string, PublicSourceHealth>()
  if (!isDatabaseConfigured()) return out

  try {
    const { data, error } = await serviceClient().rpc('get_source_health_snapshot')
    if (error !== null || !Array.isArray(data)) return out

    for (const row of data as { source: string; requests: number; successes: number }[]) {
      if (row.requests <= 0) continue
      out.set(row.source, {
        requests: row.requests,
        successes: row.successes,
        successRate: row.successes / row.requests,
      })
    }
  } catch {
    // An empty map reads as "no recent data," which is honest either way.
  }
  return out
}
