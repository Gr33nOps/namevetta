import 'server-only'

/**
 * AI name generation (§12, §25).
 *
 * The model invents; everything else here decides what is worth keeping. That
 * split is the whole design: an LLM is good at proposing brand names and bad at
 * judging its own, so its output is treated as raw material, not answers. A run
 * generates a broad pool, then filters it down deterministically —
 *
 *   sanitise → reject famous names → score brandability → drop weak names →
 *   collapse near-duplicate families → rank best-first → refill if thin
 *
 * — and only the survivors of that go on to availability screening. A famous
 * name ("Tekken") is rejected before it ever costs a check; a tired,
 * generated-sounding name is scored down and dropped; four spellings of one idea
 * collapse to the best one. What comes back is a quality-ranked pool large
 * enough that screening reliably lands five free names (§7).
 *
 * Deliberately no non-AI fallback. A programmatic generator — random prefixes,
 * portmanteaus — produces names a human would never choose, and shipping that
 * behind a "smart generator" label is the fake-it-till-you-make-it this product
 * refuses elsewhere (§2, §25). If Groq is unavailable, name generation is
 * unavailable, honestly, rather than quietly worse.
 */
import { z } from 'zod'
import { CandidateNameSchema, MAX_NAME_LENGTH } from '@/lib/core/scan'
import {
  CANDIDATE_COUNT,
  MAX_GENERATION_ATTEMPTS,
  TARGET_POOL,
} from '@/lib/generator/candidates'
import { assessBrandability } from '@/lib/generator/quality'
import { famousCollision } from '@/lib/generator/famous'
import { dedupeFamilies } from '@/lib/generator/dedupe'
import { normalize } from '@/lib/similarity/normalize'
import { groqProvider } from '@/lib/providers/groq'
import { LLMUnavailableError } from '@/lib/providers/llm'

export { CANDIDATE_COUNT }

export type GenerateNamesOutcome =
  | { status: 'ready'; names: string[] }
  | { status: 'unavailable'; reason: string }

const SYSTEM_PROMPT = `You are a professional brand naming strategist. Given a category and a
description of what someone is building, propose ${CANDIDATE_COUNT} distinct candidate
names a real naming team would put in front of a client.

First, read the description and infer the brief for yourself: the industry, the
audience, whether it is technical or consumer, premium or playful, serious or
experimental, and a few semantic themes worth drawing on. Then name to that
brief. Do not restate the brief; just let it shape the names.

What a strong candidate looks like:
- Invented, coined, or an unexpected real word. Plain dictionary words ("Cloud",
  "Market") are taken everywhere and waste a slot; coined names ("Cloudari",
  "Marketrove") have a real chance of being free.
- Short enough to say out loud in one breath, easy to spell after hearing it,
  and clean to type. Roughly 1-2 words, up to three only when it genuinely reads
  better.
- Pronounceable on sight, with no awkward consonant pile-ups.
- Distinctive and relevant to what is being built, not a generic tech mad-lib.

Give the set real range. Do not return five variations of one idea; vary the
sound, length, and angle so a client has genuinely different directions to react
to.

Avoid the tells of machine-generated names unless one is genuinely the best
choice: bolted-on "AI", "-ly", "-ify", "-Flow", "-Sync", "-Hub", "-Labs";
stock words like "Nova", "Nexus", "Quantum", "Sphere"; gratuitous X/Z/Q; and
meaningless faux-Latin.

Never propose a famous existing brand, product, game, company, or trademark, or
an obvious respelling of one.

Reply with strict JSON only, no commentary: {"names": ["...", ...]}`

const NamesSchema = z.object({
  names: z.array(z.unknown()),
})

function buildUserPrompt(
  category: string,
  description: string | undefined,
  seed: string | undefined,
  exclude: readonly string[],
): string {
  const lines = [`Category: ${category}`]
  if (description !== undefined && description.trim() !== '') {
    lines.push(`Description: ${description.trim()}`)
  }
  if (seed !== undefined && seed.trim() !== '') {
    lines.push(`Seed name for inspiration (do not reuse it): ${seed.trim()}`)
  }
  if (exclude.length > 0) {
    // Cap the echoed list so a late refill on a big pool does not blow the token
    // budget restating dozens of names; the most recent are the ones the model
    // is most likely to repeat.
    const recent = exclude.slice(-40)
    lines.push(
      `Do not repeat or lightly respell any of these already-seen names: ${recent.join(', ')}`,
    )
  }
  return lines.join('\n')
}

/**
 * Clean, dedupe (exact) and bound one raw model batch.
 *
 * "Asked for well-formed names" is not "verified": anything that would not pass
 * the product's own `CandidateNameSchema` (the validation a human-typed name
 * goes through) is dropped rather than coerced. Case-insensitive de-duplication
 * preserves first-seen casing. This is exact-match only; near-duplicate families
 * are collapsed later, across the whole accumulated pool.
 */
export function sanitiseCandidates(raw: readonly unknown[], seed: string | undefined): string[] {
  const seedKey = seed === undefined ? undefined : normalize(seed)
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of raw) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (trimmed === '' || trimmed.length > MAX_NAME_LENGTH) continue

    const parsed = CandidateNameSchema.safeParse(trimmed)
    if (!parsed.success) continue

    const key = normalize(parsed.data)
    if (key === '' || key === seedKey) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(parsed.data)
  }

  return out
}

