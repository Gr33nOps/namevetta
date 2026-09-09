import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { osmAdapter } from '@/lib/sources/osm'
import { resetCache, resetRateLimits } from '@/lib/sources/rate-limit'

const ctx: ScanContext = { name: 'Envryn', category: 'restaurant', scanType: 'deep' }
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

describe('OpenStreetMap local business adapter', () => {
  it('reports no results as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/search', status: 200, body: [] }]))
    const result = await osmAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports an exact-named business as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/search',
          status: 200,
          body: [
            {
              osm_id: 276329431,
              name: 'Envryn',
              display_name: 'Envryn, 7 Boundary Street, London',
              category: 'amenity',
              type: 'restaurant',
              lat: '51.5244991',
              lon: '-0.0768246',
            },
          ],
        },
      ]),
    )
    const result = await osmAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('Envryn')
  })

  it('excludes non-business geographic features', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/search',
          status: 200,
          body: [
            {
              osm_id: 1,
              name: 'Envryn',
              display_name: 'Envryn, a mountain',
              category: 'natural',
              type: 'peak',
              lat: '1',
              lon: '1',
            },
          ],
        },
      ]),
    )
    const result = await osmAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
    expect(result.exactMatches).toHaveLength(0)
  })

  it('degrades to unable_to_verify when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await osmAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })
})
