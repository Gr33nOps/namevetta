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
import { DEFAULT_QUOTA_LIMITS } from '@/lib/core/quota'

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
  /**
   * Tavily web search — metered, guarded by `provider_budget` (§22, §23).
   *
   * Chosen over Brave because Tavily's free tier requires **no card on file**,
   * so there is no path by which this product can begin costing money.
   * Server-side only: never prefixed NEXT_PUBLIC_, never logged.
   */
  TAVILY_API_KEY: optionalSecret,
  /** Groq — the AI explanation layer, always optional (§25). */
  GROQ_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().trim().regex(/^[a-zA-Z0-9.-]+$/).default('gemini-3.8-flash'),
  /**
   * Sentry — server-side error tracking. Optional, free tier, no card.
   * Its client counterpart, `NEXT_PUBLIC_SENTRY_DSN`, is read directly in
   * `instrumentation-client.ts` for the same reason the Turnstile site key
   * is read directly rather than through this server-only accessor.
   */
  SENTRY_DSN: optionalSecret,
  /**
   * Cloudflare Turnstile — bot protection on account creation.
   *
   * Optional, like everything else here. Its counterpart,
   * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, is not secret and is read directly where
   * it's needed rather than through this server-only accessor, since a
   * client component must be able to see it.
   */
  TURNSTILE_SECRET_KEY: optionalSecret,
  /**
   * Companies House (UK) — free registry API key.
   *
   * Worth having: it is the only source that reports a *declared* industry
   * (SIC codes) rather than one we infer from free text, and industry
   * relevance is what keeps a same-field conflict separate from a coincidence.
   */
  COMPANIES_HOUSE_API_KEY: optionalSecret,

  /**
   * Daily allowances, configurable without redeploying logic (§33).
   *
   * The fallbacks are not written out here: they come from
   * `DEFAULT_QUOTA_LIMITS`, which is also what every piece of user-facing copy
   * reads. Two copies of "75" — one the server enforces and one the homepage
   * prints — is how the site ended up telling three different stories about
   * the same allowance.
   */
  GUEST_QUICK_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.guest.quick),
  GUEST_DEEP_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.guest.deep),
  USER_QUICK_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.user.quick),
  USER_DEEP_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.user.deep),
  GUEST_GENERATE_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.guest.generate),
  USER_GENERATE_LIMIT: optionalNumber(DEFAULT_QUOTA_LIMITS.user.generate),

  /**
   * Hard ceiling on web-search **credits** per calendar month.
   *
   * Tavily's free tier is 1,000 credits and a basic search costs one, so this
   * default stops well short of the allowance. Exhausting the budget must
   * degrade the product, never produce a bill — pay-as-you-go is never enabled.
   */
  WEB_SEARCH_MONTHLY_BUDGET: optionalNumber(900),

  /**
   * Hard ceiling on Groq **completions** per calendar month.
   *
   * Groq's measured free-tier ceiling is 1,000 requests/day — a monthly figure
   * doesn't map onto that daily reset directly, so this is set well below the
   * naive product (30,000) to leave real headroom against an uneven day. A
   * summary is generated once per report and cached by report hash, so actual
   * spend sits far below either number in practice.
   */
  AI_MONTHLY_BUDGET: optionalNumber(6000),

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
