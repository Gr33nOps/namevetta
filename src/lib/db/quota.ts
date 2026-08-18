import 'server-only'

/**
 * Daily usage limits (§29, §30, §33).
 *
 * Guests get 5 Quick / 1 Deep per day; accounts get 25 / 5. Per day, not total.
 * Limits come from the environment so they can be retuned without redeploying
 * logic — §33 asks for exactly that, and the Brave budget makes it necessary.
 *
 * Only *fresh research* consumes quota. Reopening a report, viewing cached
 * results, saved names, history and sharing are all unlimited (§31), which is
 * enforced by the fact that nothing but the scan route calls `consumeQuota`.
 */
import { env } from '@/lib/env'
import type { ScanType } from '@/lib/core/scan'
import { serviceClient } from './client'
import type { Subject } from './identity'

export interface QuotaLimits {
  quick: number
  deep: number
}

export function limitsFor(subject: Subject): QuotaLimits {
  const e = env()
  return subject.type === 'user'
    ? { quick: e.USER_QUICK_LIMIT, deep: e.USER_DEEP_LIMIT }
    : { quick: e.GUEST_QUICK_LIMIT, deep: e.GUEST_DEEP_LIMIT }
}

export interface QuotaDecision {
  allowed: boolean
  remaining: number
  limit: number
  /** Shown to the user when refused. */
  message?: string
}

/**
 * Consume one unit of allowance.
 *
 * Delegates to the `consume_quota` SQL function, which does the check and the
 * increment atomically. Doing it here as read-then-write would let two
 * concurrent scans both see "4 of 5 used" and both proceed.
 */
export async function consumeQuota(
  subject: Subject,
  scanType: ScanType,
): Promise<QuotaDecision> {
  const limits = limitsFor(subject)
  const limit = scanType === 'deep' ? limits.deep : limits.quick

  const { data, error } = await serviceClient().rpc('consume_quota', {
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_scan_type: scanType,
    p_limit: limit,
  })

  if (error !== null) {
    // Fail closed. If we cannot account for usage we do not hand out research —
    // an outage in the quota path must not become an unlimited free tier.
    return {
      allowed: false,
      remaining: 0,
      limit,
      message: 'Usage limits are temporarily unavailable. Please try again shortly.',
    }
  }

  const remaining = typeof data === 'number' ? data : -1
  if (remaining < 0) {
    const label = scanType === 'deep' ? 'Deep Research' : 'Quick Check'
    return {
      allowed: false,
      remaining: 0,
      limit,
      message:
        subject.type === 'guest'
          ? `You have used today's ${limit} free ${label} ${limit === 1 ? 'run' : 'runs'}. Create a free account for more, or come back tomorrow.`
          : `You have used today's ${limit} ${label} ${limit === 1 ? 'run' : 'runs'}. Your allowance resets tomorrow.`,
    }
  }

  return { allowed: true, remaining, limit }
}

/** Read remaining allowance without consuming any. */
export async function remainingQuota(
  subject: Subject,
): Promise<{ quick: number; deep: number }> {
  const limits = limitsFor(subject)
  const { data, error } = await serviceClient().rpc('remaining_quota', {
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_quick_limit: limits.quick,
    p_deep_limit: limits.deep,
  })

  if (error !== null || !Array.isArray(data) || data.length === 0) {
    return { quick: limits.quick, deep: limits.deep }
  }

  const row = data[0] as { quick_remaining?: number; deep_remaining?: number }
  return {
    quick: row.quick_remaining ?? limits.quick,
    deep: row.deep_remaining ?? limits.deep,
  }
}

/**
 * Consume one unit of a metered provider's monthly budget.
 *
 * Returns false when exhausted, at which point the caller reports the source as
 * `unable_to_verify` rather than making the call. This is the hard stop that
 * keeps a free tier free.
 */
export async function consumeProviderBudget(provider: string): Promise<boolean> {
  const { data, error } = await serviceClient().rpc('consume_provider_budget', {
    p_provider: provider,
    p_limit: env().WEB_SEARCH_MONTHLY_BUDGET,
  })
  if (error !== null) return false
  return typeof data === 'number' && data >= 0
}
