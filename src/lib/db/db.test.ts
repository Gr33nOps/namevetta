import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * These cover the parts of the data layer that are pure logic. The SQL —
 * policies, atomic quota consumption, the share-token function — is verified
 * against a real database once a project exists, because RLS cannot be
 * meaningfully unit-tested in isolation.
 */

const SALT = 'test-salt-value-at-least-16-chars'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
  vi.stubEnv('GUEST_HASH_SALT', SALT)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function identity() {
  const { resetDbEnvCache } = await import('./client')
  resetDbEnvCache()
  return import('./identity')
}

describe('clientIp', () => {
  it('takes the leftmost x-forwarded-for entry', async () => {
    const { clientIp } = await identity()
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' })
    expect(clientIp(headers)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', async () => {
    const { clientIp } = await identity()
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('returns undefined when no address is present', async () => {
    const { clientIp } = await identity()
    expect(clientIp(new Headers())).toBeUndefined()
    expect(clientIp(new Headers({ 'x-forwarded-for': '   ' }))).toBeUndefined()
  })
})

describe('guestHash', () => {
  it('is stable for the same address', async () => {
    const { guestHash } = await identity()
    expect(guestHash('203.0.113.5')).toBe(guestHash('203.0.113.5'))
  })

  it('differs between addresses', async () => {
    const { guestHash } = await identity()
    expect(guestHash('203.0.113.5')).not.toBe(guestHash('203.0.113.6'))
  })

  it('never contains the address it was derived from', async () => {
    // The whole point: quotas and history for guests, without storing anything
    // that identifies them.
    const { guestHash } = await identity()
    const hash = guestHash('203.0.113.5')
    expect(hash).not.toContain('203')
    expect(hash).not.toContain('113')
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('depends on the salt, so the hash is not a bare digest of the IP', async () => {
    // An unsalted hash of an IPv4 address is trivially reversible — the whole
    // space is only ~4 billion values.
    const { guestHash } = await identity()
    const withFirstSalt = guestHash('203.0.113.5')

    vi.stubEnv('GUEST_HASH_SALT', 'a-completely-different-salt-value')
    vi.resetModules()
    const { resetDbEnvCache } = await import('./client')
    resetDbEnvCache()
    const { guestHash: rehashed } = await import('./identity')

    expect(rehashed('203.0.113.5')).not.toBe(withFirstSalt)
  })
})

describe('identifySubject', () => {
  it('prefers an authenticated user over the IP', async () => {
    const { identifySubject } = await identity()
    const subject = identifySubject(
      new Headers({ 'x-forwarded-for': '203.0.113.5' }),
      'user-uuid',
    )
    expect(subject).toEqual({ type: 'user', id: 'user-uuid' })
  })

  it('falls back to a hashed guest identity', async () => {
    const { identifySubject } = await identity()
    const subject = identifySubject(new Headers({ 'x-forwarded-for': '203.0.113.5' }), undefined)
    expect(subject?.type).toBe('guest')
    expect(subject?.id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('returns undefined when the requester cannot be identified at all', async () => {
    // No session and no address means no way to enforce a quota. The caller
    // refuses rather than granting an unlimited one.
    const { identifySubject } = await identity()
    expect(identifySubject(new Headers(), undefined)).toBeUndefined()
  })
})

describe('limitsFor', () => {
  it('gives accounts a larger daily allowance than guests', async () => {
    const { resetDbEnvCache } = await import('./client')
    resetDbEnvCache()
    const { limitsFor } = await import('./quota')

    const guest = limitsFor({ type: 'guest', id: 'g' })
    const user = limitsFor({ type: 'user', id: 'u' })

    expect(user.quick).toBeGreaterThan(guest.quick)
    expect(user.deep).toBeGreaterThan(guest.deep)
  })

  it('reads limits from the environment so they can change without a redeploy', async () => {
    // §33: the Brave budget makes retuning these necessary, and it must not
    // require shipping new logic.
    vi.stubEnv('GUEST_QUICK_LIMIT', '3')
    vi.resetModules()
    const { resetEnvCache } = await import('@/lib/env')
    resetEnvCache()
    const { limitsFor } = await import('./quota')

    expect(limitsFor({ type: 'guest', id: 'g' }).quick).toBe(3)
  })
})

describe('database configuration', () => {
  it('reports configured when every value is present', async () => {
    const { isDatabaseConfigured, resetDbEnvCache } = await import('./client')
    resetDbEnvCache()
    expect(isDatabaseConfigured()).toBe(true)
  })

  it('reports unconfigured rather than throwing when values are missing', async () => {
    // The app has to run without a database; persistence degrades, research
    // does not.
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.resetModules()
    const { isDatabaseConfigured, resetDbEnvCache } = await import('./client')
    resetDbEnvCache()
    expect(isDatabaseConfigured()).toBe(false)
  })

  it('rejects a salt too short to be worth having', async () => {
    vi.stubEnv('GUEST_HASH_SALT', 'short')
    vi.resetModules()
    const { isDatabaseConfigured, resetDbEnvCache } = await import('./client')
    resetDbEnvCache()
    expect(isDatabaseConfigured()).toBe(false)
  })
})
