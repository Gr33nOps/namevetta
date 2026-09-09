import { describe, expect, it } from 'vitest'
import { oldest, relativeTime } from './relativeTime'

describe('relativeTime', () => {
  it('reads recent timestamps as "just now"', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now')
  })

  it('reports minutes, hours and days in the expected units', () => {
    const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString()
    expect(relativeTime(minutesAgo(5))).toBe('5 minutes ago')
    expect(relativeTime(minutesAgo(90))).toBe('2 hours ago')
    expect(relativeTime(minutesAgo(60 * 30))).toBe('1 day ago')
  })

  it('falls back gracefully on an unparseable timestamp', () => {
    expect(relativeTime('not-a-date')).toBe('unknown time')
  })
})

describe('oldest', () => {
  it('picks the earliest of several timestamps', () => {
    const early = '2020-01-01T00:00:00.000Z'
    const late = '2024-01-01T00:00:00.000Z'
    expect(oldest([late, early])).toBe(early)
  })

  it('returns undefined for an empty list', () => {
    expect(oldest([])).toBeUndefined()
  })

  it('ignores unparseable entries rather than letting them win', () => {
    const real = '2022-06-01T00:00:00.000Z'
    expect(oldest(['garbage', real])).toBe(real)
  })
})
