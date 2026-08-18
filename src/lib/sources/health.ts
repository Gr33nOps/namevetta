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
 * In-process only for now. Phase 4 persists this to `source_health` so the
 * signal survives cold starts and is shared across instances.
 */
import type { SourceId } from '@/lib/core/types'
import type { SourceHealth } from '@/lib/scoring/confidence'

export type Outcome = 'success' | 'failure' | 'rate_limited' | 'timeout'

interface Window {
  outcomes: { at: number; outcome: Outcome }[]
}

const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_SAMPLES = 200

const windows = new Map<SourceId, Window>()

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

/**
 * Current health for a source, or `undefined` when there is not enough data.
 *
 * Rate limiting counts as a failure. A source we keep being throttled by is a
 * source we cannot rely on, and its confidence should reflect that even on the
 * calls that do get through.
 */
export function healthFor(source: SourceId): SourceHealth | undefined {
  const window = windows.get(source)
  if (window === undefined || window.outcomes.length === 0) return undefined

  const total = window.outcomes.length
  const successes = window.outcomes.filter((o) => o.outcome === 'success').length
  return { successRate: successes / total, samples: total }
}

/** Snapshot for the health endpoint and for debugging. */
export function healthSnapshot(): Record<string, { successRate: number; samples: number }> {
  const out: Record<string, { successRate: number; samples: number }> = {}
  for (const [source] of windows) {
    const health = healthFor(source)
    if (health !== undefined) out[source] = health
  }
  return out
}

export function resetHealth(): void {
  windows.clear()
}
