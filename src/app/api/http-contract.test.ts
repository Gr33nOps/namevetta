import { describe, expect, it } from 'vitest'
import { GET as generateGet } from './generate/route'
import { GET as scanGet } from './scan/route'
import { GET as retryGet } from './scan/retry/route'

describe('scan API HTTP contract', () => {
  it.each([
    ['scan', scanGet],
    ['retry', retryGet],
    ['generate', generateGet],
  ])('%s rejects GET without allowing it to be cached', async (_name, handler) => {
    const response = handler()
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST, OPTIONS')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
