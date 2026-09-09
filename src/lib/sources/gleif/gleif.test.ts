import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { gleifAdapter } from '@/lib/sources/gleif'
import { resetCache, resetRateLimits } from '@/lib/sources/rate-limit'

const ctx: ScanContext = { name: 'Envryn', category: 'finance', scanType: 'deep' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

type Route = { match: string; status: number; body: unknown }

function mockFetch(routes: Route[], fallback: { status: number; body: unknown } = { status: 404, body: {} }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const route = routes.find((r) => url.includes(r.match))
    const chosen = route ?? fallback
    return new Response(JSON.stringify(chosen.body), {
      status: chosen.status,
      headers: { 'content-type': 'application/json' },
    })
  })
}

beforeEach(() => {
  resetEnvCache()
  resetCache()
  resetRateLimits()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
  resetCache()
  resetRateLimits()
})

describe('GLEIF adapter', () => {
  it('reports no results as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: 'lei-records', status: 200, body: { data: [] } }]))
    const result = await gleifAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports an exact, active entity as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'lei-records',
          status: 200,
          body: {
            data: [
              {
                id: '213800ABCDEFGHIJKLM',
                attributes: {
                  entity: { legalName: { name: 'Envryn' }, jurisdiction: 'GB', status: 'ACTIVE' },
                  registration: { status: 'ISSUED' },
                },
              },
            ],
            meta: { pagination: { total: 1 } },
          },
        },
      ]),
    )
    const result = await gleifAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.active).toBe(true)
    // No industry code accompanies an LEI record — the schema forbids
    // fabricating one for a source that never provides it.
    expect(result.exactMatches[0]?.similarity.industry).toBeUndefined()
  })

  it('marks a lapsed registration as inactive', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'lei-records',
          status: 200,
          body: {
            data: [
              {
                id: '213800LAPSEDLAPSEDLA',
                attributes: {
                  entity: { legalName: { name: 'Envryn' }, jurisdiction: 'GB', status: 'ACTIVE' },
                  registration: { status: 'LAPSED' },
                },
              },
            ],
          },
        },
      ]),
    )
    const result = await gleifAdapter.run(ctx, deps())
    expect(result.exactMatches[0]?.active).toBe(false)
  })

  it('degrades to unable_to_verify when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await gleifAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })
})
