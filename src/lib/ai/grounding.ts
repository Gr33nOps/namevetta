/**
 * The grounding validator (§25).
 *
 * "AI explanations" is a euphemism for "a model paraphrasing what we already
 * found" only if something enforces that. Without a check, the model is free
 * to invent a plausible-sounding competitor, round a score in the reader's
 * favour, or use a phrase §wording forbids — none of which would look wrong on
 * the page, and all of which would be worse than no summary at all.
 *
 * This does not ask the model to cite sources or use special markup. It checks
 * the *output* against the `Facts` the digest built: every entity name
 * mentioned must be one we actually found, every number must be one we
 * actually computed, and none of the forbidden legal-conclusion phrases may
 * appear. A summary that fails is discarded, never shown edited — a silently
 * "corrected" AI summary is a second unverified claim standing in for the
 * first.
 *
 * Deliberately conservative: a summary can fail here and still have been a
 * perfectly reasonable paragraph. That tradeoff is intentional. A false
 * rejection costs a user a paragraph of prose they can live without; a false
 * acceptance costs their trust in the whole report.
 */
import { FORBIDDEN_PHRASES } from '@/lib/presentation'
import type { Facts } from './digest'
import { normaliseEntity } from './digest'

export interface GroundingFailure {
  rule: 'forbidden_phrase' | 'unknown_number' | 'unknown_entity'
  detail: string
}

export interface GroundingResult {
  ok: boolean
  failures: GroundingFailure[]
}

/**
 * Numbers the model is always free to use regardless of the digest.
 *
 * Small counting words ("a", "one", "two") and percentage/rank language appear
 * in fluent prose without referring to a specific fact, and flagging them would
 * make the validator reject good summaries for the wrong reason. The ceiling is
 * deliberately low: anything double-digit and up must trace back to a real
 * figure, because that is exactly the range a fabricated score or match count
 * would fall in.
 */
const ALWAYS_ALLOWED_NUMBERS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100])

type NumberMeaning =
  | 'score'
  | 'coverage'
  | 'verified_source_count'
  | 'clear_source_count'
  | 'unverified_source_count'
  | undefined

/**
 * A number by itself is not enough to ground a claim. In particular, 86% of
 * weighted coverage and 86 sources checked are different facts. Read the
 * words immediately around the number before accepting it.
 */
function numberMeaning(text: string, index: number, length: number): NumberMeaning {
  const before = text.slice(Math.max(0, index - 36), index).toLowerCase()
  const after = text.slice(index + length, index + length + 48).toLowerCase()
  if (/^\s*%/.test(after) || /research\s+coverage|coverage\s*(?:is|of|was)?\s*$/.test(before)) {
    return 'coverage'
  }
  if (/score\s*(?:is|was|of|at)?\s*$/.test(before) || /^\s*(?:out of|score\b)/.test(after)) {
    return 'score'
  }
  if (/\b(?:checked|verified)\s*(?:sources?|checks?|places?)\b/.test(after) || /\b(?:of|across)\s*$/.test(before) && /\b(?:checked|verified)\s*(?:sources?|checks?|places?)\b/.test(after)) {
    return 'verified_source_count'
  }
  if (/\b(?:clear)\s*(?:sources?|checks?|places?)\b/.test(after) || /\b(?:sources?|checks?|places?)\s+(?:were|are)\s+clear\b/.test(after)) {
    return 'clear_source_count'
  }
  if (/\b(?:couldn't|could not|unable to)\s+(?:be\s+)?checked\s*(?:sources?|checks?|places?)\b/.test(after)) {
    return 'unverified_source_count'
  }
  if (/\b(?:sources?|checks?|places?)\s+(?:couldn't|could not|were unable to)\s+be\s+checked\b/.test(after)) {
    return 'unverified_source_count'
  }
  if (/\b(?:sources?|checks?|places?)\s+(?:were|are)\s+(?:checked|verified)\b/.test(after)) {
    return 'verified_source_count'
  }
  return undefined
}

function matchesMeaning(value: number, meaning: NumberMeaning, facts: Facts): boolean {
  switch (meaning) {
    case 'score':
      return value === facts.score
    case 'coverage':
      return value === facts.coveragePercent
    case 'verified_source_count':
      return value === facts.verifiedSourceCount
    case 'clear_source_count':
      return value === facts.clearSourceCount
    case 'unverified_source_count':
      return value === facts.unverifiedSourceCount
    default:
      return facts.numbers.has(value)
  }
}

/**
 * Extract candidate entity mentions: capitalised words and short capitalised
 * phrases, which is how a brand or company name shows up in English prose.
 *
 * Sentence-initial position is excluded for a *single* capitalised word.
 * English capitalises the first word of every sentence regardless of whether
 * it is a proper noun — "There was one match" is not a claim about an entity
 * called "There" — and without this exclusion nearly every summary would be
 * rejected on its opening word alone. A multi-word capitalised run is kept
 * even at the start of a sentence, since two consecutive capitals almost never
 * happens by grammatical accident ("Stripe Labs was found on GitHub").
 */
function candidateEntities(text: string): string[] {
  const out: string[] = []
  const sentences = text.split(/(?<=[.!?])\s+/)
  const pattern = /\b[A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,2}\b/g

  for (const sentence of sentences) {
    for (const match of sentence.matchAll(pattern)) {
      const value = match[0]
      if (value.length <= 2) continue
      const isSentenceInitial = match.index === 0
      const isSingleWord = !value.includes(' ')
      if (isSentenceInitial && isSingleWord) continue
      out.push(value)
    }
  }

  return out
}

/** Common capitalised words that are not brand names and would false-flag. */
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'this', 'that', 'these', 'those',
  'domain', 'domains', 'github', 'npm', 'pypi', 'youtube', 'wikipedia',
  'app', 'apps', 'store', 'google', 'play', 'web', 'source', 'sources',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
])

