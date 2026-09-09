/**
 * The similarity blend.
 *
 * §15 is explicit that no single algorithm decides the result, and §16 shows the
 * output the report needs: separate text / phonetic / visual figures plus a
 * headline. This module is where those are produced.
 *
 * Everything here is pure and deterministic. It is the piece most likely to be
 * retuned against the golden dataset (§54), so the weights are named constants
 * rather than inline numbers.
 */
import type { SimilarityBreakdown } from '@/lib/core/types'
import {
  damerauSimilarity,
  jaroWinkler,
  levenshteinSimilarity,
  ngramCosine,
  tokenJaccard,
} from './distance'
import { normalize, normalizeTokens, skeleton } from './normalize'
import { phoneticSimilarity } from './phonetic'

/**
 * Weights for the textual blend. Damerau carries the most because a single
 * transposition or typo is the highest-signal form of confusability; n-gram
 * cosine is included to catch rearrangements that edit distance over-penalises.
 */
const TEXT_WEIGHTS = {
  damerau: 0.35,
  jaroWinkler: 0.3,
  ngram: 0.25,
  levenshtein: 0.1,
} as const

/**
 * Characters that look alike on screen. Distinct from the homoglyph folding in
 * `normalize`: those are *identical* glyphs from other scripts and are folded
 * away entirely, whereas these are merely *similar* within the Latin alphabet
 * and should lower visual distance without collapsing the names.
 */
const VISUAL_CONFUSABLES: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['i', 'l', 'j', '1']),
  new Set(['o', '0', 'q']),
  new Set(['m', 'n']),
  new Set(['u', 'v', 'w']),
  new Set(['c', 'e', 'o']),
  new Set(['b', 'd', 'p', 'q']),
  new Set(['s', '5']),
  new Set(['g', 'q', 'y']),
  new Set(['f', 't']),
  new Set(['a', 'e']),
]

function visuallyConfusable(a: string, b: string): boolean {
  if (a === b) return true
  return VISUAL_CONFUSABLES.some((group) => group.has(a) && group.has(b))
}

/**
 * Visual similarity — how alike the two names look, as opposed to how many
 * edits separate them.
 *
 * Uses positional comparison with a confusable-character allowance, so `rn` vs
 * `m` and `l` vs `I` register as near-misses. This is the signal that catches
 * lookalike brand squatting, which pure edit distance rates as a clean miss.
 */
export function visualSimilarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0

  const longest = Math.max(na.length, nb.length)
  const shortest = Math.min(na.length, nb.length)

  let score = 0
  for (let i = 0; i < shortest; i++) {
    const ca = na[i] as string
    const cb = nb[i] as string
    if (ca === cb) score += 1
    else if (visuallyConfusable(ca, cb)) score += 0.7
  }

  // Length mismatch is itself a visual difference, so unmatched tail characters
  // simply score zero rather than being ignored.
  const positional = score / longest

  // Shared consonant skeleton is a strong visual cue: names with the same
  // consonant spine read alike even when vowels differ.
  const skeletonMatch = skeleton(na) === skeleton(nb) ? 0.2 : 0

  return Math.min(1, positional + skeletonMatch)
}

/** Text similarity — the weighted blend of the string-distance metrics. */
export function textSimilarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0

  const blended =
    damerauSimilarity(na, nb) * TEXT_WEIGHTS.damerau +
    jaroWinkler(na, nb) * TEXT_WEIGHTS.jaroWinkler +
    ngramCosine(na, nb) * TEXT_WEIGHTS.ngram +
    levenshteinSimilarity(na, nb) * TEXT_WEIGHTS.levenshtein

  // For multi-word names, token overlap can exceed the character-level blend
  // ("Acme Security" vs "Security Acme"); take the stronger reading.
  const ta = normalizeTokens(a)
  const tb = normalizeTokens(b)
  if (ta.length > 1 || tb.length > 1) {
    return Math.max(blended, tokenJaccard(ta, tb))
  }
  return blended
}

