import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { PlatformVerdictSchema } from '@/lib/core/types'
import { aurAdapter } from '@/lib/sources/aur'
import { huggingFaceAdapter } from '@/lib/sources/huggingface'
import { modrinthAdapter } from '@/lib/sources/modrinth'
import { robloxAdapter } from '@/lib/sources/roblox'

const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })
const ctx = (category: ScanContext['category']): ScanContext => ({ name: 'Envryn', category, scanType: 'quick' })

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('AUR', () => {
  it('finds an exact developer package', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {
      resultcount: 1,
      results: [{ ID: 71, Name: 'envryn', Description: 'A developer package' }],
    })))

    const result = await aurAdapter.run(ctx('developer_tool'), deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.url).toBe('https://aur.archlinux.org/packages/envryn/')
  })

  it('reports a completed empty AUR response as no conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { resultcount: 0, results: [] })))
    expect((await aurAdapter.run(ctx('developer_tool'), deps())).status).toBe('no_conflict')
  })

  it('does not call AUR outside developer-tool research', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await aurAdapter.run(ctx('game'), deps())
    expect(result.error?.code).toBe('NOT_APPLICABLE')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not treat malformed JSON as an empty package list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { resultcount: 'zero', results: [] })))
    const result = await aurAdapter.run(ctx('developer_tool'), deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('MALFORMED_RESPONSE')
  })
})

describe('Roblox', () => {
  it('finds an exact Roblox username through the documented POST lookup', async () => {
    const fetch = vi.fn(async () => json(200, { data: [{ id: 1, name: 'Envryn', displayName: 'Envryn' }] }))
    vi.stubGlobal('fetch', fetch)

    const result = await robloxAdapter.run(ctx('game'), deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.url).toBe('https://www.roblox.com/users/1/profile')
    expect(fetch).toHaveBeenCalledWith(
      'https://users.roblox.com/v1/usernames/users',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('envryn') }),
    )
  })

  it('reports an empty username response as no conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { data: [] })))
    expect((await robloxAdapter.run(ctx('creator_brand'), deps())).status).toBe('no_conflict')
  })

  it('keeps a rate-limited username lookup unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(429, {})))
    const result = await robloxAdapter.run(ctx('game'), deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('RATE_LIMITED')
  })
})

describe('Modrinth discovery', () => {
  it('shows matching projects as manual discovery, not a verified conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {
      hits: [{ project_id: 'abc', title: 'Envryn', slug: 'envryn', description: 'A game mod', project_type: 'mod' }],
    })))

    const result = await modrinthAdapter.run(ctx('game'), deps())
    const platform = PlatformVerdictSchema.parse((result.meta?.platforms as unknown[])[0])
    expect(result.status).toBe('manual_check_recommended')
    expect(platform.discoveryChecked).toBe(true)
    expect(platform.discovery?.[0]?.url).toBe('https://modrinth.com/mod/envryn')
  })

  it('does not turn no search hit into clear', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { hits: [] })))
    expect((await modrinthAdapter.run(ctx('game'), deps())).status).toBe('manual_check_recommended')
  })

  it('keeps an upstream error unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, {})))
    const result = await modrinthAdapter.run(ctx('game'), deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.error?.code).toBe('UPSTREAM_ERROR')
  })
})

describe('Hugging Face discovery', () => {
  it('shows public matching models as manual discovery, not availability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [{ id: 'envryn/Envryn', author: 'envryn' }])))

    const result = await huggingFaceAdapter.run(ctx('saas'), deps())
    const platform = PlatformVerdictSchema.parse((result.meta?.platforms as unknown[])[0])
    expect(result.status).toBe('manual_check_recommended')
    expect(platform.discoveryChecked).toBe(true)
    expect(platform.discovery?.[0]?.url).toBe('https://huggingface.co/envryn/Envryn')
  })

  it('does not call Hugging Face for unrelated categories', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await huggingFaceAdapter.run(ctx('restaurant'), deps())
    expect(result.error?.code).toBe('NOT_APPLICABLE')
    expect(fetch).not.toHaveBeenCalled()
  })
})
