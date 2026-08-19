import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { domainAdapter, resetBootstrapCache } from '@/lib/sources/domain'
import { githubAdapter } from '@/lib/sources/github'
import { npmAdapter } from '@/lib/sources/npm'
import { pypiAdapter } from '@/lib/sources/pypi'
import { severityFor } from '@/lib/sources/severity'
import { youtubeAdapter } from '@/lib/sources/youtube'

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'quick' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

/** Route mocked responses by URL substring. */
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

const BOOTSTRAP = {
  match: 'data.iana.org/rdap/dns.json',
  status: 200,
  body: {
    services: [
      [['com', 'io', 'app', 'dev', 'co'], ['https://rdap.example/']],
      // Note: no `.ai` — matching reality, and the case this adapter must
      // handle honestly rather than by guessing.
    ],
  },
}

beforeEach(() => {
  resetEnvCache()
  resetBootstrapCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
  resetBootstrapCache()
})

/* -------------------------------------------------------------------------- */

describe('npm adapter', () => {
  it('reports an unpublished name as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/-/v1/search', status: 200, body: { objects: [] } }]))
    const result = await npmAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('reports a published exact name as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/-/v1/search', status: 200, body: { objects: [] } },
        { match: 'registry.npmjs.org/envryn', status: 200, body: { name: 'envryn', description: 'A thing' } },
      ]),
    )
    const result = await npmAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('envryn')
  })

  it('surfaces similar packages above the relevance threshold', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/-/v1/search',
          status: 200,
          body: {
            objects: [
              { package: { name: 'envrin', description: 'close' } },
              { package: { name: 'totally-unrelated-thing', description: 'far' } },
            ],
          },
        },
      ]),
    )
    const result = await npmAdapter.run(ctx, deps())
    expect(result.status).toBe('similar_found')
    expect(result.similarMatches.map((m) => m.name)).toContain('envrin')
    expect(result.similarMatches.map((m) => m.name)).not.toContain('totally-unrelated-thing')
  })

  it('degrades to unable_to_verify when the registry is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await npmAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
    expect(result.error?.retryable).toBe(true)
  })

  it('keeps the exact answer when only the similarity search fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([{ match: '/-/v1/search', status: 500, body: {} }]),
    )
    const result = await npmAdapter.run(ctx, deps())
    // The name is genuinely unpublished; a failed extra query must not discard
    // that answer.
    expect(result.status).toBe('no_conflict')
  })
})

/* -------------------------------------------------------------------------- */

describe('pypi adapter', () => {
  it('reports an unused project name as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    const result = await pypiAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('states plainly that PyPI has no search API', async () => {
    // A clean PyPI result must not read as exhaustive, because it is not.
    vi.stubGlobal('fetch', mockFetch([]))
    const result = await pypiAdapter.run(ctx, deps())
    expect(result.evidence.some((e) => e.label.includes('no public search API'))).toBe(true)
  })

  it('finds a taken exact project name', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'pypi.org/pypi/envryn/json',
          status: 200,
          body: { info: { name: 'envryn', summary: 'Secrets manager' } },
        },
      ]),
    )
    const result = await pypiAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.description).toBe('Secrets manager')
  })
})

/* -------------------------------------------------------------------------- */

describe('github adapter', () => {
  it('reports a free namespace as no conflict', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/search/repositories', status: 200, body: { items: [] } }]))
    const result = await githubAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports a taken account as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: '/search/repositories', status: 200, body: { items: [] } },
        {
          match: '/users/envryn',
          status: 200,
          body: { login: 'envryn', type: 'Organization', html_url: 'https://github.com/envryn' },
        },
      ]),
    )
    const result = await githubAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.url).toBe('https://github.com/envryn')
  })

  it('explains a rate limit rather than reporting the name as free', async () => {
    vi.stubGlobal('fetch', mockFetch([{ match: '/users/', status: 403, body: {} }]))
    const result = await githubAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.message).toContain('rate limit')
  })
})

/* -------------------------------------------------------------------------- */

describe('youtube adapter', () => {
  it('says so when no API key is configured instead of assuming the handle is free', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '')
    resetEnvCache()
    const result = await youtubeAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('NO_API_KEY')
    expect(result.confidence).toBe(0)
  })

  it('reports a free handle as no conflict when a key is present', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch([{ match: '/channels', status: 200, body: { items: [] } }]))
    const result = await youtubeAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('reports a taken handle as a confirmed conflict', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key')
    resetEnvCache()
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: '/channels',
          status: 200,
          body: { items: [{ id: 'UC123', snippet: { title: 'Envryn' } }] },
        },
      ]),
    )
    const result = await youtubeAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
  })
})

/* -------------------------------------------------------------------------- */

