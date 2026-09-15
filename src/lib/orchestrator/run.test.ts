import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceId, SourceResult } from '@/lib/core/types'
import { buildResult } from '@/lib/sources/result'

const registry = vi.hoisted(() => ({ adapters: {} as Partial<Record<SourceId, SourceAdapter>> }))

vi.mock('@/lib/orchestrator/registry', () => ({
  ADAPTERS: registry.adapters,
  adapterFor: (id: SourceId) => registry.adapters[id],
}))

const { runScan, runScanToCompletion } = await import('@/lib/orchestrator/run')

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'quick' }

function fakeAdapter(id: SourceId, impl: SourceAdapter['run']): SourceAdapter {
  return { id, run: impl }
}

/** An adapter that always answers cleanly. */
function cleanAdapter(id: SourceId): SourceAdapter {
  return fakeAdapter(id, async () => buildResult({ source: id, status: 'no_conflict' }))
}

beforeEach(() => {
  registry.adapters = {}
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runScan', () => {
  it('emits started, one event per source, then complete', async () => {
    for (const id of ['domain', 'github', 'npm', 'pypi', 'youtube'] as SourceId[]) {
      registry.adapters[id] = cleanAdapter(id)
    }

    const events = []
    for await (const event of runScan(ctx)) events.push(event)

    expect(events[0]?.type).toBe('started')
    expect(events.at(-1)?.type).toBe('complete')
    const sourceEvents = events.filter((e) => e.type === 'source')
    expect(sourceEvents.length).toBeGreaterThanOrEqual(5)
  })

  it('converts a thrown adapter error into unable_to_verify and still completes', async () => {
    // The §57 contract: one broken provider must never break a scan.
    registry.adapters.github = fakeAdapter('github', async () => {
      throw new Error('upstream exploded')
    })
    registry.adapters.npm = cleanAdapter('npm')

    const summary = await runScanToCompletion(ctx)
    const github = summary.results.find((r) => r.source === 'github')

    expect(github?.status).toBe('unable_to_verify')
    expect(github?.error?.code).toBe('ADAPTER_ERROR')
    expect(github?.confidence).toBe(0)
    expect(summary.results.find((r) => r.source === 'npm')?.status).toBe('no_conflict')
  })

  it('reports a source that exceeds its timeout as unable_to_verify', async () => {
    registry.adapters.npm = fakeAdapter('npm', async (_ctx, deps) => {
      // Never settle on its own; rely on the orchestrator's abort.
      await new Promise((_resolve, reject) => {
        deps.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      throw new Error('unreachable')
    })

    const summary = await runScanToCompletion(ctx)
    const npm = summary.results.find((r) => r.source === 'npm')

    expect(npm?.status).toBe('unable_to_verify')
    expect(npm?.error?.code).toBe('TIMEOUT')
    expect(npm?.error?.retryable).toBe(true)
  }, 20_000)

  it('discards an adapter whose output violates the schema', async () => {
    // An adapter claiming a conflict on a result it also marked unverifiable
    // must not reach the report; it is rejected at the boundary.
    registry.adapters.npm = fakeAdapter('npm', async () => {
      const bad = {
        ...buildResult({ source: 'npm', status: 'unable_to_verify' }),
        similarMatches: [
          {
            externalId: 'x',
            name: 'x',
            categories: [],
            similarity: { text: 90, phonetic: 90, visual: 90, overall: 90 },
            severity: 'high',
            evidence: [],
          },
        ],
      }
      return bad as unknown as SourceResult
    })

    const summary = await runScanToCompletion(ctx)
    const npm = summary.results.find((r) => r.source === 'npm')

    expect(npm?.status).toBe('unable_to_verify')
    expect(npm?.error?.code).toBe('INVALID_ADAPTER_OUTPUT')
    expect(npm?.similarMatches).toHaveLength(0)
  })

  it('marks a source with no registered adapter as unimplemented, not as clean', async () => {
    // A silently skipped source would inflate coverage, which is precisely the
    // dishonesty the product exists to avoid.
    const summary = await runScanToCompletion(ctx)
    for (const result of summary.results) {
      expect(result.status).toBe('unable_to_verify')
      expect(result.error?.code).toBe('NOT_IMPLEMENTED')
    }
    expect(summary.coverage).toBe(0)
  })

  it('drops coverage but not the scan when some sources fail', async () => {
    registry.adapters.domain = cleanAdapter('domain')
    registry.adapters.github = cleanAdapter('github')
    registry.adapters.npm = cleanAdapter('npm')
    registry.adapters.pypi = cleanAdapter('pypi')
    registry.adapters.youtube = fakeAdapter('youtube', async () => {
      throw new Error('no key')
    })

    const summary = await runScanToCompletion(ctx)

    expect(summary.coverage).toBeGreaterThan(0)
    expect(summary.coverage).toBeLessThan(100)
    // The failure must not drag the score down — it is absent, not negative.
    expect(summary.viability.score).toBe(100)
  })

  it('runs sources concurrently rather than in sequence', async () => {
    const delay = 300
    for (const id of ['domain', 'github', 'npm', 'pypi', 'youtube'] as SourceId[]) {
      registry.adapters[id] = fakeAdapter(id, async () => {
        await new Promise((r) => setTimeout(r, delay))
        return buildResult({ source: id, status: 'no_conflict' })
      })
    }

    const started = Date.now()
    await runScanToCompletion(ctx)
    const elapsed = Date.now() - started

    // Five sequential 300ms calls would take 1500ms; concurrent should be well
    // under that even on a slow machine.
    expect(elapsed).toBeLessThan(1000)
  })

  it('only runs the sources belonging to the scan type', async () => {
    const deepSummary = await runScanToCompletion({ ...ctx, scanType: 'deep' })
    const quickSummary = await runScanToCompletion(ctx)

    const quickSources = quickSummary.results.map((r) => r.source)
    expect(quickSources).not.toContain('web')
    expect(deepSummary.results.map((r) => r.source)).toContain('web')
  })
})

it('cancels adapters already running when the caller leaves', async () => {
  const abort = new AbortController()
  registry.adapters.github = fakeAdapter('github', async (_ctx, deps) => {
    setTimeout(() => abort.abort(), 5)
    await new Promise((_resolve, reject) => deps.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    throw new Error('unreachable')
  })
  const result = await runScanToCompletion(ctx, { signal: abort.signal })
  expect(result.results.find((source) => source.source === 'github')?.status).toBe('unable_to_verify')
})
