/**
 * Near-duplicate removal within a generated batch (§12 §5).
 *
 * `sanitiseCandidates` already drops exact repeats after normalization. That is
 * not enough: a model asked for twenty names happily returns "Nexora",
 * "Nexorra", "Nexoro" and "Nexora Labs" as if they were four independent ideas,
 * and shipping them as four of the final five would make the generator look
 * broken. This collapses each such family to its single best member.
 *
 * It reuses the product's own similarity signals rather than inventing new ones,
 * so "the same name" means the same thing here as everywhere else (§15). The
 * caller passes candidates already ordered best-first, and the first member of a
 * family seen is the one kept — so ordering by brand quality upstream means the
 * strongest spelling survives.
 */
import { skeleton } from '@/lib/similarity/normalize'
import { phoneticSimilarity } from '@/lib/similarity/phonetic'
import { leadsWithName, textSimilarity } from '@/lib/similarity/score'

/**
 * Above this textual similarity two names are treated as the same idea. Tuned so
 * "Nexora"/"Nexorra" (a doubled letter) collapse while genuinely distinct names
 * that merely rhyme do not.
 */
const TEXT_FAMILY = 0.82

/** Phonetic agreement this strong means one is a respelling of the other. */
const PHONETIC_FAMILY = 0.9

/**
 * Whether two names are the same brand idea rather than two ideas.
 *
 * Several ways to be a family, because founders reach the same collision from
 * several directions: a respelling ("Nexora"/"Nexorra"), a shared root with a
 * descriptor ("Nexora"/"Nexora Labs"), or the same consonant spine with swapped
 * vowels ("Nexora"/"Nexira").
 */
export function sameFamily(a: string, b: string): boolean {
  if (textSimilarity(a, b) >= TEXT_FAMILY) return true
  if (phoneticSimilarity(a, b) >= PHONETIC_FAMILY) return true
  // A shared root where one name is the other plus a descriptor word.
  if (leadsWithName(a, b) || leadsWithName(b, a)) return true
  // Same consonant skeleton is a strong "reads as the same name" cue, but only
  // for skeletons long enough that the agreement is not a coincidence.
  const sa = skeleton(a)
  const sb = skeleton(b)
  if (sa.length >= 4 && sa === sb) return true
  return false
}

/**
 * Collapse near-duplicate families, keeping the first member of each.
 *
 * O(n·k) where k is the number of families kept — fine for the batch sizes here
 * (tens of names), and the clarity is worth more than shaving it to O(n log n)
 * with a clustering index that would be another thing to get subtly wrong.
 */
export function dedupeFamilies(names: readonly string[]): string[] {
  const kept: string[] = []
  const visited = new Set<number>()
  for (let index = 0; index < names.length; index++) {
    if (visited.has(index)) continue
    kept.push(names[index]!)
    const pending = [index]
    visited.add(index)
    while (pending.length > 0) {
      const member = pending.pop()!
      for (let other = 0; other < names.length; other++) {
        if (!visited.has(other) && sameFamily(names[member]!, names[other]!)) {
          visited.add(other)
          pending.push(other)
        }
      }
    }
  }
  return kept
}
