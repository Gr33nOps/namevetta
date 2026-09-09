import 'server-only'

/**
 * Daily usage limits (§29, §30, §33).
 *
 * The numbers themselves live in `@/lib/core/quota` and are read through
 * `@/lib/quota`, which is also where every visible quota string gets them —
 * this module spends allowance, it does not define it. Deliberately: this file
 * used to carry a docstring quoting figures the environment had long since
 * moved past, and the site printed those stale figures on three pages.
 *
 * Only *fresh research* consumes quota. Reopening a report, viewing cached
 * results, saved names, history and sharing are all unlimited (§31), which is
 * enforced by the fact that nothing but the scan route calls `consumeQuota`.
 */
import type { ScanType } from '@/lib/core/scan'
import { QUOTA_LABELS, type QuotaLimits } from '@/lib/core/quota'
import { effectiveLimits } from '@/lib/quota'
import { serviceClient } from './client'
import type { Subject } from './identity'

/**
 * What's being metered.
 *
 * A superset of `ScanType`: `generate` is not a property of any one scan —
 * one generator run issues several Quick Check scans internally — it is its own
 * kind of allowance, tracked in its own `daily_usage` column.
 */
export type QuotaKind = ScanType | 'generate'

export type { QuotaLimits }

export function limitsFor(subject: Subject): QuotaLimits {
  return effectiveLimits()[subject.type === 'user' ? 'user' : 'guest']
}

function limitFor(limits: QuotaLimits, kind: QuotaKind): number {
  if (kind === 'deep') return limits.deep
  if (kind === 'generate') return limits.generate
  return limits.quick
}

function labelFor(kind: QuotaKind): string {
  if (kind === 'deep') return QUOTA_LABELS.deep
  if (kind === 'generate') return QUOTA_LABELS.generate
  return QUOTA_LABELS.quick
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
    const runs = `${limit} ${label} ${limit === 1 ? 'run' : 'runs'}`
    /*
      The offer names the account limit rather than saying "more". A visitor
      deciding whether to sign up is owed the number they would be signing up
      for, and it comes from the same configuration that just refused them.

      And it is only made when it is true: a deployment can configure a guest
      allowance at or above the account one, and pitching an upgrade that
      isn't one is the same class of dishonesty as the stale copy this whole
      change exists to remove.
    */
    const accountLimit = limitFor(effectiveLimits().user, kind)
    const worthAnAccount = subject.type === 'guest' && accountLimit > limit
    return {
      allowed: false,
      remaining: 0,
      limit,
      message: worthAnAccount
        ? `You have used today's ${runs}. A free account raises that to ${accountLimit} a day, or come back tomorrow.`
        : `You have used today's ${runs}. Your allowance resets tomorrow.`,
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
