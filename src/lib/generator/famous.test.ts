import { describe, expect, it } from 'vitest'
import { famousCollision, isFamous, FAMOUS_NAME_COUNT } from './famous'

describe('famousCollision', () => {
  it('flags an exact famous name regardless of casing and spacing', () => {
    for (const name of ['Tekken', 'tekken', ' TEKKEN ', 'Tek-ken']) {
      const hit = famousCollision(name)
      expect(hit, name).toBeDefined()
      expect(hit?.name).toBe('Tekken')
      expect(hit?.kind).toBe('exact')
    }
  })

  it('flags a famous name with a short suffix bolted on as a squat', () => {
    for (const name of ['Tekkenly', 'Googlely', 'Microsofty', 'Amazonhq']) {
      const hit = famousCollision(name)
      expect(hit, name).toBeDefined()
      expect(hit?.kind).toBe('contains')
    }
  })

  it('flags a near respelling that sounds the same', () => {
    const hit = famousCollision('Fortnyte')
    expect(hit).toBeDefined()
    expect(hit?.name).toBe('Fortnite')
    expect(hit?.kind).toBe('near')
  })

  it('flags a single-edit typo of a longer famous name', () => {
    const hit = famousCollision('Microsof')
    expect(hit).toBeDefined()
    expect(hit?.name).toBe('Microsoft')
  })

  it('flags a multi-word famous franchise led by the candidate', () => {
    const hit = famousCollision('Mortal Kombat')
    expect(hit).toBeDefined()
  })

  it('does not flag a genuinely original coined name', () => {
    for (const name of ['Zolvex', 'Marketrove', 'Cloudari', 'Nordvel', 'Lumira', 'Applause']) {
      expect(famousCollision(name), name).toBeUndefined()
    }
  })

  it('does not flag very short fragments', () => {
    expect(famousCollision('ab')).toBeUndefined()
  })

  it('isFamous is a convenience over famousCollision', () => {
    expect(isFamous('Spotify')).toBe(true)
    expect(isFamous('Zolvex')).toBe(false)
  })

  it('has a non-trivial curated list', () => {
    expect(FAMOUS_NAME_COUNT).toBeGreaterThan(100)
  })

  it('tolerates unusual input without throwing', () => {
    for (const weird of ['', '   ', '名前', 'Éclaîr']) {
      expect(() => famousCollision(weird)).not.toThrow()
    }
  })
})
