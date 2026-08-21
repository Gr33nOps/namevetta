import { describe, expect, it } from 'vitest'
import { buildResult } from '@/lib/sources/result'
import { manualVerificationCount } from './rows'

describe('manualVerificationCount', () => {
  it('counts individual platforms rather than aggregate source rows', () => {
    const results = [
      buildResult({
        source: 'socials',
        status: 'manual_check_recommended',
        meta: {
          platforms: [
            { name: 'Instagram', status: 'manual_check_recommended', detail: 'Check directly' },
            { name: 'TikTok', status: 'manual_check_recommended', detail: 'Check directly' },
          ],
        },
      }),
      buildResult({ source: 'slack', status: 'manual_check_recommended' }),
    ]

    expect(manualVerificationCount(results)).toBe(3)
  })
})