export interface QualityFiltered {
  /** Names that passed the brandability gate and are not famous. */
  kept: string[]
  /** Names dropped, with the reason — for server-side diagnostics only. */
  dropped: { name: string; reason: string }[]
}

/**
 * Reject famous names and brandability failures from a sanitised batch.
 *
 * Order matters: famousness is checked first because "this is Tekken" is a more
 * useful rejection reason to log than "this scored low". Everything kept carries
 * its brandability score so the pool can be ranked best-first.
 */
export function filterQuality(names: readonly string[]): QualityFiltered {
  const kept: string[] = []
  const dropped: { name: string; reason: string }[] = []

  for (const name of names) {
    const famous = famousCollision(name)
    if (famous !== undefined) {
      dropped.push({ name, reason: `resembles ${famous.name} (${famous.kind})` })
      continue
    }
    const quality = assessBrandability(name)
    if (quality.rejected) {
      dropped.push({ name, reason: quality.rejectionReason ?? 'weak brand name' })
      continue
    }
    kept.push(name)
  }

  return { kept, dropped }
}

/** Order a set of names by brandability, strongest first, stably. */
export function rankByQuality(names: readonly string[]): string[] {
  return names
    .map((name, index) => ({ name, index, score: assessBrandability(name).score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.name)
}

/**
 * One model call: request a batch, parse it defensively, sanitise it.
 *
 * Never throws for a bad response — malformed JSON or an off-shape payload
 * returns an empty batch, which the refill loop treats as an unproductive
 * attempt rather than a failure. Only a genuine provider outage (an
 * `LLMUnavailableError`) propagates.
 */
async function generateBatch(
  categoryLabel: string,
  description: string | undefined,
  seed: string | undefined,
  exclude: readonly string[],
): Promise<string[]> {
  const result = await groqProvider.complete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(categoryLabel, description, seed, exclude),
    // A batch of two dozen short names in JSON is a few hundred tokens; the
    // headroom covers the model's low-effort reasoning without inviting padding.
    maxOutputTokens: 1200,
    temperature: 0.9,
    json: true,
  })

  if (result === null || result === undefined || typeof result.text !== 'string') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(result.text)
  } catch {
    return []
  }

  const shape = NamesSchema.safeParse(parsed)
  if (!shape.success) return []

  return sanitiseCandidates(shape.data.names, seed)
}

/**
 * Generate a quality-ranked pool of candidate names.
 *
 * Refills until the filtered pool reaches `TARGET_POOL` or the attempt ceiling
 * is hit, whichever comes first. Each refill excludes everything already seen so
 * the model spends its batch on new ideas rather than repeating itself. Returns
 * the pool ordered best-first; `screenCandidates` checks availability in that
 * order, so the strongest names are the ones that get to fill the final five.
 */
export async function generateNames(
  categoryLabel: string,
  description: string | undefined,
  seed: string | undefined,
): Promise<GenerateNamesOutcome> {
  const poolKeys = new Set<string>()
  const pool: string[] = []
  // Every name the model has proposed, kept/dropped alike, so refills do not
  // re-suggest a name we already rejected.
  const seen: string[] = []

  try {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const batch = await generateBatch(categoryLabel, description, seed, seen)
      for (const name of batch) if (!seen.includes(name)) seen.push(name)

      const { kept } = filterQuality(batch)
      for (const name of kept) {
        const key = normalize(name)
        if (poolKeys.has(key)) continue
        poolKeys.add(key)
        pool.push(name)
      }

      // Collapse near-duplicate families across the whole accumulated pool, not
      // just the latest batch, then check whether we have enough.
      const deduped = dedupeFamilies(rankByQuality(pool))
      if (deduped.length >= TARGET_POOL) {
        return { status: 'ready', names: deduped.slice(0, TARGET_POOL) }
      }
      // A batch that produced nothing new is a sign more attempts will not help.
      if (batch.length === 0 && attempt > 0) break
    }

    const finalPool = dedupeFamilies(rankByQuality(pool))
    if (finalPool.length === 0) {
      return { status: 'unavailable', reason: 'The name generator did not produce any usable names.' }
    }
    return { status: 'ready', names: finalPool.slice(0, TARGET_POOL) }
  } catch (cause) {
    if (cause instanceof LLMUnavailableError) {
      // If earlier attempts already built a usable pool, a later refill failing
      // (a rate limit mid-run, say) should not throw away what we have.
      const salvaged = dedupeFamilies(rankByQuality(pool))
      if (salvaged.length > 0) return { status: 'ready', names: salvaged.slice(0, TARGET_POOL) }

      const message =
        cause.reason === 'no_api_key'
          ? 'Name generation is not configured on this deployment.'
          : cause.reason === 'budget_exhausted'
            ? 'The AI allowance for this deployment has been used today.'
            : 'Name generation is temporarily unavailable.'
      return { status: 'unavailable', reason: message }
    }
    return { status: 'unavailable', reason: 'Name generation is temporarily unavailable.' }
  }
}
