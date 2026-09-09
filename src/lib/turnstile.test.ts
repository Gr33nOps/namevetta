import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '@/lib/env'
import { verifyTurnstile } from './turnstile'

function mockFetch(handler: (body: URLSearchParams) => { status: number; body: unknown }) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = new URLSearchParams((init?.body as string | undefined) ?? '')
    const chosen = handler(body)
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

describe('verifyTurnstile', () => {
  it('passes with no check at all when no secret is configured', async () => {
    // The core promise: an unconfigured deployment behaves exactly as it did
    // before Turnstile existed, even with no token supplied.
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('should never be called')
    }))
    await expect(verifyTurnstile(undefined, '1.2.3.4')).resolves.toBe(true)
  })

  it('rejects a missing token when a secret is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    await expect(verifyTurnstile(undefined, '1.2.3.4')).resolves.toBe(false)
    await expect(verifyTurnstile('', '1.2.3.4')).resolves.toBe(false)
  })

  it('accepts a token Cloudflare confirms as successful', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch(() => ({ status: 200, body: { success: true } })))
    await expect(verifyTurnstile('real-token', '1.2.3.4')).resolves.toBe(true)
  })

  it('rejects a token Cloudflare reports as failed', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ status: 200, body: { success: false, 'error-codes': ['invalid-input-response'] } })),
    )
    await expect(verifyTurnstile('bad-token', '1.2.3.4')).resolves.toBe(false)
  })

  it('sends the secret, response and remote IP to Cloudflare', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    let seen: URLSearchParams | undefined
    vi.stubGlobal(
      'fetch',
      mockFetch((body) => {
        seen = body
        return { status: 200, body: { success: true } }
      }),
    )
    await verifyTurnstile('real-token', '9.9.9.9')
    expect(seen?.get('secret')).toBe('test-secret')
    expect(seen?.get('response')).toBe('real-token')
    expect(seen?.get('remoteip')).toBe('9.9.9.9')
  })

  it('fails closed when Cloudflare cannot be reached after Turnstile is enabled', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    await expect(verifyTurnstile('real-token', '1.2.3.4')).resolves.toBe(false)
  })

  it('rejects rather than throwing on a non-OK HTTP response', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    resetEnvCache()
    vi.stubGlobal('fetch', mockFetch(() => ({ status: 500, body: {} })))
    await expect(verifyTurnstile('real-token', '1.2.3.4')).resolves.toBe(false)
  })
})
