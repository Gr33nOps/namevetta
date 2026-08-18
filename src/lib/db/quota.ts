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

/**
 * What's being metered.
 *
 * A superset of `ScanType`: `generate` is not a property of any one scan —
 * one generator run issues ~30 Quick Check scans internally — it is its own
 * kind of allowance, tracked in its own `daily_usage` column.
 */
export type QuotaKind = ScanType | 'generate'

export interface QuotaLimits {
  quick: number
  deep: number
  generate: number
}

export function limitsFor(subject: Subject): QuotaLimits {
  const e = env()
  return subject.type === 'user'
    ? { quick: e.USER_QUICK_LIMIT, deep: e.USER_DEEP_LIMIT, generate: e.USER_GENERATE_LIMIT }
    : { quick: e.GUEST_QUICK_LIMIT, deep: e.GUEST_DEEP_LIMIT, generate: e.GUEST_GENERATE_LIMIT }
}

function limitFor(limits: QuotaLimits, kind: QuotaKind): number {
  if (kind === 'deep') return limits.deep
  if (kind === 'generate') return limits.generate
  return limits.quick
}

function labelFor(kind: QuotaKind): string {
  if (kind === 'deep') return 'Deep Research'
  if (kind === 'generate') return 'name generation'
  return 'Quick Check'
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
  kind: QuotaKind,
): Promise<QuotaDecision> {
  const limits = limitsFor(subject)
  const limit = limitFor(limits, kind)

  const { data, error } = await serviceClient().rpc('consume_quota', {
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_scan_type: kind,
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
    const label = labelFor(kind)
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
): Promise<{ quick: number; deep: number; generate: number }> {
  const limits = limitsFor(subject)
  const { data, error } = await serviceClient().rpc('remaining_quota', {
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_quick_limit: limits.quick,
    p_deep_limit: limits.deep,
    p_generate_limit: limits.generate,
  })

  if (error !== null || !Array.isArray(data) || data.length === 0) {
    return limits
  }

  const row = data[0] as {
    quick_remaining?: number
    deep_remaining?: number
    generate_remaining?: number
  }
  return {
    quick: row.quick_remaining ?? limits.quick,
    deep: row.deep_remaining ?? limits.deep,
    generate: row.generate_remaining ?? limits.generate,
  }
}

/**
 * Consume one unit of a metered provider's monthly budget.
 *
 * Returns false when exhausted, at which point the caller reports the source as
 * `unable_to_verify` rather than making the call. This is the hard stop that
 * keeps a free tier free.
 */
export async function consumeProviderBudget(provider: string, limit: number): Promise<boolean> {
  const { data, error } = await serviceClient().rpc('consume_provider_budget', {
    p_provider: provider,
    p_limit: limit,
  })
  if (error !== null) return false
  return typeof data === 'number' && data >= 0
}
