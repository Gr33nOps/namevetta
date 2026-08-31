/**
 * Live generation check against the real Groq API (§21).
 *
 * Skipped unless `GROQ_API_KEY` is set, so CI — which runs with no credentials —
 * never sees it, and it never becomes a flaky gate. Run it by hand when you want
 * to eyeball the actual names a real model returns for realistic briefs:
 *
 *   PowerShell:  $env:GROQ_API_KEY="gsk_..."; npx vitest run live.e2e
 *   bash:        GROQ_API_KEY=gsk_... npx vitest run live.e2e
 *
 * It asserts the guarantees the pipeline is supposed to hold — a full pool, no
 * famous collisions, no near-duplicate families — and prints the pool so a human
 * can judge whether the names actually look professional, which no assertion can.
 */
import { describe, expect, it } from 'vitest'
import { generateNames } from './namegen'
import { famousCollision } from './famous'
import { sameFamily } from './dedupe'
import { assessBrandability } from './quality'

const HAS_KEY = typeof process.env.GROQ_API_KEY === 'string' && process.env.GROQ_API_KEY.trim() !== ''

/** The realistic briefs from the task, spanning categories and tones. */
const BRIEFS: { category: string; description: string }[] = [
  { category: 'Developer tool / library', description: 'A local-first open-source secret manager for developers' },
  { category: 'Software / SaaS', description: 'A document viewer and converter that works completely offline' },
  { category: 'Game', description: 'A fighting game inspired by Japanese arcade culture' },
  { category: 'Finance', description: 'A premium financial analytics SaaS for investment teams' },
  { category: 'Software / SaaS', description: 'A privacy-focused email client' },
]

/** Space live calls so a burst of briefs does not trip Groq's free-tier TPM. */
const SPACING_MS = 12_000
let first = true

describe.skipIf(!HAS_KEY)('live name generation', () => {
  for (const brief of BRIEFS) {
    it(
      `produces a clean, professional pool for: ${brief.description}`,
      async () => {
        if (!first) await new Promise((resolve) => setTimeout(resolve, SPACING_MS))
        first = false

        const outcome = await generateNames(brief.category, brief.description, undefined)

        console.log(`\n[${brief.category}] ${brief.description}\n  ->`, JSON.stringify(outcome))

        // A live free-tier run can legitimately be rate-limited; that is a
        // provider constraint, not a generation defect, so it is a soft skip
        // rather than a failure. Every brief that *does* return is held to the
        // full quality bar below.
        if (outcome.status === 'unavailable') {
          console.warn(`  (skipped assertions: ${outcome.reason})`)
          return
        }

        // A healthy pool has real depth for screening to draw five from.
        expect(outcome.names.length).toBeGreaterThanOrEqual(5)

        // No famous collisions survived generation.
        for (const name of outcome.names) {
          expect(famousCollision(name), `${name} collides with a famous brand`).toBeUndefined()
        }

        // No two members of the returned pool are the same idea.
        for (let i = 0; i < outcome.names.length; i++) {
          for (let j = i + 1; j < outcome.names.length; j++) {
            expect(
              sameFamily(outcome.names[i] as string, outcome.names[j] as string),
              `${outcome.names[i]} and ${outcome.names[j]} are near-duplicates`,
            ).toBe(false)
          }
        }

        // Every name cleared the brandability gate.
        for (const name of outcome.names) {
          expect(assessBrandability(name).rejected, `${name} is a weak brand name`).toBe(false)
        }
      },
      60_000,
    )
  }
})
