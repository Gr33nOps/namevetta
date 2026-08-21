import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { SourceResultSchema } from '@/lib/core/types'
import { blueskyAdapter } from '@/lib/sources/bluesky'

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'quick' }
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
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe('bluesky adapter', () => {
  it('reports an unclaimed handle as no conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'resolveHandle',
          status: 400,
          body: { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        },
        { match: 'searchActors', status: 200, body: { actors: [] } },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('reports a claimed handle as a confirmed conflict', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: 'resolveHandle', status: 200, body: { did: 'did:plc:abc123' } },
        { match: 'getProfile', status: 200, body: { displayName: 'Envryn Co' } },
        { match: 'searchActors', status: 200, body: { actors: [] } },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('Envryn Co')
    expect(result.exactMatches[0]?.url).toBe('https://bsky.app/profile/envryn.bsky.social')
  })

  it('surfaces similar handles above the relevance threshold', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'resolveHandle',
          status: 400,
          body: { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        },
        {
          match: 'searchActors',
          status: 200,
          body: {
            actors: [
              { did: 'did:plc:1', handle: 'envrin.bsky.social', displayName: 'Envrin' },
              { did: 'did:plc:2', handle: 'totally-unrelated.bsky.social' },
            ],
          },
        },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('similar_found')
    expect(result.similarMatches.map((m) => m.externalId)).toContain('did:plc:1')
    expect(result.similarMatches.map((m) => m.externalId)).not.toContain('did:plc:2')
  })

  it('degrades to unable_to_verify when the handle lookup is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
    expect(result.error?.retryable).toBe(true)
  })

  it('keeps the exact answer when only the similarity search fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: 'resolveHandle', status: 200, body: { did: 'did:plc:abc123' } },
        { match: 'getProfile', status: 200, body: {} },
        { match: 'searchActors', status: 500, body: {} },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
  })

  /* ── regression: the production INVALID_ADAPTER_OUTPUT ─────────────── */

  /*
    `lumenly.bsky.social` is a real account with `displayName: ""`, and
    `lumenly` was the most-scanned name in production. `displayName ?? handle`
    keeps the empty string — `??` only catches null and undefined — and
    `Match.name` requires at least one character, so the orchestrator threw the
    whole result away as malformed. Twenty-nine of Bluesky's hundred results
    were this.
  */
  it('survives a claimed handle whose display name is an empty string', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: 'resolveHandle', status: 200, body: { did: 'did:plc:lumenly' } },
        { match: 'getProfile', status: 200, body: { displayName: '', description: '' } },
        { match: 'searchActors', status: 200, body: { actors: [] } },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())

    // The invariant that was being violated: this must pass the boundary.
    expect(SourceResultSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe('confirmed_conflict')
    // Falls back to the handle, which is what such an account is known by.
    expect(result.exactMatches[0]?.name).toBe('envryn.bsky.social')
  })

  it('survives a similar handle whose display name is an empty string', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        {
          match: 'resolveHandle',
          status: 400,
          body: { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        },
        {
          match: 'searchActors',
          status: 200,
          body: {
            actors: [
              { did: 'did:plc:1', handle: 'envrin.bsky.social', displayName: '' },
              { did: 'did:plc:2', handle: 'envryn.bsky.social', displayName: '   ' },
            ],
          },
        },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(SourceResultSchema.safeParse(result).success).toBe(true)
    // Whatever survives the relevance floor, none of it may carry a blank name.
    for (const match of [...result.exactMatches, ...result.similarMatches]) {
      expect(match.name.trim()).not.toBe('')
    }
  })

  it('never reports an unrecognised 400 as clear', async () => {
    // The old code pushed an evidence line and fell through to `no_conflict`,
    // reporting a handle it knew nothing about as free.
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { match: 'resolveHandle', status: 400, body: { error: 'RateLimitExceeded' } },
        { match: 'searchActors', status: 200, body: { actors: [] } },
      ]),
    )
    const result = await blueskyAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })
})