/**
 * Whether `other` contains the candidate name as a distinct word.
 *
 * Length asymmetry defeats plain similarity: "Stripe" against "Stripe
 * Dashboard" scores around 60% because most of the second string is unmatched,
 * yet it is obviously relevant to somebody naming a product "Stripe". This
 * predicate catches the `<Name> <Suffix>` and `<Prefix> <Name>` patterns that
 * product and repository names use constantly.
 *
 * Deliberately word-boundary aware rather than a bare substring test, so
 * "Stripe" does not match "Pinstriped".
 */
export function containsNameAsWord(candidate: string, other: string): boolean {
  const needle = normalize(candidate)
  if (needle.length < 3) return false

  if (normalize(other) === needle) return true

  // Whitespace- and punctuation-separated words.
  if (normalizeTokens(other).includes(needle)) return true

  // camelCase / PascalCase compounds — "StripeDashboard" splits to
  // ["Stripe", "Dashboard"]. A prefix test on the joined string would be wrong
  // here: it would match "Env" against "Environment", which is mid-word and not
  // a naming collision at all.
  const camelParts = other
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part.length > 0)

  return camelParts.includes(needle)
}

/**
 * Whether `other` *begins* with the candidate name.
 *
 * A stronger claim than containment, and worth separating. "Monzo Bank" is the
 * Monzo brand with a descriptor appended — the brand is the head of the name.
 * "Kids Monzo" merely borrows the word as a modifier, and the head of that name
 * is something else. Both contain "Monzo"; only the first is somebody operating
 * under it.
 *
 * A single-token match is not "leading" — it is exact, which the callers
 * already handle on its own terms.
 */
export function leadsWithName(candidate: string, other: string): boolean {
  const needle = normalize(candidate)
  if (needle.length < 3) return false

  const tokens = normalizeTokens(other)
  if (tokens.length > 1 && tokens[0] === needle) return true

  const camelParts = other
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part.length > 0)

  return camelParts.length > 1 && camelParts[0] === needle
}

/**
 * Weights for the headline `overall` figure. Text dominates because it is the
 * most reliable signal; industry relevance is folded in when known, since §18
 * is clear that an exact spelling match in an unrelated field matters less than
 * a near match in the same one.
 */
const OVERALL_WEIGHTS = { text: 0.45, phonetic: 0.3, visual: 0.25 } as const
const INDUSTRY_INFLUENCE = 0.3

export interface CompareOptions {
  /**
   * Industry relevance 0..100, from the industry classifier. When omitted the
   * headline is computed from the name alone — never invented.
   */
  industry?: number
}

const pct = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 100)

/**
 * Compare a candidate name against a discovered name and produce the breakdown
 * the report renders (§16).
 */
export function compareNames(
  candidate: string,
  other: string,
  options: CompareOptions = {},
): SimilarityBreakdown {
  const text = textSimilarity(candidate, other)
  const phonetic = phoneticSimilarity(candidate, other)
  const visual = visualSimilarity(candidate, other)

  const nameOnly =
    text * OVERALL_WEIGHTS.text +
    phonetic * OVERALL_WEIGHTS.phonetic +
    visual * OVERALL_WEIGHTS.visual

  let overall = nameOnly

  // An exact match is 100% similar as a name, full stop. Damping it by industry
  // would show a user "88%" for two identical strings, which reads as a bug.
  // Industry does its work through severity and through its own reported field,
  // so it must not also quietly rewrite the similarity figure.
  const identical = normalize(candidate) === normalize(other)

  if (options.industry !== undefined && !identical) {
    // Industry relevance modulates rather than replaces the name signal: a
    // same-industry match is amplified, an unrelated one is damped, but neither
    // can manufacture or erase a spelling collision on its own.
    const industryFactor = options.industry / 100
    overall = nameOnly * (1 - INDUSTRY_INFLUENCE) + nameOnly * industryFactor * INDUSTRY_INFLUENCE
  }

  const breakdown: SimilarityBreakdown = {
    text: pct(text),
    phonetic: pct(phonetic),
    visual: pct(visual),
    overall: pct(overall),
  }
  if (options.industry !== undefined) breakdown.industry = Math.round(options.industry)
  return breakdown
}
