import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { appStoreAdapter } from '@/lib/sources/app_store'
import { edgarAdapter, resetEdgarCorpus } from '@/lib/sources/edgar'
import { resetHealth } from '@/lib/sources/health'
import { acquire, RateLimitedError, resetCache, resetRateLimits, throttledFetch } from '@/lib/sources/rate-limit'
import { socialsAdapter } from '@/lib/sources/socials'
import { wikidataAdapter } from '@/lib/sources/wikidata'

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'deep' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

type Route = { match: string; status: number; body: unknown }

function mockFetch(routes: Route[], fallback = { status: 200, body: {} }) {
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
  resetEdgarCorpus()
  // The response cache and limiter are process-global by design, so tests must
  // start from a clean slate or one case will serve another its cached payload.
  resetCache()
  resetRateLimits()
  resetHealth()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
  resetEdgarCorpus()
  resetCache()
  resetRateLimits()
  resetHealth()
})

/* -------------------------------------------------------------------------- */

describe('app store adapter', () => {
  it('reports no conflict when nothing similar exists', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: 'itunes.apple.com', status: 200, body: { resultCount: 0, results: [] } }]))
    const result = await appStoreAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('never implies Apple confirms availability', async () => {
    // §12: label results as existing App Store names, nothing stronger.
    vi.stubGlobal('fetch', mockFetch([{ match: 'itunes.apple.com', status: 200, body: { resultCount: 0, results: [] } }]))
    const result = await appStoreAdapter.run(ctx, deps())
    const text = result.evidence.map((e) => e.label).join(' ')
    expect(text).toContain('Apple does not confirm name availability')
  })

  it('flags an exact existing app as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'itunes.apple.com',
          status: 200,
          body: {
            resultCount: 1,
            results: [
              {
                trackId: 1,
                trackName: 'Envryn',
                sellerName: 'Envryn Ltd',
                primaryGenreName: 'Productivity',
                trackViewUrl: 'https://apps.apple.com/app/id1',
              },
            ],
          },
        },
      ]),
    )
    const result = await appStoreAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.owner).toBe('Envryn Ltd')
  })

  it('discards results too dissimilar to matter', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'itunes.apple.com',
          status: 200,
          body: {
            resultCount: 1,
            results: [{ trackId: 9, trackName: 'Completely Different Thing' }],
          },
        },
      ]),
    )
    const result = await appStoreAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('degrades to unable_to_verify when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await appStoreAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */

describe('wikidata adapter', () => {
  const entities = (search: unknown[]) => [
    { match: 'wikidata.org', status: 200, body: { search } },
  ]

  it('reports no conflict on an empty result', async () => {
    vi.stubGlobal('fetch', mockFetch(entities([])))
    const result = await wikidataAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('excludes villages, people and species as irrelevant', async () => {
    // A village called Envryn is not a naming conflict, and surfacing it is a
    // false positive rather than harmless extra information.
    vi.stubGlobal(
      'fetch',
      mockFetch(
        entities([
          { id: 'Q1', label: 'Envryn', description: 'village in France' },
          { id: 'Q2', label: 'Envryn', description: 'given name' },
        ]),
      ),
    )
    const result = await wikidataAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
    expect(result.evidence.some((e) => e.label.includes('excluded as irrelevant'))).toBe(true)
  })

  it('surfaces a commercial entity as a conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(entities([{ id: 'Q3', label: 'Envryn', description: 'software company' }])),
    )
    const result = await wikidataAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.severity).not.toBe('low')
  })

  it('states that a clean result does not mean the name is unused', async () => {
    vi.stubGlobal('fetch', mockFetch(entities([])))
    const result = await wikidataAdapter.run(ctx, deps())
    expect(result.evidence.some((e) => e.label.includes('does not mean the name is unused'))).toBe(
      true,
    )
  })
})

/* -------------------------------------------------------------------------- */

describe('edgar adapter', () => {
  const tickers = {
    match: 'company_tickers.json',
    status: 200,
    body: {
      '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
      '1': { cik_str: 111, ticker: 'ENV', title: 'Envryn Corporation' },
      '2': { cik_str: 222, ticker: 'ZZZ', title: 'Unrelated Holdings Ltd' },
    },
  }

  it('declines to call the SEC without a contact address', async () => {
    // The SEC requires a declared contact in the User-Agent. Making the request
    // anyway would be non-compliant, so we say why instead.
    vi.stubEnv('CONTACT_EMAIL', '')
    resetEnvCache()
    const result = await edgarAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('NO_CONTACT_EMAIL')
  })

  it('finds an exact registrant, ignoring the corporate suffix', async () => {
    // "Envryn Corporation" must match "Envryn" — the suffix carries no
    // distinguishing power.
    vi.stubEnv('CONTACT_EMAIL', 'dev@example.com')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch([tickers]))
    const result = await edgarAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('Envryn Corporation')
  })

  it('does not match unrelated companies on their suffix alone', async () => {
    vi.stubEnv('CONTACT_EMAIL', 'dev@example.com')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch([tickers]))
    const result = await edgarAdapter.run(ctx, deps())
    const names = [...result.exactMatches, ...result.similarMatches].map((m) => m.name)
    expect(names).not.toContain('Unrelated Holdings Ltd')
  })

  it('states its scope so a clean result is not over-read', async () => {
    vi.stubEnv('CONTACT_EMAIL', 'dev@example.com')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch([{ ...tickers, body: {} }]))
    const result = await edgarAdapter.run(ctx, deps())
    expect(
      result.evidence.some((e) => e.label.includes('not US companies in general')),
    ).toBe(true)
  })

  it('degrades to unable_to_verify when the list cannot be fetched', async () => {
    vi.stubEnv('CONTACT_EMAIL', 'dev@example.com')
    resetEnvCache()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await edgarAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
  })
})

