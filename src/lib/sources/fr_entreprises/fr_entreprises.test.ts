import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { frEntreprisesAdapter } from '@/lib/sources/fr_entreprises'
import { resetCache, resetRateLimits } from '@/lib/sources/rate-limit'

const ctx: ScanContext = { name: 'Envryn', category: 'business', scanType: 'deep' }
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

describe('French company register adapter', () => {
  it('reports no results as no conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ match: 'recherche-entreprises', status: 200, body: { results: [], total_results: 0 } }]),
    )
    const result = await frEntreprisesAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports an exact, active company as a confirmed conflict with an industry hint', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'recherche-entreprises',
          status: 200,
          body: {
            results: [
              {
                siren: '123456789',
                nom_complet: 'ENVRYN',
                activite_principale: '62.01Z',
                etat_administratif: 'A',
                siege: { libelle_commune: 'PARIS' },
              },
            ],
            total_results: 1,
          },
        },
      ]),
    )
    const result = await frEntreprisesAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.active).toBe(true)
    expect(result.exactMatches[0]?.categories).toContain('dev_tools')
  })

  it('marks a closed company as inactive', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'recherche-entreprises',
          status: 200,
          body: {
            results: [
              { siren: '111', nom_complet: 'Envryn', etat_administratif: 'F' },
            ],
            total_results: 1,
          },
        },
      ]),
    )
    const result = await frEntreprisesAdapter.run(ctx, deps())
    expect(result.exactMatches[0]?.active).toBe(false)
  })

  it('degrades to unable_to_verify when unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await frEntreprisesAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })
})
