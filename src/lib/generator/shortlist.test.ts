import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./namegen', () => ({ generateNames: vi.fn() }))
vi.mock('@/lib/sources/domain', () => ({ checkCandidateDomain: vi.fn() }))
vi.mock('@/lib/orchestrator/run', () => ({ runScanToCompletion: vi.fn() }))
import { generateNames } from './namegen'
import { checkCandidateDomain } from '@/lib/sources/domain'
import { runScanToCompletion } from '@/lib/orchestrator/run'
import { generateShortlist } from './shortlist'
const names = ['Cedar Table', 'Willow Pantry', 'Sunday Crumb', 'Copper Apron', 'Orchard Oven']
const clean = () => ({ results: [{ source: 'github', status: 'no_conflict', confidence: 95, exactMatches: [], similarMatches: [], evidence: [], checkedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), fromCache: false }], viability: { score: 85, rawScore: 85, caps: [], groups: [], conflicts: [], scoringVersion: 1 }, coverage: 80 })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(generateNames).mockResolvedValue({ status: 'ready', names })
  vi.mocked(checkCandidateDomain).mockImplementation(async (name) => ({ domain: name.replaceAll(' ', '').toLowerCase() + '.com', state: 'no_registration', note: 'No registration found' }))
  vi.mocked(runScanToCompletion).mockImplementation(async () => clean() as Awaited<ReturnType<typeof runScanToCompletion>>)
})
it('returns exactly four screened names and stops spending on extras', async () => {
  const result = await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })
  expect(result.status).toBe('ready')
  if (result.status === 'ready') expect(result.ranked.candidates).toHaveLength(4)
  expect(runScanToCompletion).toHaveBeenCalledTimes(4)
})
it('refills with new directions when a whole pool has occupied domains', async () => {
  vi.mocked(generateNames).mockResolvedValueOnce({ status: 'ready', names: ['Taken Name'] })
  vi.mocked(checkCandidateDomain).mockResolvedValueOnce({ domain: 'takenname.com', state: 'registered', note: 'Registered' })
  const result = await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })
  expect(result.status).toBe('ready')
  expect(generateNames).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(String), undefined, expect.objectContaining({ exclude: expect.arrayContaining(['Taken Name']) }))
  expect(runScanToCompletion).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Taken Name' }), expect.anything())
})
it('never fills a shortlist with unknown domains or low evidence', async () => {
  vi.mocked(checkCandidateDomain).mockResolvedValueOnce({ domain: 'cedartable.com', state: 'unknown', note: 'Timeout' })
  vi.mocked(runScanToCompletion).mockImplementation(async () => ({ ...clean(), coverage: 15 }) as Awaited<ReturnType<typeof runScanToCompletion>>)
  const result = await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })
  expect(result.status).toBe('incomplete')
})
it('does not count duplicates from a refill as additional names', async () => {
  vi.mocked(generateNames).mockResolvedValue({ status: 'ready', names: ['Cedar Table', 'cedar table'] })
  expect((await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })).status).toBe('incomplete')
  expect(runScanToCompletion).toHaveBeenCalledTimes(1)
})
it('does no provider work after cancellation', async () => {
  await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery', signal: AbortSignal.abort() })
  expect(generateNames).not.toHaveBeenCalled()
})

it('rejects a domain that becomes registered during the full scan', async () => {
  vi.mocked(runScanToCompletion).mockImplementation(async () => ({ ...clean(), results: [{ ...clean().results[0], source: 'domain', meta: { canonicalComState: 'registered' } }] }) as Awaited<ReturnType<typeof runScanToCompletion>>)
  expect((await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })).status).toBe('incomplete')
})

it('recovers from a transient model failure without losing the run', async () => {
  vi.mocked(generateNames).mockResolvedValueOnce({ status: 'unavailable', reason: 'Busy', retryable: true, retryAfterMs: 1 })
  const progress = vi.fn()
  const result = await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery', onProgress: progress })
  expect(result.status).toBe('ready')
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Retrying automatically') }))
})
it('cancels the automatic retry when the user leaves', async () => {
  const abort = new AbortController()
  vi.mocked(generateNames).mockResolvedValueOnce({ status: 'unavailable', reason: 'Busy', retryable: true, retryAfterMs: 61000 })
  await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery', signal: abort.signal, onProgress: () => abort.abort() })
  expect(generateNames).toHaveBeenCalledTimes(1)
})

it('can retry a provider cooldown on the last round and keep verified names', async () => {
  vi.mocked(generateNames)
    .mockResolvedValueOnce({ status: 'ready', names: ['Cedar Table'] })
    .mockResolvedValueOnce({ status: 'ready', names: ['Copper Apron'] })
    .mockResolvedValueOnce({ status: 'ready', names: ['Bramble Oven'] })
    .mockResolvedValueOnce({ status: 'unavailable', reason: 'Busy', retryable: true, retryAfterMs: 1 })
    .mockResolvedValueOnce({ status: 'ready', names: ['Willow Basket'] })
  const result = await generateShortlist({ category: 'restaurant', description: 'A seasonal bakery' })
  expect(result.status).toBe('ready')
  expect(runScanToCompletion).toHaveBeenCalledTimes(4)
})
