/**
 * Pool sizing for a generation run.
 *
 * Split out of `namegen.ts` so the client form and marketing copy can name the
 * numbers without importing a `server-only` module. The engine generates a broad
 * pool and filters it down hard, so these are two different figures: how many
 * the model is asked for per attempt, and how big a filtered pool is worth
 * screening.
 */

/**
 * Names requested from the model per attempt. Generous on purpose — most of a
 * raw batch is lost to duplicates, tired-sounding names and famous collisions,
 * so asking for a handful and hoping five survive is exactly how a run ends up
 * showing only two (§7). One large batch also costs far fewer tokens than
 * several small ones under the Groq per-minute ceiling.
 */
export const CANDIDATE_COUNT = 24

/**
 * Enough filtered, quality-ranked candidates that sequential availability
 * screening reliably finds five that are free. A coined name usually survives
 * screening, so this leaves comfortable headroom above the five that ship.
 */
export const TARGET_POOL = 18

/**
 * Ceiling on model calls per run. Each call is one refill of the pool with an
 * exclusion list; three is plenty to reach `TARGET_POOL` even on a run where the
 * model returns mostly weak or duplicate names, and it bounds both latency and
 * token spend.
 */
export const MAX_GENERATION_ATTEMPTS = 3
