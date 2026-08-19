import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceAdapter } from '@/lib/core/adapter'
import { sourcesFor } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceId, SourceResult } from '@/lib/core/types'
import { buildResult, unverifiable } from '@/lib/sources/result'

const registry = vi.hoisted(() => ({ adapters: {} as Partial<Record<SourceId, SourceAdapter>> }))

vi.mock('@/lib/orchestrator/registry', () => ({
  ADAPTERS: registry.adapters,
  adapterFor: (id: SourceId) => registry.adapters[id],
}))

const { POST } = await import('./route')

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'quick' }

function fakeAdapter(id: SourceId, impl: SourceAdapter['run']): SourceAdapter {
  return { id, run: impl }
}

/** One placeholder result per source this scan type runs, all clean, so the
 * request carries a complete, schema-valid results array like the client would. */
function baselineResults(): SourceResult[] {
  return sourcesFor(ctx.scanType).map((s) => buildResult({ source: s.id, status: 'no_conflict' }))
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/scan/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  registry.adapters = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/scan/retry', () => {
  it('re-runs the named source and returns a recomputed summary', async () => {
    const results = baselineResults().map((r) =>
      r.source === 'npm' ? unverifiable('npm', 'TIMEOUT', 'npm timed out', true) : r,
    )
    registry.adapters.npm = fakeAdapter('npm', async () =>
      buildResult({ source: 'npm', status: 'no_conflict' }),
    )

    const response = await post({ context: ctx, results, source: 'npm' })
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      result: SourceResult
      summary: { results: SourceResult[]; coverage: number }
    }
    expect(body.result.status).toBe('no_conflict')
    expect(body.summary.results.find((r) => r.source === 'npm')?.status).toBe('no_conflict')
    // Every other source in the request is untouched.
    expect(body.summary.results.find((r) => r.source === 'github')?.status).toBe('no_conflict')
  })

  it('refuses to retry a source that is not actually unverified', async () => {
    const results = baselineResults()
    const response = await post({ context: ctx, results, source: 'npm' })
    expect(response.status).toBe(400)
  })

  it('refuses a source outside this scan type', async () => {
    const results = baselineResults()
    // `web` only runs on Deep Check; this context is a Quick Check.
    const response = await post({ context: ctx, results, source: 'web' })
    expect(response.status).toBe(400)
  })

  it('rejects a malformed body', async () => {
    const response = await post({ context: ctx })
    expect(response.status).toBe(400)
  })
})
