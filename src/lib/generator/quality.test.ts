import { describe, expect, it } from 'vitest'
import { assessBrandability } from './quality'

describe('assessBrandability', () => {
  it('keeps readable English compounds with consonants at word boundaries', () => {
    for (const name of ['Northstar', 'Hearthside', 'Bright Field', 'Workroom', 'Salt Marsh']) {
      expect(assessBrandability(name).rejected, name).toBe(false)
    }
  })

  it('does not mistake ordinary words for an AI suffix', () => {
    for (const name of ['Aisle', 'Airfield', 'Bonsai']) {
      expect(assessBrandability(name).flags, name).not.toContain('leans on "AI"')
    }
  })

  it('rejects stacked stock-tech names even when written in lowercase', () => {
    for (const name of ['novanexus', 'quantumhub', 'zenflow', 'nexora', 'zynex']) {
      expect(assessBrandability(name).rejected, name).toBe(true)
    }
  })
  it('rates a clean coined name highly and does not reject it', () => {
    for (const name of ['Cloudari', 'Marketrove', 'Zephyra', 'Lumira', 'Nordvel']) {
      const a = assessBrandability(name)
      expect(a.rejected, name).toBe(false)
      expect(a.score, name).toBeGreaterThanOrEqual(70)
    }
  })

  it('keeps every score inside 0..100', () => {
    for (const name of ['A', 'Cloudari', 'DataifyAIFlowSyncHub', 'Xzqjkw', 'Supercalifragilistic']) {
      const a = assessBrandability(name)
      expect(a.score).toBeGreaterThanOrEqual(0)
      expect(a.score).toBeLessThanOrEqual(100)
    }
  })

  it('rejects a name with no vowels', () => {
    const a = assessBrandability('Tk')
    expect(a.rejected).toBe(true)
    expect(a.rejectionReason).toMatch(/vowel/i)
  })

  it('rejects an unpronounceable consonant cluster', () => {
    const a = assessBrandability('Schtrkll')
    expect(a.rejected).toBe(true)
    expect(a.rejectionReason).toMatch(/cluster/i)
  })

  it('rejects more than three words', () => {
    const a = assessBrandability('One Two Three Four')
    expect(a.rejected).toBe(true)
    expect(a.rejectionReason).toMatch(/words/i)
  })

  it('rejects a name that is far too long', () => {
    const a = assessBrandability('Supercalifragilisticexpi')
    expect(a.rejected).toBe(true)
    expect(a.rejectionReason).toMatch(/long/i)
  })

  it('penalises tired patterns without necessarily rejecting them', () => {
    const clean = assessBrandability('Cloudari').score
    for (const tired of ['Dataify', 'QuantumSphere', 'ThingHub', 'FooSync']) {
      const a = assessBrandability(tired)
      expect(a.score, tired).toBeLessThan(clean)
      expect(a.flags.length, tired).toBeGreaterThan(0)
    }
  })

  it('penalises a name that leans on "AI"', () => {
    const withAi = assessBrandability('VantAI')
    const without = assessBrandability('Vanta')
    expect(withAi.score).toBeLessThan(without.score)
    expect(withAi.flags.some((f) => /ai/i.test(f))).toBe(true)
  })

  it('penalises gratuitous X/Z/Q letters', () => {
    const a = assessBrandability('Xzyqox')
    expect(a.flags.some((f) => /random|x\/z/i.test(f))).toBe(true)
  })

  it('is deterministic — the same name always scores the same', () => {
    const first = assessBrandability('Marketrove')
    const second = assessBrandability('Marketrove')
    expect(first).toEqual(second)
  })

  it('tolerates unusual and unicode input without throwing', () => {
    for (const weird of ['Éclaîr', 'Ｆｕｌｌｗｉｄｔｈ', '  spaced  ', 'name-with-hyphen', '名前']) {
      expect(() => assessBrandability(weird)).not.toThrow()
    }
  })

  it('ranks a clean name above a generated-sounding one', () => {
    expect(assessBrandability('Cloudari').score).toBeGreaterThan(
      assessBrandability('DataifyAI').score,
    )
  })
})

it('rejects generic adjective-plus-function names that passed availability screening', () => {
  for (const name of ['Secure DocuFlow', 'Silent Convert', 'Tranquil Convert', 'Trusty Viewer', 'Smart File Hub']) {
    expect(assessBrandability(name).rejected, name).toBe(true)
  }
  for (const name of ['Copper Apron', 'Sunday Crumb', 'Paper Lantern', 'Foldroom']) {
    expect(assessBrandability(name).rejected, name).toBe(false)
  }
})
