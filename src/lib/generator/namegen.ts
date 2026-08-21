import 'server-only'

/**
 * AI name generation (§12).
 *
 * Deliberately has no non-AI fallback. A programmatic generator — random
 * prefixes, suffixes, portmanteaus — produces names a human would never
 * choose, and shipping that behind a "smart generator" label would be the
 * kind of fake-it-till-you-make-it this product explicitly refuses to do
 * elsewhere (§2, §25). If Groq is unavailable, the honest answer is that name
 * generation is unavailable, not a worse version of it.
 *
 * The screening step downstream is what makes this trustworthy despite being
 * AI output: every candidate returned here is actually researched before a
 * user ever sees it, so a merely plausible-sounding name that turns out to be
 * `stripe.com`'s next-door neighbour gets caught, not shipped.
 */
import { z } from 'zod'
import { CandidateNameSchema, MAX_NAME_LENGTH } from '@/lib/core/scan'
import { CANDIDATE_COUNT } from '@/lib/generator/candidates'
import { normalize } from '@/lib/similarity/normalize'
import { groqProvider } from '@/lib/providers/groq'
import { LLMUnavailableError } from '@/lib/providers/llm'

export { CANDIDATE_COUNT }

export type GenerateNamesOutcome =
  | { status: 'ready'; names: string[] }
  | { status: 'unavailable'; reason: string }

const SYSTEM_PROMPT = `You invent brand name candidates for a naming research tool. Given a category
and description of what someone is building, propose ${CANDIDATE_COUNT} distinct
candidate names.

Rules:
- Invented, coined, or unusual real-word names — not generic dictionary words.
  A name like "Cloud" or "Market" is almost certainly already taken everywhere
  and wastes the candidate slot; a name like "Cloudari" or "Marketrove" has a
  real chance of being free.
- Each name is 1-3 words, short enough to say out loud, plausible as a real
  product or company name in the given category.
- No two candidates may be the same idea with a trivial spelling change.
- Do not include the exact seed name if one is given — only new ideas related
  to it.
- Reply with strict JSON only, no commentary: {"names": ["...", ...]}`

const NamesSchema = z.object({
  names: z.array(z.string()).min(1),
})

function buildUserPrompt(category: string, description: string | undefined, seed: string | undefined): string {
  const lines = [`Category: ${category}`]
  if (description !== undefined && description.trim() !== '') {
    lines.push(`Description: ${description.trim()}`)
  }
  if (seed !== undefined && seed.trim() !== '') {
    lines.push(`Seed name for inspiration (do not reuse it): ${seed.trim()}`)
  }
  return lines.join('\n')
}

/**
 * Clean, dedupe and bound the model's raw output.
 *
 * The model is asked for well-formed names, but "asked for" is not "verified"
 * — this is where that gap gets closed. Anything that wouldn't pass the
 * product's own `CandidateNameSchema` (the same validation a human-typed name
 * goes through) is dropped rather than silently coerced.
 */
export function sanitiseCandidates(raw: readonly string[], seed: string | undefined): string[] {
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

export async function generateNames(
  categoryLabel: string,
  description: string | undefined,
  seed: string | undefined,
): Promise<GenerateNamesOutcome> {
  try {
    const result = await groqProvider.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(categoryLabel, description, seed),
      // A short-name batch in JSON is a few hundred tokens; this leaves headroom
      // without inviting the model to pad with commentary.
      maxOutputTokens: 900,
      temperature: 0.9,
      json: true,
    })

    let parsed: unknown
    try {
      parsed = JSON.parse(result.text)
    } catch {
      return { status: 'unavailable', reason: 'The name generator returned an unusable response.' }
    }

    const shape = NamesSchema.safeParse(parsed)
    if (!shape.success) {
      return { status: 'unavailable', reason: 'The name generator returned an unusable response.' }
    }

    const names = sanitiseCandidates(shape.data.names, seed)
    if (names.length === 0) {
      return { status: 'unavailable', reason: 'The name generator did not produce any usable names.' }
    }

    return { status: 'ready', names }
  } catch (cause) {
    if (cause instanceof LLMUnavailableError) {
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
