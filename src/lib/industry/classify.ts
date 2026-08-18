/**
 * Industry classification.
 *
 * Maps free text and source-native categories onto taxonomy nodes. Pure,
 * deterministic and free — no external service, no per-call cost, and no way for
 * a provider outage to take a core scoring input with it.
 */
import type { Category } from '@/lib/core/scan'
import { CATEGORY_INDUSTRIES, INDUSTRIES, type IndustryNode, industryById } from './taxonomy'

export interface Classification {
  /** Node id → weight in 0..1, strongest first. Empty when nothing matched. */
  scores: Map<string, number>
}

export const EMPTY_CLASSIFICATION: Classification = { scores: new Map() }

/** True when we genuinely could not place the text. */
export function isUnclassified(c: Classification): boolean {
  return c.scores.size === 0
}

/**
 * Keyword weight.
 *
 * Multi-word phrases are far more discriminating than single words — "record
 * label" pins the music industry, whereas "label" alone appears everywhere — so
 * longer phrases score higher. Without this, common single words would drown out
 * the specific phrases that actually identify an industry.
 */
function keywordWeight(keyword: string): number {
  const words = keyword.split(/\s+/).length
  if (words >= 3) return 3
  if (words === 2) return 2
  return 1
}

/** Escape a keyword for use inside a word-boundary regex. */
function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MATCHERS: { node: IndustryNode; term: string; weight: number; re: RegExp }[] =
  INDUSTRIES.flatMap((node) =>
    node.keywords.map((term) => ({
      node,
      term,
      weight: keywordWeight(term),
      // Word boundaries matter: "app" must not fire on "apparel", and "bar"
      // must not fire on "barcode".
      //
      // Single words also match their simple plural, because "courses" and
      // "payments" are the same signal as "course" and "payment" and listing
      // both forms in every keyword list would be noise waiting to drift.
      re: new RegExp(`\\b${escape(term)}${term.includes(' ') ? '' : 's?'}\\b`, 'i'),
    })),
  )

/**
 * Classify a block of free text.
 *
 * Scores are normalised against the strongest match so the result expresses
 * relative confidence within this text, not an absolute that would vary with
 * text length.
 */
export function classifyText(text: string | undefined): Classification {
  if (text === undefined || text.trim() === '') return EMPTY_CLASSIFICATION

  const raw = new Map<string, number>()
  for (const matcher of MATCHERS) {
    if (!matcher.re.test(text)) continue
    raw.set(matcher.node.id, (raw.get(matcher.node.id) ?? 0) + matcher.weight)
  }

  if (raw.size === 0) return EMPTY_CLASSIFICATION

  const max = Math.max(...raw.values())
  const scores = new Map<string, number>()
  for (const [id, value] of raw) scores.set(id, value / max)
  return { scores }
}

/** Merge classifications, keeping the strongest evidence for each node. */
export function mergeClassifications(
  parts: readonly { classification: Classification; weight: number }[],
): Classification {
  const scores = new Map<string, number>()
  for (const { classification, weight } of parts) {
    for (const [id, value] of classification.scores) {
      const scaled = value * weight
      scores.set(id, Math.max(scores.get(id) ?? 0, scaled))
    }
  }
  return { scores }
}

/**
 * Classify what the user is building.
 *
 * The category seeds a broad guess; the description, when supplied, is weighted
 * higher because it is specific. This is why §3 says that tiny description field
 * "can dramatically improve relevance" — it is the difference between knowing
 * someone is building software and knowing they are building security software.
 */
export function classifyScan(category: Category, description?: string): Classification {
  const seeded = new Map<string, number>()
  for (const id of CATEGORY_INDUSTRIES[category]) seeded.set(id, 1)

  return mergeClassifications([
    { classification: { scores: seeded }, weight: 0.6 },
    { classification: classifyText(description), weight: 1 },
  ])
}

/**
 * App-store genre and other source-native category strings, mapped onto the
 * taxonomy. These are reliable signals — Apple assigns them — so they are worth
 * more than keywords scraped out of prose.
 */
const CATEGORY_HINTS: Record<string, string> = {
  'developer tools': 'dev_tools',
  developer: 'dev_tools',
  utilities: 'productivity',
  productivity: 'productivity',
  business: 'consulting',
  finance: 'banking',
  medical: 'healthcare',
  'health & fitness': 'healthtech',
  education: 'education',
  games: 'gaming',
  entertainment: 'entertainment',
  music: 'music',
  photo: 'design_tools',
  'photo & video': 'video',
  shopping: 'retail',
  'food & drink': 'restaurant',
  travel: 'travel',
  'social networking': 'social',
  news: 'publishing',
  'graphics & design': 'design_tools',
  lifestyle: 'retail',
  repository: 'dev_tools',
  npm: 'dev_tools',
  pypi: 'dev_tools',
}

/**
 * Classify a discovered match from whatever the source gave us.
 *
 * Sources vary wildly in what they return — an App Store genre, an npm
 * description, a Wikidata one-liner — so everything usable is folded in.
 */
export function classifyMatch(input: {
  description?: string | undefined
  categories?: readonly string[]
}): Classification {
  const fromCategories = new Map<string, number>()
  for (const category of input.categories ?? []) {
    const key = category.toLowerCase().trim()
    // A source that already speaks taxonomy — Companies House, via its declared
    // SIC codes — needs no lexicon hop. Its own classification beats anything we
    // could infer from a postal address.
    const mapped = CATEGORY_HINTS[key] ?? (industryById(key) === undefined ? undefined : key)
    if (mapped !== undefined) fromCategories.set(mapped, 1)
  }

  return mergeClassifications([
    { classification: { scores: fromCategories }, weight: 1 },
    { classification: classifyText(input.description), weight: 0.9 },
  ])
}
