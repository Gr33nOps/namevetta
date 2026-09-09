import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), service: vi.fn() }))
vi.mock('./auth', () => ({ sessionClient: mocks.session }))
vi.mock('./client', () => ({ isDatabaseConfigured: () => true, serviceClient: mocks.service }))
import { recentScans, storedScan, deleteScan, createShareLink } from './history'
import { canRetrySource } from './scans'
beforeEach(() => vi.resetAllMocks())
it('never treats a shared guest IP as permission to read or modify stored research', async () => {
  const guest = { type: 'guest' as const, id: 'shared-network-hash' }
  expect(await recentScans(guest)).toEqual([])
  expect(await storedScan(guest, 'scan')).toBeUndefined()
  expect(await deleteScan(guest, 'scan')).toBe(false)
  expect(await createShareLink(guest, 'scan', 'https://example.com')).toBeUndefined()
  expect(await canRetrySource(guest, 'scan')).toBe(false)
  expect(mocks.service).not.toHaveBeenCalled()
  expect(mocks.session).not.toHaveBeenCalled()
})
it('filters account history by its owner in addition to RLS', async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
  mocks.session.mockResolvedValue({ from: () => query })
  await recentScans({ type: 'user', id: 'owner-id' })
  expect(query.eq).toHaveBeenCalledWith('user_id', 'owner-id')
  expect(mocks.service).not.toHaveBeenCalled()
})
