/**
 * Scan orchestration (§57, §58).
 *
 * Runs every source for a scan concurrently, each under its own timeout, and
 * yields results as they land so the UI can show progress instead of a spinner.
 *
 * The contract that matters: **no single source can break a scan.** A timeout,
 * a throw, a malformed response, a missing credential — all become a
 * well-formed `unable_to_verify` result. The scan always completes.
 */
import { SOURCE_MANIFEST, sourcesFor, type AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { SourceResultSchema, type SourceId, type SourceResult } from '@/lib/core/types'
import { classifyScanContext, enrichResult } from '@/lib/industry/enrich'
import type { Classification } from '@/lib/industry/classify'
import { adapterFor } from '@/lib/orchestrator/registry'
import { countsTowardHealth } from '@/lib/presentation'
import { computeCoverage } from '@/lib/scoring/confidence'
import { weightsFor } from '@/lib/scoring/weights'
import { computeViability, type ViabilityResult } from '@/lib/scoring/viability'
import { loadHealthSnapshot, persistOutcome, recordOutcome } from '@/lib/sources/health'
import { unverifiable } from '@/lib/sources/result'

export interface ScanSummary {
  results: SourceResult[]
  viability: ViabilityResult
  coverage: number
}

/**
 * The AI explanation, as a distinct step after `complete`.
 *
 * Never blocks the report: scores and evidence are already on screen by the
 * time this arrives, or does not arrive. `unavailable` carries a reason so the
 * UI can say why rather than leaving a spinner forever — a missing key, an
 * exhausted allowance, and "could not be verified against the report" are
 * different situations and read differently to a user.
 */
export type AiSummaryEvent =
  | { status: 'ready'; text: string; model: string }
  | { status: 'unavailable'; reason: string }

export type ScanEvent =
  | { type: 'started'; sources: SourceId[] }
  | { type: 'source'; result: SourceResult }
  | { type: 'complete'; summary: ScanSummary }
  | { type: 'ai_summary'; summary: AiSummaryEvent }

export interface RunOptions {
  signal?: AbortSignal
  /** Overall ceiling for the whole scan, independent of per-source timeouts. */
  overallTimeoutMs?: number
  log?: (event: string, data?: Record<string, unknown>) => void
}

const DEFAULT_OVERALL_TIMEOUT_MS = 60_000

/**
 * Run one source under its manifest timeout, converting every failure mode into
 * a valid `SourceResult`.
 *
 * Output is validated against the schema before being returned: an adapter bug
 * that produces, say, matches on an `unable_to_verify` result is caught here
 * rather than reaching the report and being rendered as fact.
 */
export async function runSource(
  id: SourceId,
  ctx: ScanContext,
  scanClassification: Classification,
  parentSignal: AbortSignal,
  log: NonNullable<RunOptions['log']> = () => {},
): Promise<SourceResult> {
  const manifest = SOURCE_MANIFEST[id]
  const adapter = adapterFor(id)

  if (adapter === undefined) {
    return unverifiable(id, 'NOT_IMPLEMENTED', `${manifest.label} is not available yet.`, false)
  }

  const controller = new AbortController()
  if (parentSignal.aborted) controller.abort()
  const onParentAbort = (): void => controller.abort()
  parentSignal.addEventListener('abort', onParentAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), manifest.timeoutMs)

  // Records locally (synchronous, immediate) and persists cross-instance
  // (best-effort, fire-and-forget) in the same call, so every call site only
  // has to make one decision about what happened.
  const record = (outcome: Parameters<typeof recordOutcome>[1]): void => {
    recordOutcome(id, outcome)
    void persistOutcome(id, outcome).catch(() => {})
  }

  const started = Date.now()
  try {
    const deps: AdapterDeps = {
      signal: controller.signal,
      log: (event, data) => log(event, { source: id, ...data }),
    }
    const raw = await adapter.run(ctx, deps)

    const parsed = SourceResultSchema.safeParse(raw)
    if (!parsed.success) {
      record('failure')
      log('adapter.invalid_output', { source: id, issues: parsed.error.issues.length })
      return unverifiable(
        id,
        'INVALID_ADAPTER_OUTPUT',
        `${manifest.label} returned a malformed result and was discarded.`,
        false,
      )
    }
    /*
      Health follows what we actually learned, not whether the call returned.
      A source that answered `unable_to_verify` told us nothing and is counted
      as a failure, so repeated throttling visibly erodes its confidence.

      With one exception, which the public status page exists to get right: a
      source the product *chose* not to call has no outcome to record. Counting
      that as a failure is how Google Play came to read as 100% broken on a
      page whose whole job is to publish reliability honestly — it was never
      asked. The same goes for a manual-only source, which issues no request,
      and for a missing credential or spent budget, which is our constraint
      rather than the provider's.
    */
    if (countsTowardHealth(parsed.data)) {
      record(
        parsed.data.status === 'unable_to_verify'
          ? parsed.data.error?.code === 'RATE_LIMITED'
            ? 'rate_limited'
            : 'failure'
          : 'success',
      )
    }
    log('source.done', { source: id, ms: Date.now() - started, status: parsed.data.status })

    // Industry relevance is applied here, after validation, so every source is
    // judged by the same rule and severity stays consistent across adapters.
    return enrichResult(ctx, scanClassification, parsed.data)
  } catch (cause) {
    const timedOut = controller.signal.aborted
    record(timedOut ? 'timeout' : 'failure')
    log('source.failed', { source: id, ms: Date.now() - started, timedOut })
    return unverifiable(
      id,
      timedOut ? 'TIMEOUT' : 'ADAPTER_ERROR',
      timedOut
        ? `${manifest.label} timed out after ${manifest.timeoutMs / 1000}s.`
        : cause instanceof Error
          ? cause.message
          : `${manifest.label} failed.`,
      true,
    )
  } finally {
    clearTimeout(timer)
    parentSignal.removeEventListener('abort', onParentAbort)
  }
}

