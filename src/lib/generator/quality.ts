/**
 * Brandability assessment for generated candidates (§12, §25).
 *
 * The screening pipeline downstream answers "is this name free?" — it says
 * nothing about whether the name is any *good*. That is this module's job, and
 * it is deliberately deterministic: an LLM can be asked to invent names, but its
 * own opinion of them is exactly the unstable, hallucination-prone signal §22
 * warns against trusting. So a name's brand quality is measured here, in code,
 * from properties a person actually reacts to — length, pronounceability, how it
 * reads and types, and whether it leans on the tired patterns that make a name
 * feel machine-generated.
 *
 * Two outputs, kept separate on purpose:
 *
 *  - `score` (0..100) ranks the survivors so the best names lead the list.
 *  - `rejected` is a hard gate: garbage never reaches the (expensive, sequential)
 *    availability screening at all.
 *
 * Nothing here is a ban list. A single tired suffix costs a name a few points,
 * not its slot — an genuinely strong name that happens to end in "-ly" still
 * wins on the rest of its merits, which is the balance §2 asks for.
 */
import { normalize, normalizeTokens } from '@/lib/similarity/normalize'

/** `y` is a vowel here for the same reason it is in `normalize` — invented brand
 * names use it as one constantly (Lyft, Fyre, Envryn). */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])

function isVowel(ch: string): boolean {
  return VOWELS.has(ch)
}

/** The longest run of consecutive consonants in a normalized token. */
function longestConsonantRun(token: string): number {
  // English digraphs are one sound, and compounds often meet at a consonant.
  token = token.replace(/(north|south|hearth|bright|light|night|work|salt)(?=[a-z])/g, '$1a')
    .replace(/th|sh|ch|ph|wh|ck|gh|ng/g, 't')
  let longest = 0
  let current = 0
  for (const ch of token) {
    if (isVowel(ch)) {
      current = 0
    } else {
      current += 1
      if (current > longest) longest = current
    }
  }
  return longest
}

