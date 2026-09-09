/**
 * Industry relevance scoring (§18).
 *
 * Turns two classifications into a 0..100 answer to "how close are these two
 * things?", derived from distance in the taxonomy.
 *
 * The critical case, and the reason this module exists: for a cybersecurity
 * product, `ENVRYN CLOTHING` and `ENVIRON SECURITY SOFTWARE` are equally similar
 * as *strings*. Relevance is what separates them, and it is what lets severity
 * and the §20 caps fire on the one that actually matters.
 */
import { industryById } from './taxonomy'
import { isUnclassified, type Classification } from './classify'

/**
 * Relevance between two individual industries.
 *
 * Same industry is a direct overlap. Sharing a sector means neighbouring fields
 * — a security tool and a dev tool genuinely can be confused for one another.
 * Different sectors is close to unrelated, but not zero: a large brand can
 * assert itself well beyond its own field, so the floor is deliberately above 0.
 */
/**
 * Industry pairs that are genuinely adjacent, regardless of sector.
 *
 * Sector membership alone is too coarse to carry this. "Software" contains both
 * security tooling and mobile games, which share nothing commercially — yet a
 * sector rule rated them 55% related. Meanwhile messaging apps and social
 * networks sit in different sectors and are obviously neighbours.
 *
 * Explicit adjacency states what is actually true instead of inferring it from
 * a taxonomy shape that was never meant to carry that weight.
 */
const RELATED_PAIRS: ReadonlySet<string> = new Set(
  [
    ['security', 'devops'],
    ['security', 'dev_tools'],
    ['dev_tools', 'devops'],
    ['dev_tools', 'design_tools'],
    ['data', 'ai'],
    ['data', 'devops'],
    ['communication', 'social'],
    ['communication', 'productivity'],
    ['fintech_software', 'banking'],
    ['fintech_software', 'insurance'],
    ['healthtech', 'healthcare'],
    ['edtech', 'education'],
    ['martech', 'advertising'],
    ['gaming', 'entertainment'],
    ['retail', 'marketplace'],
    ['retail', 'fashion'],
    ['retail', 'beauty'],
    ['retail', 'home_goods'],
    ['food_products', 'restaurant'],
    ['video', 'entertainment'],
    ['video', 'social'],
    ['music', 'entertainment'],
    ['publishing', 'entertainment'],
    ['logistics', 'marketplace'],
    ['real_estate', 'construction'],
    ['energy', 'manufacturing'],
    ['automotive', 'manufacturing'],
    ['telecom', 'communication'],
  ].map(([a, b]) => `${a}|${b}`),
)

function areRelated(a: string, b: string): boolean {
  return RELATED_PAIRS.has(`${a}|${b}`) || RELATED_PAIRS.has(`${b}|${a}`)
}

function pairRelevance(a: string, b: string): number {
  if (a === b) return 1

  const nodeA = industryById(a)
  const nodeB = industryById(b)
  if (nodeA === undefined || nodeB === undefined) return 0

  // Explicit adjacency first: these are the pairs a customer could actually
  // confuse. Merely sharing a broad sector earns far less.
  if (areRelated(a, b)) return 0.7
  if (nodeA.sector === nodeB.sector) return 0.35
  return 0.12
}

/**
 * Overall relevance, 0..100, or `undefined` when we genuinely cannot tell.
 *
 * `undefined` is a first-class outcome, not a failure to handle. If either side
 * is unclassified we have no basis for a judgement, and inventing a number —
 * even a neutral 50 — would let a fabricated value flow into severity and into
 * score caps. The report renders it as an em dash and the caps decline to fire.
 */
export function industryRelevance(
  a: Classification,
  b: Classification,
): number | undefined {
  if (isUnclassified(a) || isUnclassified(b)) return undefined

  // Best weighted pairing: the strongest single connection between the two
  // sets is what a person would notice, so averaging across all pairs would
  // wash out a real overlap behind unrelated secondary classifications.
  let best = 0
  for (const [idA, weightA] of a.scores) {
    for (const [idB, weightB] of b.scores) {
      const score = pairRelevance(idA, idB) * Math.min(weightA, weightB)
      if (score > best) best = score
    }
  }

  return Math.round(best * 100)
}

/** Human-readable explanation, for evidence and debugging. */
export function explainRelevance(a: Classification, b: Classification): string {
  if (isUnclassified(a) || isUnclassified(b)) {
    return 'Not enough information to judge industry overlap.'
  }

  let best = { score: 0, idA: '', idB: '' }
  for (const [idA, weightA] of a.scores) {
    for (const [idB, weightB] of b.scores) {
      const score = pairRelevance(idA, idB) * Math.min(weightA, weightB)
      if (score > best.score) best = { score, idA, idB }
    }
  }

  const nodeA = industryById(best.idA)
  const nodeB = industryById(best.idB)
  if (nodeA === undefined || nodeB === undefined) return 'No industry overlap found.'

  if (best.idA === best.idB) return `Both operate in ${nodeA.label}.`
  if (areRelated(best.idA, best.idB)) {
    return `${nodeB.label} and ${nodeA.label} are neighbouring fields.`
  }
  if (nodeA.sector === nodeB.sector) {
    return `${nodeB.label} and ${nodeA.label} share a broad sector but little else.`
  }
  return `${nodeB.label} is unrelated to ${nodeA.label}.`
}

/** The strongest industry label in a classification, for display. */
export function primaryIndustry(c: Classification): string | undefined {
  let best: { id: string; weight: number } | undefined
  for (const [id, weight] of c.scores) {
    if (best === undefined || weight > best.weight) best = { id, weight }
  }
  return best === undefined ? undefined : industryById(best.id)?.label
}
