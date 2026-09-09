/**
 * String distance and similarity metrics.
 *
 * All pure, all zero-I/O, all operating on already-normalized input. Each
 * returns a 0..1 similarity (1 = identical) so the blend in `score.ts` can mix
 * them without per-metric rescaling.
 *
 * These are written out rather than pulled from a package because the blend
 * weights and the early-exit bounds are tuned against the golden dataset (§54),
 * and we need to be able to reason about every term.
 *
 * Roadmap ref: §15 (deterministic algorithms first).
 */

/**
 * Levenshtein edit distance with a single rolling row.
 *
 * `maxDistance` enables an early exit: when every value in a row exceeds the
 * bound, no completion can come back under it. Candidate re-ranking compares one
 * query against hundreds of corpus rows, so this bound is what keeps the
 * trademark query path cheap.
 */
export function levenshtein(a: string, b: string, maxDistance = Infinity): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1

  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = curr[0] as number
    const ai = a[i - 1]
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b[j - 1] ? 0 : 1
      const v = Math.min(
        (curr[j - 1] as number) + 1, // insertion
        (prev[j] as number) + 1, // deletion
        (prev[j - 1] as number) + cost, // substitution
      )
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > maxDistance) return maxDistance + 1
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b.length] as number
}

/**
 * Damerau-Levenshtein (optimal string alignment) — adds transposition.
 *
 * This is the one that catches `Envryn` vs `Envrny`, a plain typo that plain
 * Levenshtein charges two edits for.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const rows = a.length + 1
  const cols = b.length + 1
  const d = new Array<number>(rows * cols)
  for (let i = 0; i < rows; i++) d[i * cols] = i
  for (let j = 0; j < cols; j++) d[j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(
        (d[i * cols + j - 1] as number) + 1,
        (d[(i - 1) * cols + j] as number) + 1,
        (d[(i - 1) * cols + j - 1] as number) + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (d[(i - 2) * cols + j - 2] as number) + 1)
      }
      d[i * cols + j] = v
    }
  }
  return d[rows * cols - 1] as number
}

/** Levenshtein expressed as 0..1 similarity against the longer string. */
export function levenshteinSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - levenshtein(a, b) / longest
}

/** Damerau-Levenshtein expressed as 0..1 similarity. */
export function damerauSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - damerauLevenshtein(a, b) / longest
}

/** Jaro similarity — the base for Jaro-Winkler. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aFlags = new Array<boolean>(a.length).fill(false)
  const bFlags = new Array<boolean>(b.length).fill(false)

  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window)
    const end = Math.min(i + window + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bFlags[j] || a[i] !== b[j]) continue
      aFlags[i] = true
      bFlags[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue
    while (!bFlags[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

/**
 * Jaro-Winkler — Jaro with a bonus for a shared prefix.
 *
 * Brand names are read left to right and a shared opening carries real
 * confusion risk, which is exactly what the prefix bonus rewards. Capped at
 * four characters per the standard definition.
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b)
  if (j < 0.7) return j // standard threshold: do not boost weak matches
  let prefix = 0
  const max = Math.min(4, a.length, b.length)
  while (prefix < max && a[prefix] === b[prefix]) prefix++
  return j + prefix * prefixScale * (1 - j)
}

/**
 * Padding sentinels marking the start and end of a name, so that n-grams
 * distinguish a leading `env` from an interior one. Control characters are used
 * deliberately: normalized input is alphanumeric only, so these cannot collide
 * with real content the way a letter or digit would.
 */
const PAD_START = '\u0002'
const PAD_END = '\u0003'

/** Character n-grams of `input`, padded so word edges are represented. */
export function ngrams(input: string, n = 3): string[] {
  if (input.length === 0) return []
  const padded = `${PAD_START.repeat(n - 1)}${input}${PAD_END.repeat(n - 1)}`
  const out: string[] = []
  for (let i = 0; i <= padded.length - n; i++) out.push(padded.slice(i, i + n))
  return out
}

/**
 * Cosine similarity over character n-gram frequency vectors.
 *
 * Complements edit distance: it is insensitive to where a difference occurs, so
 * it catches rearrangements and shared substrings that edit distance penalises
 * heavily.
 */
export function ngramCosine(a: string, b: string, n = 3): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  const av = new Map<string, number>()
  const bv = new Map<string, number>()
  for (const g of ngrams(a, n)) av.set(g, (av.get(g) ?? 0) + 1)
  for (const g of ngrams(b, n)) bv.set(g, (bv.get(g) ?? 0) + 1)

  let dot = 0
  let aMag = 0
  let bMag = 0
  for (const [g, count] of av) {
    aMag += count * count
    const other = bv.get(g)
    if (other !== undefined) dot += count * other
  }
  for (const count of bv.values()) bMag += count * count
  if (aMag === 0 || bMag === 0) return 0
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag))
}

/**
 * Jaccard similarity over token sets — for multi-word names where word order
 * varies, e.g. "Acme Security" vs "Security by Acme".
 */
export function tokenJaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const sa = new Set(a)
  const sb = new Set(b)
  let intersection = 0
  for (const t of sa) if (sb.has(t)) intersection++
  const union = sa.size + sb.size - intersection
  return union === 0 ? 0 : intersection / union
}