/** The longest run of consecutive vowels in a normalized token. */
function longestVowelRun(token: string): number {
  let longest = 0
  let current = 0
  for (const ch of token) {
    if (isVowel(ch)) {
      current += 1
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }
  return longest
}

/**
 * Overused brand-name patterns and the points each one costs.
 *
 * These are the "AI-sounding" tells the brief names explicitly: a name is not
 * banned for using one, it just has to be good enough elsewhere to carry the
 * cost. Each entry is a matcher over the *display* name (so casing and word
 * boundaries are visible) plus a short reason for the flag.
 */
interface Pattern {
  reason: string
  penalty: number
  test: (display: string, tokens: string[], joined: string) => boolean
}

const TIRED_PATTERNS: readonly Pattern[] = [
  {
    reason: 'leans on "AI"',
    penalty: 14,
    test: (display, tokens) =>
      tokens.includes('ai') || /(?:^AI(?=[A-Z])|AI$)/.test(display),
  },
  { reason: 'ends in "-ly"', penalty: 10, test: (_d, _t, joined) => /ly$/.test(joined) },
  { reason: 'ends in "-ify"', penalty: 12, test: (_d, _t, joined) => /ify$/.test(joined) },
  { reason: 'ends in "-fy"', penalty: 8, test: (_d, _t, joined) => /[^i]fy$/.test(joined) },
  {
    reason: 'uses a stock tech word',
    penalty: 12,
    test: (_d, tokens) =>
      tokens.some((t) =>
        ['nova', 'nexus', 'quantum', 'sphere', 'labs', 'lab', 'hub', 'flow', 'sync', 'flux', 'cloud', 'stack', 'grid', 'forge', 'pulse', 'core', 'zen'].includes(
          t,
        ),
      ),
  },
  {
    reason: 'ends in "-ify"/"-flow"/"-sync"/"-hub" tacked onto a word',
    penalty: 10,
    test: (_d, _t, joined) => /(flow|sync|hub|ster|scape|verse|matic)$/.test(joined),
  },
  {
    reason: 'reads like random X/Z/Q letters',
    penalty: 12,
    test: (_d, _t, joined) => {
      if (joined.length === 0) return false
      const spiky = (joined.match(/[xzqjkw]/g) ?? []).length
      return spiky / joined.length >= 0.34
    },
  },
]

export interface BrandabilityAssessment {
  /** 0..100. Higher is a stronger brand name. */
  score: number
  /** Human-readable notes on what helped or hurt — for diagnostics, never shown raw to users. */
  flags: string[]
  /** True when the name is not worth spending an availability check on. */
  rejected: boolean
  /** Set when `rejected`: the single decisive reason. */
  rejectionReason?: string
}

/**
 * Ideal length band for a brand name, measured over letters only (spaces and
 * hyphens excluded). Short enough to say and type, long enough to be coinable
 * and free. Names outside the band are penalised, not rejected, until they get
 * genuinely unwieldy.
 */
const IDEAL_MIN = 4
const IDEAL_MAX = 12
const HARD_MAX_LETTERS = 22

/** Below this, a name is not worth an availability check. */
const REJECT_BELOW = 40

/**
 * Assess how good a name is as a brand, independent of whether it is free to use.
 *
 * Pure and deterministic: the same string always scores the same, which is what
 * lets the ranking be reasoned about and regression-tested (§22).
 */
export function assessBrandability(name: string): BrandabilityAssessment {
  const display = name.trim()
  const tokens = normalizeTokens(display)
  const joined = normalize(display)
  const flags: string[] = []

  // A feature label with a reassuring adjective is not a distinctive brand.
  // Keep this narrow: ordinary evocative compounds are still welcome.
  const feature = /(?:viewer|converter|convert|documents?|docuflow|filehub|filetool|pdf|software|app|solution|platform)$/
  const adjective = /^(?:secure|safe|smart|trusty|trusted|silent|tranquil|easy|simple|quick|fast|private|calm|best|better)/
  if ((adjective.test(joined) && feature.test(joined)) || /^(?:secure|smart|easy|quick|safe|trusty)(?:docu|data|file)/.test(joined)) {
    return { score: 25, flags: ['generic feature label'], rejected: true, rejectionReason: 'describes a feature instead of a distinctive name' }
  }

  const stock = '(?:nova|nexus|quantum|sphere|hub|flow|sync|flux|cloud|stack|grid|forge|pulse|core|zen|labs|ai)'
  if (new RegExp(`^(?:${stock}){2,}$`).test(joined) || /^(?:nex|zyn|syn|zov|nov)(?:ora|oria|ify|ex|iq|ix)$/.test(joined)) {
    return { score: 25, flags: ['formulaic tech name'], rejected: true, rejectionReason: 'reads as a weak, generated-sounding name' }
  }

  // Structural rejections first — these are genuine garbage, not style.
  if (joined.length === 0) {
    return { score: 0, flags: ['no usable characters'], rejected: true, rejectionReason: 'no usable characters' }
  }
  if (joined.length > HARD_MAX_LETTERS) {
    return {
      score: 0,
      flags: [`too long (${joined.length} letters)`],
      rejected: true,
      rejectionReason: 'too long to be a workable brand name',
    }
  }
  if (tokens.length > 3) {
    return {
      score: 0,
      flags: [`${tokens.length} words`],
      rejected: true,
      rejectionReason: 'too many words for a brand name',
    }
  }
  const worstConsonantRun = Math.max(...tokens.map(longestConsonantRun), 0)
  if (worstConsonantRun >= 4) {
    return {
      score: 0,
      flags: [`${worstConsonantRun}-consonant cluster`],
      rejected: true,
      rejectionReason: 'unpronounceable consonant cluster',
    }
  }
  if (!/[aeiouy]/.test(joined)) {
    return {
      score: 0,
      flags: ['no vowels'],
      rejected: true,
      rejectionReason: 'has no vowels to pronounce',
    }
  }

  let score = 100

  // Length.
  if (joined.length < IDEAL_MIN) {
    const short = IDEAL_MIN - joined.length
    score -= short * 10
    flags.push('very short')
  } else if (joined.length > IDEAL_MAX) {
    const over = joined.length - IDEAL_MAX
    score -= Math.min(30, over * 4)
    flags.push('on the long side')
  }

  // Word count. One or two words reads as a brand; three is getting descriptive.
  if (tokens.length === 3) {
    score -= 12
    flags.push('three words')
  }

  // Pronounceability: a 3-consonant cluster is awkward but not fatal; a long
  // vowel run ("aeiou"-ish) reads as a typo.
  if (worstConsonantRun === 3) {
    score -= 8
    flags.push('a stiff consonant cluster')
  }
  if (Math.max(...tokens.map(longestVowelRun), 0) >= 4) {
    score -= 10
    flags.push('a long vowel run')
  }

  // Typeability: tripled letters and digits both make a name harder to say back
  // and to type from memory.
  if (/(.)\1\1/.test(joined)) {
    score -= 12
    flags.push('a tripled letter')
  }
  if (/\d/.test(joined)) {
    score -= 8
    flags.push('contains digits')
  }

  // Consonant/vowel balance. An all-consonant-heavy skeleton is hard to voice;
  // an all-vowel one is mush. Reward names near a natural alternation.
  const vowelCount = [...joined].filter(isVowel).length
  const vowelRatio = vowelCount / joined.length
  if (vowelRatio < 0.25 || vowelRatio > 0.7) {
    score -= 6
    flags.push('off-balance vowels')
  }

  // Tired patterns — soft signals, each with its own cost.
  for (const pattern of TIRED_PATTERNS) {
    if (pattern.test(display, tokens, joined)) {
      score -= pattern.penalty
      flags.push(pattern.reason)
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const rejected = score < REJECT_BELOW
  return {
    score,
    flags,
    rejected,
    ...(rejected ? { rejectionReason: 'reads as a weak, generated-sounding name' } : {}),
  }
}