describe('domain adapter', () => {
  it('never claims a domain is available, only that no registration was found', async () => {
    vi.stubGlobal('fetch', mockFetch([BOOTSTRAP]))
    const result = await domainAdapter.run(ctx, deps())

    expect(result.status).toBe('no_conflict')
    const text = result.evidence.map((e) => e.label).join(' ')
    expect(text).toContain('no registration found')
    expect(text).toContain('Confirm with a registrar')
    expect(text.toLowerCase()).not.toContain('definitely available')
  })

  it('reports a registered domain', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        BOOTSTRAP,
        { match: 'rdap.example/domain/envryn.com', status: 200, body: { ldhName: 'envryn.com' } },
      ]),
    )
    const result = await domainAdapter.run(ctx, deps())
    expect(result.status).toBe('similar_found')
    expect(result.evidence.some((e) => e.label.includes('registration record exists'))).toBe(true)
  })

  it('falls back to DNS for a TLD with no RDAP service and stays honest about it', async () => {
    // `.ai` has no RDAP. No NS records is not proof the name is free, so this
    // must report the registration status as unverified rather than clear.
    vi.stubGlobal(
      'fetch',
      mockFetch([BOOTSTRAP, { match: 'cloudflare-dns.com', status: 200, body: { Status: 0 } }]),
    )
    const result = await domainAdapter.run(ctx, deps())
    const aiNote = result.evidence.find((e) => e.label.startsWith('envryn.ai'))
    expect(aiNote?.label).toContain('could not be verified')
  })

  it('treats a delegated name under a non-RDAP TLD as registered', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        BOOTSTRAP,
        { match: 'cloudflare-dns.com', status: 200, body: { Status: 0, Answer: [{ data: 'ns1.example.' }] } },
      ]),
    )
    const result = await domainAdapter.run(ctx, deps())
    const aiNote = result.evidence.find((e) => e.label.startsWith('envryn.ai'))
    expect(aiNote?.label).toContain('is registered')
  })

  it('degrades to unable_to_verify when the IANA registry cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await domainAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })

  it('flags a registered lookalike .com on Deep Check without changing status', async () => {
    const deepCtx: ScanContext = { name: 'Monzo', category: 'finance', scanType: 'deep' }
    vi.stubGlobal(
      'fetch',
      mockFetch([
        BOOTSTRAP,
        // "rn" for "m" is the squat variant of "monzo" this exercises.
        { match: 'rdap.example/domain/rnonzo.com', status: 200, body: { ldhName: 'rnonzo.com' } },
      ]),
    )
    const result = await domainAdapter.run(deepCtx, deps())
    // The candidate's own domains are all unregistered in this fixture, so
    // status must still read clear — the squat flag is additional evidence,
    // never a conflict signal of its own.
    expect(result.status).toBe('no_conflict')
    expect(result.evidence.some((e) => e.label.includes('rnonzo.com') && e.label.includes('lookalike'))).toBe(
      true,
    )
  })

  it('does not run the squat check on a Quick Check', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        BOOTSTRAP,
        { match: 'rdap.example/domain/rnonzo.com', status: 200, body: { ldhName: 'rnonzo.com' } },
      ]),
    )
    const quickCtx: ScanContext = { name: 'Monzo', category: 'finance', scanType: 'quick' }
    const result = await domainAdapter.run(quickCtx, deps())
    expect(result.evidence.some((e) => e.label.includes('lookalike'))).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */

describe('severityFor', () => {
  const sim = (over: Partial<{ overall: number; phonetic: number; industry: number }> = {}) => ({
    text: over.overall ?? 50,
    phonetic: over.phonetic ?? 50,
    visual: over.overall ?? 50,
    overall: over.overall ?? 50,
    ...(over.industry === undefined ? {} : { industry: over.industry }),
  })

  it('reserves critical for a near-exact match in a related field on a legal source', () => {
    expect(severityFor(sim({ overall: 99, industry: 90 }), { legallyWeighted: true })).toBe('critical')
  })

  it('will not call a near-exact match critical in an unrelated field', () => {
    // §18: ENVRYN CLOTHING is not a critical conflict for a security product.
    expect(severityFor(sim({ overall: 99, industry: 5 }), { legallyWeighted: true })).toBe('high')
  })

  it('will not claim critical when industry is unknown', () => {
    expect(severityFor(sim({ overall: 99 }), { legallyWeighted: true })).toBe('high')
  })

  it('does not escalate non-legal sources to critical', () => {
    expect(severityFor(sim({ overall: 99, industry: 90 }))).toBe('high')
  })

  it('steps an inactive conflict down', () => {
    const active = severityFor(sim({ overall: 85 }), { active: true })
    const inactive = severityFor(sim({ overall: 85 }), { active: false })
    expect(active).toBe('high')
    expect(inactive).toBe('medium')
  })

  it('treats a strong phonetic match as significant even when spelling differs', () => {
    expect(severityFor(sim({ overall: 55, phonetic: 95 }))).toBe('high')
  })
})
