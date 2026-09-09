import { describe, expect, it } from 'vitest'
import {
  damerauLevenshtein,
  jaroWinkler,
  levenshtein,
  ngramCosine,
  ngrams,
  tokenJaccard,
} from './distance'
import { collapseRepeats, normalize, normalizeTokens, skeleton } from './normalize'
import { phoneticKeys, phoneticSimilarity, soundex } from './phonetic'
import { compareNames, containsNameAsWord, textSimilarity, visualSimilarity , leadsWithName} from './score'
import { generateVariants } from './variants'

describe('normalize', () => {
  it('collapses case, separators and punctuation to one canonical form', () => {
    for (const input of ['Envryn', 'envryn', 'ENVRYN', 'env ryn', 'env-ryn', 'Env.Ryn', 'env_ryn']) {
      expect(normalize(input)).toBe('envryn')
    }
  })

  it('strips diacritics', () => {
    expect(normalize('Café')).toBe('cafe')
    expect(normalize('Zürich')).toBe('zurich')
  })

  it('folds homoglyphs from other scripts', () => {
    // Cyrillic 'а' and Greek 'ο' are distinct codepoints that render identically
    // to their Latin counterparts — a real spoofing vector.
    expect(normalize('pаypal')).toBe(normalize('paypal'))
    expect(normalize('gοogle')).toBe(normalize('google'))
  })

  it('returns empty for input with no alphanumerics', () => {
    expect(normalize('!!!')).toBe('')
    expect(normalize('')).toBe('')
  })

  it('preserves digits instead of folding them to letters', () => {
    // Regression guard: leetspeak folding here would corrupt real brand names
    // and, worse, the Turso corpus keys built from this function.
    expect(normalize('Web3')).toBe('web3')
    expect(normalize('3M')).toBe('3m')
    expect(normalize('7-Eleven')).toBe('7eleven')
  })

  it('splits tokens on every separator style', () => {
    expect(normalizeTokens('Acme Security')).toEqual(['acme', 'security'])
    expect(normalizeTokens('acme-security')).toEqual(['acme', 'security'])
    expect(normalizeTokens('  spaced   out  ')).toEqual(['spaced', 'out'])
  })

  it('collapses repeated letters', () => {
    expect(collapseRepeats('dribbble')).toBe('drible')
    expect(collapseRepeats('bookkeeper')).toBe('bokeper')
  })

  it('builds a consonant skeleton keeping the first character', () => {
    expect(skeleton('Envryn')).toBe('envrn')
    expect(skeleton('Environ')).toBe('envrn')
    expect(skeleton('apple')).toBe('appl')
  })
})

