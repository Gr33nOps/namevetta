import 'server-only'

/**
 * The effective allowance, after the environment has had its say.
 *
 * Split out of `db/quota.ts` so a page can ask what the limits are without
 * pulling in a database client to find out. `db/quota.ts` still owns
 * *spending* allowance; this owns *stating* it, and both read the same
 * function so the number the homepage prints is the number the scan route
 * enforces.
 */
import { DEFAULT_QUOTA_LIMITS, type QuotaLimits, type SubjectKind } from '@/lib/core/quota'
import { env } from '@/lib/env'

/** Both tiers, as configured. The single source every quota string derives from. */
export function effectiveLimits(): Record<SubjectKind, QuotaLimits> {
  const e = env()
  return {
    guest: {
      quick: e.GUEST_QUICK_LIMIT,
      deep: e.GUEST_DEEP_LIMIT,
      generate: e.GUEST_GENERATE_LIMIT,
    },
    user: {
      quick: e.USER_QUICK_LIMIT,
      deep: e.USER_DEEP_LIMIT,
      generate: e.USER_GENERATE_LIMIT,
    },
  }
}

/** One tier. */
export function limitsForKind(kind: SubjectKind): QuotaLimits {
  return effectiveLimits()[kind]
}

export { DEFAULT_QUOTA_LIMITS }
export type { QuotaLimits, SubjectKind }