/* -------------------------------------------------------------------------- */

describe('socials adapter', () => {
  it('always reports manual_check_recommended and never a conflict status', async () => {
    // The most important assertion in this file. No social platform offers free
    // reliable handle verification, so any confident status here would be a
    // guess — and a green check would be the exact failure the product exists
    // to prevent.
    const result = await socialsAdapter.run(ctx, deps())
    expect(result.status).toBe('manual_check_recommended')
    expect(result.confidence).toBe(0)
    expect(result.exactMatches).toHaveLength(0)
    expect(result.similarMatches).toHaveLength(0)
  })

  it('provides a working profile link for every platform', async () => {
    const result = await socialsAdapter.run(ctx, deps())
    const linked = result.evidence.filter((e) => e.url !== undefined)

    // One link per platform this adapter speaks for, whatever that list holds:
    // a platform leaves it whenever it becomes checkable properly, and the
    // point of this test is that none is left without a way to check it.
    const platforms = result.meta?.['platforms']
    expect(Array.isArray(platforms)).toBe(true)
    expect(linked.length).toBe((platforms as unknown[]).length)
    for (const e of linked) expect(e.url).toMatch(/^https:\/\//)
    for (const p of platforms as { url?: string }[]) expect(p.url).toMatch(/^https:\/\//)
  })

  it('uses the normalized handle in profile URLs', async () => {
    const result = await socialsAdapter.run({ ...ctx, name: 'Env-Ryn' }, deps())
    const instagram = result.evidence.find((e) => e.label.startsWith('Instagram'))
    expect(instagram?.url).toBe('https://instagram.com/envryn')
  })

  it('makes no network request at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await socialsAdapter.run(ctx, deps())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('explains why verification is unavailable rather than staying silent', async () => {
    const result = await socialsAdapter.run(ctx, deps())
    const text = result.evidence.map((e) => e.label).join(' ')
    expect(text).toContain('No social platform offers a free, reliable handle-availability API')
  })
})

/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('allows calls up to the declared ceiling, then refuses', () => {
    // The bucket starts full, so the first N calls pass and the next is refused
    // locally rather than being fired at the provider.
    for (let i = 0; i < 5; i++) acquire('test-source', 5)
    expect(() => acquire('test-source', 5)).toThrow(RateLimitedError)
  })

  it('keeps separate budgets per source', () => {
    for (let i = 0; i < 3; i++) acquire('source-a', 3)
    expect(() => acquire('source-b', 3)).not.toThrow()
  })

  it('serves a cache hit without spending a rate-limit token', async () => {
    // This is what keeps a burst of identical scans inside a 20/minute ceiling.
    let calls = 0
    const run = () =>
      throttledFetch({
        source: 'cached-source',
        cacheKey: 'k',
        ttlSeconds: 60,
        requestsPerMinute: 1,
        fetcher: async () => {
          calls++
          return { ok: true }
        },
      })

    const first = await run()
    expect(first.fromCache).toBe(false)

    // Budget is now exhausted, but the cached answer needs no token at all.
    const second = await run()
    expect(second.fromCache).toBe(true)
    expect(calls).toBe(1)
  })

  it('refuses rather than calling upstream once the budget is gone', async () => {
    let calls = 0
    const run = (key: string) =>
      throttledFetch({
        source: 'strict-source',
        cacheKey: key,
        ttlSeconds: 60,
        requestsPerMinute: 1,
        fetcher: async () => {
          calls++
          return { ok: true }
        },
      })

    await run('a')
    await expect(run('b')).rejects.toBeInstanceOf(RateLimitedError)
    expect(calls).toBe(1)
  })
})

describe('throttled sources never read as clear', () => {
  it('reports App Store as unable_to_verify when locally rate-limited', async () => {
    // The core invariant of this whole subsystem: a source we were throttled on
    // told us nothing, and nothing is not the same as nothing-found.
    vi.stubGlobal('fetch', mockFetch([{ match: 'itunes.apple.com', status: 200, body: { results: [] } }]))

    const limit = 18
    for (let i = 0; i < limit; i++) acquire('app_store', limit)

    const result = await appStoreAdapter.run({ ...ctx, name: 'UniqueNameNotCached' }, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('RATE_LIMITED')
    expect(result.confidence).toBe(0)
    expect(result.error?.message).toContain('not evidence the name is unused')
  })

  it('reports Wikidata as unable_to_verify on an upstream 429', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: 'wikidata.org', status: 429, body: {} }]))
    const result = await wikidataAdapter.run({ ...ctx, name: 'AnotherUniqueName' }, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('RATE_LIMITED')
    expect(result.confidence).toBe(0)
  })
})