export function checkGrounding(text: string, facts: Facts): GroundingResult {
  const failures: GroundingFailure[] = []
  const lower = text.toLowerCase()

  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      failures.push({ rule: 'forbidden_phrase', detail: phrase })
    }
  }

  for (const match of text.matchAll(/(?<![a-zA-Z0-9])\d+(?:\.\d+)?(?![a-zA-Z0-9])/g)) {
    const num = Number(match[0])
    if (ALWAYS_ALLOWED_NUMBERS.has(num)) continue
    const meaning = numberMeaning(text, match.index ?? 0, match[0].length)
    if (!matchesMeaning(num, meaning, facts)) {
      failures.push({ rule: 'unknown_number', detail: String(num) })
    }
  }

  for (const raw of candidateEntities(text)) {
    const key = normaliseEntity(raw)
    if (key.length < 3) continue
    if (COMMON_WORDS.has(raw.toLowerCase())) continue
    // A short all-caps token ("URLs", "AI", "SIC") is an acronym, not a named
    // entity — flagging these was pure noise, since they're generic vocabulary
    // for describing the report rather than a claim about a specific brand.
    if (/^[A-Z]{2,5}s?$/.test(raw)) continue
    if (facts.entities.has(key)) continue
    // A source label ("Companies House", "Google Play") mentioned in prose is
    // fine — those are never a competing entity. Checked both directions
    // because the model may use the short form ("EDGAR") of a longer label
    // ("SEC EDGAR"), or vice versa.
    if ([...facts.knownLabels].some((label) => label.includes(key) || key.includes(label))) {
      continue
    }
    // Order-independent fallback for a multi-word phrase: "UK Companies
    // House" is a reordering of the label "Companies House (UK)", and every
    // one of its words individually appears in the digest (each capitalised
    // word the digest contains is indexed on its own, not just as whole
    // phrases). A phrase built entirely from words the digest actually
    // contains cannot be citing an entity the scan never found — the model
    // can rearrange known words, but it cannot introduce a new one this way.
    if (raw.includes(' ')) {
      const words = raw.split(/\s+/).map(normaliseEntity).filter((w) => w.length >= 2)
      if (words.length > 0 && words.every((w) => facts.entities.has(w))) continue
    }
    failures.push({ rule: 'unknown_entity', detail: raw })
  }

  return { ok: failures.length === 0, failures }
}
