/**
 * The daily allowance model, in one place.
 *
 * Every number a visitor is told about their allowance comes from here, by
 * import rather than by retyping. The site used to say three different things
 * — "50 checks a day" on the homepage, "5 Quick Checks" on the auth page, and
 * "74/75" on the history page, which was the only one reading the real
 * configuration. A product that describes itself three ways is a product a
 * reader stops believing, so the strings are generated now and
 * `quota-copy.test.ts` fails the build if a literal creeps back in.
 *
 * Client-safe on purpose: `env()` is server-only, and a client component that
 * needs to name a limit should be handed the value rather than reaching for a
 * module it cannot import. The defaults here are what `env.ts` falls back to,
 * so the two can never disagree about what "unconfigured" means.
 */

/** Who is asking. Guests are identified by a salted hash, not an account. */
export const SUBJECT_KINDS = ['guest', 'user'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

/** Everything metered, per subject kind, per day. */
export const QUOTA_KINDS = ['quick', 'deep', 'generate'] as const
export type MeteredKind = (typeof QUOTA_KINDS)[number]

export interface QuotaLimits {
  quick: number
  deep: number
  generate: number
}

/**
 * What each allowance is called, in the product's own words.
 *
 * One label per metered feature, used by the 429 message, the history
 * indicator and the sign-up copy alike, so the thing a user runs out of has
 * the same name wherever they hit it.
 */
export const QUOTA_LABELS: Record<MeteredKind, string> = {
  quick: 'Quick Check',
  deep: 'Deep Research',
  generate: 'Name generation',
}

/** Plural form, for the counts that need one. */
export const QUOTA_LABELS_PLURAL: Record<MeteredKind, string> = {
  quick: 'Quick Checks',
  deep: 'Deep Research runs',
  generate: 'Name generation runs',
}

/**
 * The defaults, and the reasoning behind the gap between them.
 *
 * Quick Checks are generous because they genuinely cost nothing: every source
 * on the quick set is a free public API, and the metered ones (Tavily web
 * search, the Groq summary) are deep-only. Deep stays scarce for the opposite
 * reason — one Tavily credit against a 1,000/month free tier. Generation gets
 * its own low ceiling because one run issues several Quick Checks.
 *
 * `env.ts` reads each of these as the fallback for its matching variable, so a
 * deployment can retune without a code change and the copy still tells the
 * truth (see `effectiveLimits`).
 */
export const DEFAULT_QUOTA_LIMITS: Record<SubjectKind, QuotaLimits> = {
  guest: { quick: 75, deep: 5, generate: 3 },
  user: { quick: 500, deep: 50, generate: 30 },
}

/**
 * "5 Deep Research runs" / "1 Deep Research run".
 *
 * One helper rather than a ternary at every call site, because the singular
 * form is exactly the detail a copy edit forgets.
 */
export function quotaPhrase(kind: MeteredKind, count: number): string {
  return count === 1
    ? `${count} ${QUOTA_LABELS[kind]} run`
    : `${count} ${QUOTA_LABELS_PLURAL[kind]}`
}

/** "500 Quick Checks and 50 Deep Research runs a day", from the numbers given. */
export function dailyAllowanceSentence(limits: QuotaLimits): string {
  return `${quotaPhrase('quick', limits.quick)} and ${quotaPhrase('deep', limits.deep)} a day`
}
