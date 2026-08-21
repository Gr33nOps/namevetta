/**
 * How many candidates a generation run asks for.
 *
 * Split out of `namegen.ts` so the client form and the marketing copy can name
 * the number without importing a `server-only` module to find it. Same reason
 * the quota limits live in `@/lib/core/quota`: a figure a user reads should be
 * the figure the engine runs on, not a second copy of it.
 */
export const CANDIDATE_COUNT = 10
