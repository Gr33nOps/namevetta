/**
 * Server-side environment.
 *
 * Every credential is optional by design. The product must run — and be honest
 * about what it could not check — when a key is missing, rather than crashing at
 * boot or, far worse, silently reporting a name as free because the source that
 * would have found the conflict was never called (§2, §25).
 *
 * Nothing here may be imported from a client component: none of these values are
 * `NEXT_PUBLIC_`, so a client import would fail the build, which is the intended
 * guard rail (§36).
 */
import { z } from 'zod'

/**
 * An optional secret.
 *
 * Empty strings are coerced to `undefined` rather than rejected. Hosting
 * dashboards and `.env` files routinely produce `KEY=` for an unset variable,
 * and treating that as a fatal misconfiguration would take the whole site down
 * over a credential the product is designed to run without.
 */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
)

/** Same coercion for optional non-secret values. */
const optionalNumber = (fallback: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().nonnegative().default(fallback),
  )

const EnvSchema = z.object({
  /** Authenticated GitHub requests get 5,000 req/hr instead of 60 (§8). */
  GITHUB_TOKEN: optionalSecret,
  /** YouTube Data API key — required for exact handle lookup (§11). */
  YOUTUBE_API_KEY: optionalSecret,
  // No trademark registry credentials: V1 performs no automated trademark
  // research. When a TrademarkProvider is added, its credentials belong here.
  /** Brave Search — metered, guarded by `provider_budget` (§22, §23). */
  BRAVE_API_KEY: optionalSecret,
  /** Groq — the AI explanation layer, always optional (§25). */
  GROQ_API_KEY: optionalSecret,

  /** Daily allowances, configurable without redeploying logic (§33). */
  GUEST_QUICK_LIMIT: optionalNumber(5),
  GUEST_DEEP_LIMIT: optionalNumber(1),
  USER_QUICK_LIMIT: optionalNumber(25),
  USER_DEEP_LIMIT: optionalNumber(5),

  /**
   * Hard ceiling on metered web-search requests per calendar month. Brave's
   * free allowance is roughly 1,000, so this defaults below it: exhausting the
   * budget must degrade the product, never produce a bill.
   */
  WEB_SEARCH_MONTHLY_BUDGET: optionalNumber(900),

  /** Contact address sent in User-Agent to APIs that require one (SEC EDGAR). */
  CONTACT_EMAIL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email().optional(),
  ),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

/**
 * Parse and cache the environment.
 *
 * Throws only on a value that is present but malformed — a missing optional key
 * is a normal, supported state.
 */
export function env(): Env {
  if (cached === undefined) {
    const parsed = EnvSchema.safeParse(process.env)
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      throw new Error(`Invalid environment configuration — ${detail}`)
    }
    cached = parsed.data
  }
  return cached
}

/** Reset the cache. Test-only. */
export function resetEnvCache(): void {
  cached = undefined
}

/** User-Agent sent on every outbound request, as good API citizenship. */
export function userAgent(): string {
  const contact = env().CONTACT_EMAIL
  return contact === undefined
    ? 'NameVetta/0.1 (+https://namevetta.app)'
    : `NameVetta/0.1 (+https://namevetta.app; ${contact})`
}
