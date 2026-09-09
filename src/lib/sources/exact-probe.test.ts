import { afterEach, describe, expect, it, vi } from 'vitest'
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

const ctx = { name: 'quillstream', category: 'saas', scanType: 'quick' } as const
const deps = () => ({ signal: new AbortController().signal, log: () => {} })

const adapter = exactProbeAdapter({
  id: 'hex',
  label: 'Hex',
  probe: (n) => `https://hex.pm/api/packages/${n}`,
  page: (n) => `https://hex.pm/packages/${n}`,
  kind: 'elixir package',
})

function respond(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(status === 404 ? '' : '{}', { status })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exact probe', () => {
  it('reports a claimed name as a conflict, with somewhere to go and see', async () => {
    respond(200)
    const result = await adapter.run(ctx, deps())

    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches).toHaveLength(1)
    expect(result.exactMatches[0]?.url).toBe('https://hex.pm/packages/quillstream')
  })

  it('treats a redirect as claimed', async () => {
    // itch.io answers 302 for an account that exists but has no page yet,
    // pointing at the owner's profile. Reading that as free would be wrong.
    respond(302)
    const result = await adapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
  })

  it('reports a clean 404 as nothing found', async () => {
    respond(404)
    const result = await adapter.run(ctx, deps())

    expect(result.status).toBe('no_conflict')
    expect(result.exactMatches).toHaveLength(0)
  })

  it('never reads an unexpected answer as a free name', async () => {
    // The failure this whole module has to avoid: a registry that starts
    // answering 403, or 500, or a captcha page, must not quietly mark every
    // name as available.
    for (const status of [403, 429, 500, 503]) {
      respond(status)
      const result = await adapter.run(ctx, deps())
      expect(result.status, `status ${status} must not read as clear`).toBe('unable_to_verify')
      expect(result.error).toBeDefined()
    }
  })

  it('reports a network failure rather than inventing an answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up')
      }),
    )
    const result = await adapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.retryable).toBe(true)
  })

  it('refuses a name with nothing usable in it', async () => {
    respond(404)
    const result = await adapter.run({ ...ctx, name: '!!!' }, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('INVALID_NAME')
  })
})
