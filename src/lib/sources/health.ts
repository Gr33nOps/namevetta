/**
 * Source health tracking (§39).
 *
 * Records outcomes per source over a rolling window and feeds
 * `healthMultiplier`, so a degrading source loses confidence automatically
 * rather than continuing to be trusted until somebody notices.
 *
 * The distinction this module enforces: being **rate-limited or blocked is not
 * a soft failure**. It means we learned nothing, and the scan must say so. A
 * source in that state can never contribute a passing result — which is handled
 * upstream by returning `unable_to_verify`, and reinforced here by counting it
 * against the source's health.
 *
 * In-process data is the fast path, used as-is once it has enough samples.
 * Below that threshold — the common case on serverless, where a single
 * instance rarely sees `MIN_HEALTH_SAMPLES` calls to one source before it
 * recycles — a snapshot loaded once per scan from `source_health` (persisted
 * by `record_source_outcome`, migration 0005) fills the gap, so confidence
 * reflects what every instance has seen, not just this one.
 */
import { isDatabaseConfigured, serviceClient } from '@/lib/db/client'
import type { SourceId } from '@/lib/core/types'
import { MIN_HEALTH_SAMPLES, type SourceHealth } from '@/lib/scoring/confidence'

export type Outcome = 'success' | 'failure' | 'rate_limited' | 'timeout'

interface Window {
  outcomes: { at: number; outcome: Outcome }[]
}

const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_SAMPLES = 200

const windows = new Map<SourceId, Window>()

/** Cross-instance baseline, loaded once per scan by `loadHealthSnapshot`. */
let seed = new Map<SourceId, SourceHealth>()

export function recordOutcome(source: SourceId, outcome: Outcome): void {
  let window = windows.get(source)
  if (window === undefined) {
    window = { outcomes: [] }
    windows.set(source, window)
  }

  window.outcomes.push({ at: Date.now(), outcome })

  const cutoff = Date.now() - WINDOW_MS
  while (window.outcomes.length > 0 && (window.outcomes[0] as { at: number }).at < cutoff) {
    window.outcomes.shift()
  }
  if (window.outcomes.length > MAX_SAMPLES) {
    window.outcomes.splice(0, window.outcomes.length - MAX_SAMPLES)
  }
}

/** Best-effort persistence of one outcome, so it counts for every instance. */
export async function persistOutcome(source: SourceId, outcome: Outcome): Promise<void> {
  if (!isDatabaseConfigured()) return
  try {
    await serviceClient().rpc('record_source_outcome', { p_source: source, p_outcome: outcome })
    if (Math.random() < 0.01) {
      void serviceClient()
        .rpc('sweep_source_health')
        .then(() => {}, () => {})
    }
  } catch {
    // Health is an optimisation on top of confidence, never a gate on it.
  }
}

/**
 * Load the trailing-24h cross-instance snapshot once per scan.
 *
 * Deliberately not awaited by every call site that might want it — the caller
 * decides how much startup latency is worth spending, and a failure here just
 * means every source falls back to "assume healthy," the same as today.
 */
export async function loadHealthSnapshot(): Promise<void> {
  if (!isDatabaseConfigured()) return
  try {
    const { data, error } = await serviceClient().rpc('get_source_health_snapshot')
    if (error !== null || !Array.isArray(data)) return

    const next = new Map<SourceId, SourceHealth>()
    for (const row of data as { source: string; requests: number; successes: number }[]) {
      if (row.requests <= 0) continue
      next.set(row.source as SourceId, {
        successRate: row.successes / row.requests,
        samples: row.requests,
      })
    }
    seed = next
  } catch {
    // Leave the previous seed (or none) in place.
  }
}

/**
 * Current health for a source, or `undefined` when there is not enough data
 * anywhere to say.
 *
 * Rate limiting counts as a failure. A source we keep being throttled by is a
 * source we cannot rely on, and its confidence should reflect that even on the
 * calls that do get through.
 *
 * Local, in-process samples take priority once there are enough of them — they
 * are the freshest signal. Below that, the persisted cross-instance seed
 * stands in, which is what makes health mean something on a platform where one
 * process rarely lives long enough to gather it alone.
 */
export function healthFor(source: SourceId): SourceHealth | undefined {
  const window = windows.get(source)
  if (window !== undefined && window.outcomes.length >= MIN_HEALTH_SAMPLES) {
    const total = window.outcomes.length
    const successes = window.outcomes.filter((o) => o.outcome === 'success').length
    return { successRate: successes / total, samples: total }
  }

  const seeded = seed.get(source)
  if (seeded !== undefined) return seeded

  if (window !== undefined && window.outcomes.length > 0) {
    const total = window.outcomes.length
    const successes = window.outcomes.filter((o) => o.outcome === 'success').length
    return { successRate: successes / total, samples: total }
  }

  return undefined
}

/** Snapshot for the health endpoint and for debugging. */
export function healthSnapshot(): Record<string, { successRate: number; samples: number }> {
  const out: Record<string, { successRate: number; samples: number }> = {}
  const sources = new Set<SourceId>([...windows.keys(), ...seed.keys()])
  for (const source of sources) {
    const health = healthFor(source)
    if (health !== undefined) out[source] = health
  }
  return out
}

export function resetHealth(): void {
  windows.clear()
  seed = new Map()
}
