/**
 * Phonetic keys.
 *
 * Double Metaphone is the primary signal; Soundex is a weak secondary used only
 * to break ties, per §15 ("Soundex only as secondary signal"). Double Metaphone
 * comes from the `double-metaphone` package rather than being reimplemented —
 * it is a large, well-tested, widely-used implementation, and hand-rolling it
 * would be a reliable source of subtle bugs with no upside.
 *
 * These keys drive phonetic matching across every source, and Trademark Assist
 * surfaces the primary key so a user understands why certain spellings are
 * grouped together.
 */
import { doubleMetaphone } from 'double-metaphone'
import { normalize } from './normalize'

export interface PhoneticKeys {
  /** Double Metaphone primary encoding. */
  primary: string
  /** Double Metaphone alternate encoding; equals `primary` when unambiguous. */
  alternate: string
  /** Soundex code, secondary signal only. */
  soundex: string
}

/**
 * Soundex, written out because the implementations in the wild disagree on
 * edge cases (H/W separation, leading-letter handling) and the corpus needs one
 * fixed definition.
 */
export function soundex(input: string): string {
  const s = normalize(input).replace(/[^a-z]/g, '')
  if (s.length === 0) return ''

  const code = (ch: string): string => {
    if ('bfpv'.includes(ch)) return '1'
    if ('cgjkqsxz'.includes(ch)) return '2'
    if ('dt'.includes(ch)) return '3'
    if (ch === 'l') return '4'
    if ('mn'.includes(ch)) return '5'
    if (ch === 'r') return '6'
    return ''
  }

  const first = s[0] as string
  let out = first.toUpperCase()
  let prevCode = code(first)

  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i] as string
    const c = code(ch)
    if (c !== '' && c !== prevCode) out += c
    // H and W are transparent: they do not reset the previous code, so
    // "Ashcraft" collapses correctly. Vowels do reset it.
    if (ch !== 'h' && ch !== 'w') prevCode = c
  }

  return out.padEnd(4, '0')
}

/** Compute all phonetic keys for a name. */
export function phoneticKeys(input: string): PhoneticKeys {
  const n = normalize(input)
  if (n.length === 0) return { primary: '', alternate: '', soundex: '' }
  const [primary, alternate] = doubleMetaphone(n)
  return { primary, alternate, soundex: soundex(n) }
}

/**
 * Phonetic similarity in 0..1.
 *
 * Double Metaphone yields two codes per name, so there are four possible
 * pairings; we take the best. A primary/primary hit is a stronger claim than an
 * alternate/alternate hit, which is why they score differently rather than both
 * returning 1 — `Envryn` sounding like `Environ` should not be indistinguishable
 * from `Envryn` sounding like `Envrin`.
 */
export function phoneticSimilarity(a: string, b: string): number {
  const ka = phoneticKeys(a)
  const kb = phoneticKeys(b)

  if (ka.primary === '' || kb.primary === '') return 0

  if (ka.primary === kb.primary) return 1
  if (ka.primary === kb.alternate || ka.alternate === kb.primary) return 0.9
  if (ka.alternate === kb.alternate) return 0.85

  // A trailing sibilant is almost always a plural or possessive, not a
  // different-sounding name. Double Metaphone encodes "Keyora" as KR and
  // "Keyoras" as KRS, which the prefix fallback below scores at ~0.47 - far too
  // harsh for two names a listener could not tell apart.
  const shorter = ka.primary.length <= kb.primary.length ? ka.primary : kb.primary
  const longer = ka.primary.length <= kb.primary.length ? kb.primary : ka.primary
  if (shorter !== '' && longer === `${shorter}S`) return 0.9

  // No exact code match: fall back to how close the primary codes are, so
  // near-homophones still register instead of dropping to zero.
  const longest = Math.max(ka.primary.length, kb.primary.length)
  if (longest === 0) return 0
  let shared = 0
  const min = Math.min(ka.primary.length, kb.primary.length)
  while (shared < min && ka.primary[shared] === kb.primary[shared]) shared++
  const prefixRatio = shared / longest

  // Soundex agreement is a weak tie-breaker, capped so it can never on its own
  // push a pair into "sounds alike" territory.
  const soundexBonus = ka.soundex !== '' && ka.soundex === kb.soundex ? 0.15 : 0

  return Math.min(0.8, prefixRatio * 0.7 + soundexBonus)
}