describe('levenshtein', () => {
  it('computes known distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('envryn', 'envrin')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })

  it('honours the early-exit bound without changing sub-bound answers', () => {
    expect(levenshtein('envryn', 'envrin', 3)).toBe(1)
    // Far apart: the bounded call must report "over the bound", not the true value.
    expect(levenshtein('envryn', 'completelyother', 2)).toBeGreaterThan(2)
  })
})

describe('damerauLevenshtein', () => {
  it('charges one edit for a transposition where Levenshtein charges two', () => {
    expect(levenshtein('envryn', 'envrny')).toBe(2)
    expect(damerauLevenshtein('envryn', 'envrny')).toBe(1)
  })
})

describe('jaroWinkler', () => {
  it('rewards a shared prefix', () => {
    expect(jaroWinkler('envryn', 'envrin')).toBeGreaterThan(0.9)
    expect(jaroWinkler('envryn', 'envryn')).toBe(1)
  })

  it('does not boost weak matches', () => {
    // Below the 0.7 threshold the prefix bonus must not apply.
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
  })
})

describe('ngrams', () => {
  it('pads so the start and end of a name are distinguishable', () => {
    const g = ngrams('ab', 3)
    expect(g.length).toBeGreaterThan(0)
    // A leading 'ab' must not produce the same gram as an interior one.
    expect(ngrams('abx', 3)[0]).not.toBe(ngrams('xab', 3)[1])
  })

  it('returns nothing for empty input', () => {
    expect(ngrams('', 3)).toEqual([])
  })

  it('scores identical strings at 1 and disjoint ones near 0', () => {
    expect(ngramCosine('envryn', 'envryn')).toBe(1)
    expect(ngramCosine('envryn', 'zzzzzz')).toBeLessThan(0.1)
  })
})

describe('tokenJaccard', () => {
  it('is order-insensitive', () => {
    expect(tokenJaccard(['acme', 'security'], ['security', 'acme'])).toBe(1)
  })

  it('scores partial overlap', () => {
    expect(tokenJaccard(['acme', 'security'], ['acme', 'labs'])).toBeCloseTo(1 / 3, 5)
  })
})

describe('soundex', () => {
  it('matches the textbook cases', () => {
    expect(soundex('Robert')).toBe('R163')
    expect(soundex('Rupert')).toBe('R163')
    expect(soundex('Tymczak')).toBe('T522')
    expect(soundex('Pfister')).toBe('P236')
  })

  it('treats H and W as transparent', () => {
    expect(soundex('Ashcraft')).toBe('A261')
  })

  it('returns empty for input with no letters', () => {
    expect(soundex('123')).toBe('')
  })
})

describe('phonetics', () => {
  it('gives homophones the same primary key', () => {
    expect(phoneticKeys('Smith').primary).toBe(phoneticKeys('Smyth').primary)
  })

  it('rates true homophones at the top', () => {
    expect(phoneticSimilarity('Smith', 'Smyth')).toBe(1)
  })

  it('rates near-homophones highly but below identical', () => {
    const s = phoneticSimilarity('Envryn', 'Envrin')
    expect(s).toBeGreaterThan(0.8)
  })

  it('rates unrelated sounds low', () => {
    expect(phoneticSimilarity('Envryn', 'Zebra')).toBeLessThan(0.5)
  })

  it('returns 0 when either side has no pronounceable content', () => {
    expect(phoneticSimilarity('', 'Envryn')).toBe(0)
  })
})

describe('visualSimilarity', () => {
  it('is 1 for names that normalize identically', () => {
    expect(visualSimilarity('Envryn', 'env-ryn')).toBe(1)
  })

  it('rates confusable characters above unrelated ones', () => {
    // 'l' vs '1' vs 'i' are a classic lookalike-squatting vector.
    expect(visualSimilarity('paypal', 'paypa1')).toBeGreaterThan(
      visualSimilarity('paypal', 'paypaz'),
    )
  })

  it('rewards a shared consonant skeleton', () => {
    expect(visualSimilarity('Envryn', 'Environ')).toBeGreaterThan(0.4)
  })
})

describe('textSimilarity', () => {
  it('is 1 for identical normalized names', () => {
    expect(textSimilarity('Envryn', 'ENVRYN')).toBe(1)
  })

  it('rates a one-character typo very highly', () => {
    // Trigram cosine is deliberately harsh on short names — one substitution
    // breaks three of ~eight grams — so the blend lands near 0.81 rather than
    // 0.9. That is the honest reading; the headline `overall` in compareNames
    // recovers the rest from the phonetic and visual signals.
    expect(textSimilarity('Envryn', 'Envrin')).toBeGreaterThan(0.8)
  })

  it('rates unrelated names low', () => {
    expect(textSimilarity('Envryn', 'Quicksilver')).toBeLessThan(0.4)
  })

  it('uses token overlap for reordered multi-word names', () => {
    expect(textSimilarity('Acme Security', 'Security Acme')).toBe(1)
  })
})

describe('compareNames', () => {
  it('produces a full breakdown in 0..100 integers', () => {
    const r = compareNames('Envryn', 'Envrin')
    for (const v of [r.text, r.phonetic, r.visual, r.overall]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('scores an identical name at 100 across the board', () => {
    const r = compareNames('Envryn', 'envryn')
    expect(r.text).toBe(100)
    expect(r.phonetic).toBe(100)
    expect(r.visual).toBe(100)
    expect(r.overall).toBe(100)
  })

  it('ranks the roadmap example correctly', () => {
    // §15/§16: Envryn must find Envrin, and Environ must register as a real
    // near-miss rather than being dismissed as "not equal, therefore fine".
    const envrin = compareNames('Envryn', 'Envrin')
    const environ = compareNames('Envryn', 'Environ')
    const unrelated = compareNames('Envryn', 'Bluebird')

    expect(envrin.overall).toBeGreaterThan(environ.overall)
    expect(environ.overall).toBeGreaterThan(unrelated.overall)
    expect(environ.overall).toBeGreaterThan(40)
  })

  it('omits industry when it was not supplied rather than inventing it', () => {
    expect(compareNames('Envryn', 'Envrin').industry).toBeUndefined()
  })

  it('amplifies a same-industry match and damps an unrelated one', () => {
    // §18: ENVRYN CLOTHING should not weigh the same as ENVIRON SECURITY
    // SOFTWARE when the user is naming a cybersecurity SaaS.
    const sameIndustry = compareNames('Envryn', 'Environ', { industry: 95 })
    const otherIndustry = compareNames('Envryn', 'Environ', { industry: 5 })
    expect(sameIndustry.overall).toBeGreaterThan(otherIndustry.overall)
    expect(sameIndustry.industry).toBe(95)
  })
})

describe('containsNameAsWord', () => {
  it('catches the <Name> <Suffix> pattern length-based similarity misses', () => {
    // "Stripe" vs "Stripe Dashboard" scores ~60% purely because most of the
    // second string is unmatched, yet it is plainly relevant.
    expect(textSimilarity('Stripe', 'Stripe Dashboard')).toBeLessThan(0.7)
    expect(containsNameAsWord('Stripe', 'Stripe Dashboard')).toBe(true)
  })

  it('catches the <Prefix> <Name> pattern', () => {
    expect(containsNameAsWord('Vault', 'HashiCorp Vault')).toBe(true)
  })

  it('respects word boundaries rather than matching any substring', () => {
    expect(containsNameAsWord('Stripe', 'Pinstriped Suits')).toBe(false)
    expect(containsNameAsWord('Env', 'Environment Canada')).toBe(false)
  })

  it('matches concatenated compounds at a word edge', () => {
    expect(containsNameAsWord('Stripe', 'StripeDashboard')).toBe(true)
  })

  it('ignores names too short to be distinctive', () => {
    expect(containsNameAsWord('ab', 'ab something')).toBe(false)
  })
})

describe('generateVariants', () => {
  it('always includes the exact normalized name first', () => {
    const v = generateVariants('Envryn')
    expect(v[0]?.value).toBe('envryn')
    expect(v[0]?.kind).toBe('exact')
  })

  it('generates the vowel-swap variants the roadmap calls for', () => {
    const values = generateVariants('Envryn', 100).map((v) => v.value)
    expect(values).toContain('envrin')
  })

  it('generates separator forms for multi-word names', () => {
    const values = generateVariants('Acme Security', 100).map((v) => v.value)
    expect(values).toContain('acme-security')
    expect(values).toContain('acme_security')
  })

  it('respects the limit and returns highest weight first', () => {
    const v = generateVariants('Envryn', 5)
    expect(v).toHaveLength(5)
    for (let i = 1; i < v.length; i++) {
      expect(v[i - 1]!.weight).toBeGreaterThanOrEqual(v[i]!.weight)
    }
  })

  it('never emits duplicates or fragments shorter than 2 characters', () => {
    const v = generateVariants('Envryn', 200)
    expect(new Set(v.map((x) => x.value)).size).toBe(v.length)
    for (const item of v) expect(item.value.length).toBeGreaterThanOrEqual(2)
  })

  it('returns nothing for input that normalizes to empty', () => {
    expect(generateVariants('!!!')).toEqual([])
  })
})

describe('leadsWithName', () => {
  it('is true when the candidate is the head of the name', () => {
    expect(leadsWithName('Monzo', 'Monzo Bank')).toBe(true)
    expect(leadsWithName('Stripe', 'Stripe Dashboard')).toBe(true)
    expect(leadsWithName('Stripe', 'StripeDashboard')).toBe(true)
  })

  it('is false when the candidate is only a modifier', () => {
    // The distinction the rule exists for: "Monzo Bank" is somebody trading
    // under the name, "Kids Monzo" is somebody borrowing the word.
    expect(leadsWithName('Monzo', 'Kids Monzo')).toBe(false)
    expect(leadsWithName('Vault', 'HashiCorp Vault')).toBe(false)
  })

  it('is false for an exact match, which callers handle separately', () => {
    expect(leadsWithName('Monzo', 'Monzo')).toBe(false)
  })

  it('does not fire mid-word', () => {
    expect(leadsWithName('Env', 'Environment Canada')).toBe(false)
    expect(leadsWithName('Stripe', 'Pinstriped Suits')).toBe(false)
  })

  it('ignores names too short to be distinctive', () => {
    expect(leadsWithName('Go', 'Go Cardless')).toBe(false)
  })
})
