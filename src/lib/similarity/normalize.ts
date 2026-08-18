/**
 * Name normalization.
 *
 * Everything downstream — n-gram indexing, phonetic keys, edit distance —
 * operates on normalized forms, so this module defines what "the same name"
 * means for the whole product. It must be deterministic and stable: cached
 * source results and stored name variants are keyed on this output, so a change
 * here invalidates them.
 *
 * Roadmap ref: §15 (normalization, Unicode, punctuation).
 */

/**
 * Confusable characters that look alike but are distinct codepoints. Folding
 * these is what stops `ENVRYN` and `ENVRYΝ` (Greek capital nu) from being read
 * as different names — a real spoofing vector, not a theoretical one.
 *
 * Kept deliberately small and Latin-focused: over-folding creates false
 * positives, which §54 counts as a failure mode in its own right.
 */
const HOMOGLYPHS: ReadonlyMap<string, string> = new Map([
  // Cyrillic
  ['а', 'a'], ['е', 'e'], ['о', 'o'], ['р', 'p'], ['с', 'c'], ['у', 'y'],
  ['х', 'x'], ['ѕ', 's'], ['і', 'i'], ['ј', 'j'], ['һ', 'h'], ['ԁ', 'd'],
  ['ᴏ', 'o'], ['ν', 'v'],
  // Greek
  ['α', 'a'], ['ο', 'o'], ['ρ', 'p'], ['τ', 't'], ['υ', 'u'], ['χ', 'x'],
  ['ε', 'e'], ['ι', 'i'], ['κ', 'k'], ['μ', 'm'], ['η', 'n'],
])

// Deliberately absent: leetspeak folding (0→o, 3→e, !→i and friends).
// Digits are meaningful content in real brand names — Web3, 3M, 7-Eleven — and
// folding them here would corrupt the canonical key and the corpus built from
// it. Digit/letter lookalikes are handled as *visual* confusables in
// `score.ts`, where they lower distance without collapsing distinct names.

/** Separators that brands use interchangeably: env-ryn, env ryn, env_ryn. */
const SEPARATORS = /[\s\-_.·•/\\+&']+/gu

/**
 * Strip diacritics via NFKD, then drop the combining marks. NFKD also folds
 * ligatures and full-width forms, which is why it beats NFD here.
 */
function stripDiacritics(input: string): string {
  return input.normalize('NFKD').replace(/\p{M}+/gu, '')
}

function foldHomoglyphs(input: string): string {
  let out = ''
  for (const ch of input) out += HOMOGLYPHS.get(ch) ?? ch
  return out
}

/**
 * The canonical form used for exact-match comparison and as the corpus key.
 *
 * Lowercase, diacritic-free, homoglyph-folded, separators removed, and
 * non-alphanumerics dropped. `Env-Ryn`, `env ryn` and `ENVRYN` all collapse to
 * `envryn`, which is the behaviour §15 asks for.
 */
export function normalize(input: string): string {
  return foldHomoglyphs(stripDiacritics(input).toLowerCase())
    .replace(SEPARATORS, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Like `normalize`, but preserves word boundaries as single spaces. Used for
 * token-level similarity, where `cloud flare` vs `cloudflare` matters.
 */
export function normalizeTokens(input: string): string[] {
  const folded = foldHomoglyphs(stripDiacritics(input).toLowerCase())
  return folded
    .split(SEPARATORS)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 0)
}

/**
 * Collapse runs of the same letter: `bookkeeper` and `bokeper` both reduce to a
 * form where doubled letters cannot mask an otherwise-identical name. Used as a
 * secondary signal only, since it is lossy.
 */
export function collapseRepeats(input: string): string {
  return input.replace(/(.)\1+/gu, '$1')
}

/**
 * `y` counts as a vowel here even though it often is not.
 *
 * Invented brand names substitute `y` for a vowel constantly — `Envryn` from
 * `Environ`, `Lyft` from `lift`, `Fyre` from `fire`. Treating it as a consonant
 * would give those pairs different skeletons and defeat the whole point of the
 * key, so the lossy reading is the correct one for this domain.
 */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])

/**
 * Consonant skeleton — the name with vowels removed after the first character.
 *
 * This is what catches deliberately vowel-dropped brand names: `Envryn`,
 * `Environ` and `Enviren` all share the skeleton `envrn`. Cheap, indexable, and
 * surprisingly effective as a candidate-retrieval key.
 */
export function skeleton(input: string): string {
  const n = normalize(input)
  if (n.length === 0) return ''
  let out = n[0] as string
  for (let i = 1; i < n.length; i++) {
    const ch = n[i] as string
    if (!VOWELS.has(ch)) out += ch
  }
  return out
}
