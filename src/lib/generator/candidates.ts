/**
 * Pool sizing for a generation run.
 *
 * Split out of `namegen.ts` so the client form and marketing copy can name the
 * numbers without importing a `server-only` module. The engine generates a broad
 * pool and filters it down hard, so these are two different figures: how many
 * explored across directed batches, and how big a filtered pool is worth
 * screening.
 */

/**
 * Three directed batches of twenty hidden candidates. A weak pool can receive
 * one additional twenty-name refinement before another editorial review.
 */
export const CANDIDATE_COUNT = 60

/**
 * Maximum quality-ranked candidates forwarded to availability screening.
 * This is a ceiling, not a promise that four will pass the external checks.
 */
export const TARGET_POOL = 18

