import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/sources/http', async (original) => ({ ...await original<typeof import('@/lib/sources/http')>(), request: vi.fn(), requestJson: vi.fn() }))
import { request, requestJson } from '@/lib/sources/http'
import { checkCandidateDomain, resetBootstrapCache } from './index'
beforeEach(() => {
  vi.resetAllMocks()
  resetBootstrapCache()
  vi.mocked(requestJson).mockResolvedValue({ data: { services: [[['com'], ['https://rdap.example']]] } } as Awaited<ReturnType<typeof requestJson>>)
})
it('requires an explicit RDAP 404 for an unregistered domain', async () => {
  vi.mocked(request).mockResolvedValue({ status: 404, ok: false, text: '', headers: new Headers() })
  expect((await checkCandidateDomain('Cedar Table', new AbortController().signal)).state).toBe('no_registration')
})
it('does not mistake a registry error for an unregistered name', async () => {
  vi.mocked(request).mockRejectedValue(new Error('rate limit'))
  expect((await checkCandidateDomain('Cedar Table', new AbortController().signal)).state).toBe('unknown')
})
it('rejects an existing registration', async () => {
  vi.mocked(request).mockResolvedValue({ status: 200, ok: true, text: '{}', headers: new Headers() })
  expect((await checkCandidateDomain('Cedar Table', new AbortController().signal)).state).toBe('registered')
})
