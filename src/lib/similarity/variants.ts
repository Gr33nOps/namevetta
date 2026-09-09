/**
 * Variant generation.
 *
 * Searching only for `Envryn` is not enough (§15) — the point is to find the
 * things an exact search misses. These variants drive query expansion for
 * sources that only support exact lookup (npm, PyPI, GitHub, RDAP), where we
 * cannot fuzzy-search remotely and must ask about specific spellings.
 *
 * Volume matters: every variant is a potential extra HTTP call against a free
 * quota. `generateVariants` is therefore ranked and capped, and callers take
 * the top N rather than the whole set.
 */
import { collapseRepeats, normalize, normalizeTokens } from './normalize'

export interface Variant {
  value: string
  /** Why this variant was produced — surfaced in evidence and used in tests. */
  kind: VariantKind
  /**
   * How likely this variant is to represent the same brand, 0..1. Drives
   * ordering so a caller taking the top 10 gets the 10 most worthwhile.
   */
  weight: number
}

export type VariantKind =
  | 'exact'
  | 'separator'
  | 'repeat_collapse'
  | 'vowel_swap'
  | 'letter_swap'
  | 'suffix'
  | 'plural'
  | 'doubled_letter'

/**
 * Letters that are routinely interchanged in invented brand names. Kept tight
 * on purpose: each entry multiplies the candidate set, and §54 treats false
 * positives as a real cost, not a free win.
 */
const LETTER_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ['i', 'y'],
  ['e', 'a'],
  ['c', 'k'],
  ['s', 'z'],
  ['f', 'ph'],
  ['u', 'oo'],
  ['x', 'ks'],
  ['qu', 'kw'],
]

/** Suffixes founders bolt onto a root when the bare name is taken. */
const SUFFIXES = ['app', 'hq', 'io', 'ly', 'ify', 'labs', 'ai']

function swapAll(value: string, from: string, to: string): string[] {
  const out: string[] = []
  let index = value.indexOf(from)
  while (index !== -1) {
    out.push(value.slice(0, index) + to + value.slice(index + from.length))
    index = value.indexOf(from, index + 1)
  }
  // Also the all-at-once replacement, which is what a person would actually type.
  if (value.includes(from)) out.push(value.split(from).join(to))
  return out
}

/**
 * Produce ranked spelling variants of a candidate name.
 *
 * @param input Raw user input; normalized internally.
 * @param limit Maximum variants to return, highest weight first.
 */
export function generateVariants(input: string, limit = 24): Variant[] {
  const base = normalize(input)
  if (base.length === 0) return []

  const seen = new Map<string, Variant>()
  const add = (value: string, kind: VariantKind, weight: number): void => {
    if (value.length < 2 || value === '') return
    const existing = seen.get(value)
    // Keep the strongest justification for a variant we can reach several ways.
    if (existing === undefined || existing.weight < weight) {
      seen.set(value, { value, kind, weight })
    }
  }

  add(base, 'exact', 1)

  // Separator forms: env-ryn, env ryn, env_ryn all normalize back to `base`,
  // but the separated spellings are what package registries actually contain.
  const tokens = normalizeTokens(input)
  if (tokens.length > 1) {
    add(tokens.join('-'), 'separator', 0.95)
    add(tokens.join('_'), 'separator', 0.9)
    add(tokens.join('.'), 'separator', 0.85)
  }

  const collapsed = collapseRepeats(base)
  if (collapsed !== base) add(collapsed, 'repeat_collapse', 0.85)

  // Doubling a single letter — the "dribbble" pattern.
  for (let i = 0; i < base.length; i++) {
    add(base.slice(0, i + 1) + base[i] + base.slice(i + 1), 'doubled_letter', 0.55)
  }

  for (const [from, to] of LETTER_SWAPS) {
    for (const v of swapAll(base, from, to)) add(v, 'letter_swap', 0.8)
    for (const v of swapAll(base, to, from)) add(v, 'letter_swap', 0.8)
  }

  // Vowel dropping and insertion — the single most common trick in invented
  // brand names, and the reason `Envryn` must find `Enviren`.
  for (let i = 0; i < base.length; i++) {
    if ('aeiou'.includes(base[i] as string)) {
      add(base.slice(0, i) + base.slice(i + 1), 'vowel_swap', 0.75)
      for (const vowel of 'aeiou') {
        add(base.slice(0, i) + vowel + base.slice(i + 1), 'vowel_swap', 0.7)
      }
    }
  }

  add(`${base}s`, 'plural', 0.6)
  if (base.endsWith('s')) add(base.slice(0, -1), 'plural', 0.6)

  for (const suffix of SUFFIXES) {
    if (!base.endsWith(suffix)) add(base + suffix, 'suffix', 0.5)
  }

  return [...seen.values()]
    .sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value))
    .slice(0, limit)
}