/**
 * Run a scan, yielding events as sources complete.
 *
 * Async generator rather than callbacks so the caller decides how to consume it
 * — the streaming route pipes it to the client, tests drain it into an array,
 * and Phase 4 will write each event to Postgres for Realtime to broadcast.
 */
export async function* runScan(
  ctx: ScanContext,
  options: RunOptions = {},
): AsyncGenerator<ScanEvent> {
  const { overallTimeoutMs = DEFAULT_OVERALL_TIMEOUT_MS, log = () => {} } = options

  const sources = sourcesFor(ctx.scanType).map((s) => s.id)
  yield { type: 'started', sources }

  // Classified once per scan rather than once per match.
  const scanClassification = classifyScanContext(ctx)

  // Best-effort and strictly time-boxed: a slow or unreachable database must
  // never delay the scan itself, only cost it the cross-instance health signal
  // for this one run — sources still fall back to "assume healthy," same as
  // before this existed.
  await Promise.race([
    loadHealthSnapshot(),
    new Promise((resolve) => setTimeout(resolve, 800)),
  ])

  const overall = new AbortController()
  const onAbort = (): void => overall.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) overall.abort()
  const overallTimer = setTimeout(() => overall.abort(), overallTimeoutMs)

  const results: SourceResult[] = []

  try {
    // Kick every source off at once, then surface each as it settles. Racing
    // the pending set keeps the fastest source visible immediately rather than
    // waiting on the slowest, which is the point of §58.
    const pending = new Map<SourceId, Promise<{ id: SourceId; result: SourceResult }>>()
    for (const id of sources) {
      pending.set(
        id,
        runSource(id, ctx, scanClassification, overall.signal, log).then((result) => ({ id, result })),
      )
    }

    while (pending.size > 0) {
      const settled = await Promise.race(pending.values())
      pending.delete(settled.id)
      results.push(settled.result)
      yield { type: 'source', result: settled.result }
    }
  } finally {
    clearTimeout(overallTimer)
    options.signal?.removeEventListener('abort', onAbort)
  }

  const viability = computeViability({ category: ctx.category, results })
  const coverage = computeCoverage({
    intended: sources,
    results: new Map(results.map((r) => [r.source, r])),
    weights: weightsFor(ctx.category),
  })

  yield { type: 'complete', summary: { results, viability, coverage } }
}

/** Drain a scan to completion. Convenient for tests and non-streaming callers. */
export async function runScanToCompletion(
  ctx: ScanContext,
  options: RunOptions = {},
): Promise<ScanSummary> {
  let summary: ScanSummary | undefined
  for await (const event of runScan(ctx, options)) {
    if (event.type === 'complete') summary = event.summary
  }
  if (summary === undefined) throw new Error('Scan produced no summary')
  return summary
}
