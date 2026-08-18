import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterDeps } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import { resetEnvCache } from '@/lib/env'
import { flathubAdapter, resetFlathubCorpus } from '@/lib/sources/flathub'

const ctx: ScanContext = { name: 'Envryn', category: 'saas', scanType: 'quick' }
const deps = (): AdapterDeps => ({ signal: new AbortController().signal, log: () => {} })

function mockAppstream(ids: string[]) {
  return vi.fn(async () => new Response(JSON.stringify(ids), { status: 200, headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  resetEnvCache()
  resetFlathubCorpus()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetEnvCache()
  resetFlathubCorpus()
})

describe('Flathub adapter', () => {
  it('reports an unused name as no conflict', async () => {
    vi.stubGlobal('fetch', mockAppstream(['org.gimp.GIMP', 'com.spotify.Client']))
    const result = await flathubAdapter.run(ctx, deps())
    expect(result.status).toBe('no_conflict')
  })

  it('finds an exact app, inferring the name from the id’s final segment', async () => {
    vi.stubGlobal('fetch', mockAppstream(['org.gimp.GIMP', 'io.github.envryn.Envryn', 'com.spotify.Client']))
    const result = await flathubAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
    expect(result.exactMatches[0]?.name).toBe('Envryn')
    expect(result.exactMatches[0]?.externalId).toBe('io.github.envryn.Envryn')
    expect(result.exactMatches[0]?.url).toContain('io.github.envryn.Envryn')
  })

  it('does not match unrelated apps just because they share a prefix', async () => {
    vi.stubGlobal('fetch', mockAppstream(['org.gimp.GIMP', 'com.spotify.Client']))
    const result = await flathubAdapter.run(ctx, deps())
    const names = [...result.exactMatches, ...result.similarMatches].map((m) => m.name)
    expect(names).not.toContain('GIMP')
    expect(names).not.toContain('Client')
  })

  it('states plainly that the name is inferred, not published', async () => {
    vi.stubGlobal('fetch', mockAppstream([]))
    const result = await flathubAdapter.run(ctx, deps())
    expect(result.evidence.some((e) => e.label.includes('inferred from the id'))).toBe(true)
  })

  it('degrades to unable_to_verify when the app list cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await flathubAdapter.run(ctx, deps())
    expect(result.status).toBe('unable_to_verify')
    expect(result.confidence).toBe(0)
  })

  it('is case-insensitive on the inferred name', async () => {
    vi.stubGlobal('fetch', mockAppstream(['com.example.envryn']))
    const result = await flathubAdapter.run(ctx, deps())
    expect(result.status).toBe('confirmed_conflict')
  })
})
