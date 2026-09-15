import { describe, expect, it } from 'vitest'
import { dedupeFamilies, sameFamily } from './dedupe'

describe('sameFamily', () => {
  it('treats a doubled-letter respelling as the same idea', () => {
    expect(sameFamily('Nexora', 'Nexorra')).toBe(true)
  })

  it('treats a shared root plus descriptor as the same idea', () => {
    expect(sameFamily('Nexora', 'Nexora Labs')).toBe(true)
  })

  it('treats a vowel swap on the same skeleton as the same idea', () => {
    expect(sameFamily('Nexora', 'Nexira')).toBe(true)
  })

  it('keeps genuinely different names apart', () => {
    expect(sameFamily('Nexora', 'Cloudari')).toBe(false)
    expect(sameFamily('Vanta', 'Lumira')).toBe(false)
  })
})

describe('dedupeFamilies', () => {
  it('keeps a family together when a respelling connects the root and its descriptor', () => {
    expect(dedupeFamilies(['Merro', 'Merrow', 'Merrow Works'])).toEqual(['Merro'])
  })
  it('collapses a family to its first (best-ranked) member', () => {
    const out = dedupeFamilies(['Nexora', 'Nexorra', 'Nexora AI', 'Nexora Labs', 'Nexoro'])
    expect(out).toEqual(['Nexora'])
  })

  it('keeps distinct ideas and preserves order', () => {
    const out = dedupeFamilies(['Cloudari', 'Nexora', 'Nexorra', 'Marketrove', 'Cloudari '])
    expect(out).toEqual(['Cloudari', 'Nexora', 'Marketrove'])
  })

  it('returns an empty list unchanged', () => {
    expect(dedupeFamilies([])).toEqual([])
  })

  it('never returns two members of the same family', () => {
    const out = dedupeFamilies(['Zephyra', 'Zephira', 'Zephyras', 'Zephyra Hub'])
    expect(out).toEqual(['Zephyra'])
  })
})
