import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { cratesIoAdapter } from '@/lib/sources/crates_io'
import { dockerHubAdapter } from '@/lib/sources/docker_hub'
import { homebrewAdapter } from '@/lib/sources/homebrew'
import { nugetAdapter } from '@/lib/sources/nuget'
import { rubygemsAdapter } from '@/lib/sources/rubygems'

const ctx: ScanContext = { name: 'Envryn', category: 'developer_tool', scanType: 'quick' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

type Reply = { status: number; body: unknown } | { status: number; raw: string }
type Route = Reply & { match: string }

function mockFetch(routes: Route[], fallback: Reply = { status: 404, body: {} }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const route = routes.find((r) => url.includes(r.match))
    const chosen = route ?? fallback
    const text = 'raw' in chosen ? chosen.raw : JSON.stringify(chosen.body)
    const contentType = 'raw' in chosen ? 'text/plain' : 'application/json'
    return new Response(text, { status: chosen.status, headers: { 'content-type': contentType } })
  })
}

beforeEach(() => {
  resetEnvCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

/* -------------------------------------------------------------------------- */

describe('crates.io adapter', () => {
  it('reports an unpublished crate as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/crates?q=', status: 200, body: { crates: [] } }]))
    const result = await cratesIoAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports a published exact crate as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/crates?q=', status: 200, body: { crates: [] } },
        { match: '/crates/envryn', status: 200, body: { crate: { id: 'envryn', name: 'envryn', description: 'A thing' } } },
      ]),
    )
    const result = await cratesIoAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.description).toBe('A thing')
  })

  it('surfaces similar crates above the relevance threshold', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/crates?q=',
          status: 200,
          body: { crates: [{ id: 'envrin', name: 'envrin' }, { id: 'totally-unrelated', name: 'totally-unrelated' }] },
        },
      ]),
    )
    const result = await cratesIoAdapter.run(ctx, deps())
    expect(result.status).toBe('similar_found')
    expect(result.similarMatches.map((m) => m.name)).toContain('envrin')
    expect(result.similarMatches.map((m) => m.name)).not.toContain('totally-unrelated')
  })

  it('degrades to unable_to_verify when the registry is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await cratesIoAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.retryable).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */

describe('RubyGems adapter', () => {
  it('reports an unused gem name as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/search.json', status: 200, body: [] }]))
    const result = await rubygemsAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('finds a taken exact gem name', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/search.json', status: 200, body: [] },
        { match: '/gems/envryn.json', status: 200, body: { name: 'envryn', info: 'Secrets manager', authors: 'Jane Doe' } },
      ]),
    )
    const result = await rubygemsAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.description).toBe('Secrets manager')
    expect(result.exactMatches[0]?.owner).toBe('Jane Doe')
  })

  it('reports no conflict rather than unable_to_verify when the 404 body is plain text', async () => {
    // Regression: observed live that RubyGems' 404 for a missing gem is
    // `text/plain` ("This rubygem could not be found."), not JSON. Naively
    // JSON-parsing every response turned every genuinely free name into a
    // false "could not be reached" — the opposite of honest degradation.
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/search.json', status: 200, body: [] },
        { match: '/gems/envryn.json', status: 404, raw: 'This rubygem could not be found.' },
      ]),
    )
    const result = await rubygemsAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })
})

/* -------------------------------------------------------------------------- */

describe('NuGet adapter', () => {
  it('reports an unused package id as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([], { status: 200, body: { data: [] } }))
    const result = await nugetAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('finds a taken exact package id via the packageid: filter', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        [
          {
            match: 'packageid%3AEnvryn',
            status: 200,
            body: { data: [{ id: 'Envryn', description: 'Secrets manager' }] },
          },
        ],
        { status: 200, body: { data: [] } },
      ),
    )
    const result = await nugetAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('Envryn')
  })
})

/* -------------------------------------------------------------------------- */

describe('Docker Hub adapter', () => {
  it('reports no official image and no similar repos as no conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ match: '/search/repositories/', status: 200, body: { results: [] } }]),
    )
    const result = await dockerHubAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports an official library image as an exact conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/search/repositories/', status: 200, body: { results: [] } },
        { match: '/repositories/library/envryn/', status: 200, body: { name: 'envryn', namespace: 'library', description: 'A thing' } },
      ]),
    )
    const result = await dockerHubAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.categories).toContain('official')
  })

  it('treats a same-named repo under an individual account as similar, not exact', async () => {
    // No official image exists, but someone's personal account has a
    // same-named repo — real evidence, but not a namespace collision the way
    // an npm package or an official image would be.
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/search/repositories/',
          status: 200,
          body: { results: [{ repo_name: 'someuser/envryn', is_official: false, short_description: 'x' }] },
        },
      ]),
    )
    const result = await dockerHubAdapter.run(ctx, deps())
    expect(result.status).toBe('similar_found')
    expect(result.exactMatches).toHaveLength(0)
    expect(result.similarMatches[0]?.name).toBe('someuser/envryn')
  })
})

/* -------------------------------------------------------------------------- */

describe('Homebrew adapter', () => {
  it('reports an unpublished formula as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    const result = await homebrewAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('states plainly that Homebrew has no search API', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    const result = await homebrewAdapter.run(ctx, deps())
    expect(result.evidence.some((e) => e.label.includes('no public search API'))).toBe(true)
  })

  it('finds a taken exact formula name', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/formula/envryn.json', status: 200, body: { name: 'envryn', desc: 'Secrets manager' } },
      ]),
    )
    const result = await homebrewAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.description).toBe('Secrets manager')
  })

  it('reports no conflict rather than unable_to_verify when the 404 body is GitHub Pages HTML', async () => {
    // Regression: observed live that formulae.brew.sh — hosted on GitHub
    // Pages — returns GitHub's generic HTML "page not found" document for a
    // missing formula, not JSON. Same failure mode as the RubyGems case: a
    // naive JSON.parse on every response turned every free formula name into
    // a false "could not be reached" for the exact check, and every one of
    // the eight variant probes too.
    vi.stubGlobal(
      'fetch',
      mockFetch(
        [],
        { status: 404, raw: '<!DOCTYPE html><html><head><title>Page not found · GitHub Pages</title></head></html>' },
      ),
    )
    const result = await homebrewAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })
})
