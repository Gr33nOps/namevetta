import 'server-only'

/**
 * Scan persistence.
 *
 * Writes go through the service client because the orchestrator is a trusted
 * server process and guest scans have no authenticated identity to satisfy RLS
 * with. Reads that act on behalf of a signed-in user go through the RLS client
 * instead, so the database — not this file — is the final authority on access.
 *
 * Every write is best-effort: **persistence failure must never fail a scan.**
 * The research is the product; storing it is a convenience, and a database
 * hiccup should cost a user their history, not their results.
 */
import type { ScanContext } from '@/lib/core/scan'
import type { SourceResult } from '@/lib/core/types'
import type { ScanSummary } from '@/lib/orchestrator/run'
import { verdictFor } from '@/lib/scoring/viability'
import { normalize } from '@/lib/similarity/normalize'
import { isDatabaseConfigured, serviceClient } from './client'
import type { Subject } from './identity'

export interface CreatedScan {
  id: string
}

/** Create the scan row. Returns undefined when persistence is unavailable. */
export async function createScan(
  ctx: ScanContext,
  subject: Subject,
): Promise<CreatedScan | undefined> {
  if (!isDatabaseConfigured()) return undefined

  const { data, error } = await serviceClient()
    .from('scans')
    .insert({
      user_id: subject.type === 'user' ? subject.id : null,
      guest_hash: subject.type === 'guest' ? subject.id : null,
      name: ctx.name,
      normalized: normalize(ctx.name),
      category: ctx.category,
      description: ctx.description ?? null,
      scan_type: ctx.scanType,
      include_specialized: ctx.includeSpecialized === true,
      status: 'running',
    })
    .select('id')
    .single()

  if (error !== null || data === null) return undefined
  return { id: (data as { id: string }).id }
}

/**
 * Persist one source result plus its evidence and matches.
 *
 * Called as each source settles, which is what makes progressive results
 * survive a closed tab: the client can reconnect and read current state rather
 * than restarting the scan.
 */
export async function saveSourceResult(scanId: string, result: SourceResult): Promise<void> {
  if (!isDatabaseConfigured()) return
  const db = serviceClient()

  const { data, error } = await db
    .from('source_results')
    .upsert(
      {
        scan_id: scanId,
        source: result.source,
        status: result.status,
        confidence: result.confidence,
        error_code: result.error?.code ?? null,
        error_message: result.error?.message ?? null,
        error_retryable: result.error?.retryable ?? null,
        from_cache: result.fromCache,
        meta: result.meta ?? null,
        checked_at: result.checkedAt,
        expires_at: result.expiresAt,
      },
      { onConflict: 'scan_id,source' },
    )
    .select('id')
    .single()

  if (error !== null || data === null) return
  const resultId = (data as { id: number }).id

  if (result.evidence.length > 0) {
    await db.from('source_evidence').insert(
      result.evidence.map((e) => ({
        source_result_id: resultId,
        label: e.label,
        url: e.url ?? null,
        snippet: e.snippet ?? null,
        observed_at: e.observedAt,
      })),
    )
  }

  const matches = [
    ...result.exactMatches.map((m) => ({ match: m, exact: true })),
    ...result.similarMatches.map((m) => ({ match: m, exact: false })),
  ]

  if (matches.length > 0) {
    await db.from('similar_matches').insert(
      matches.map(({ match, exact }) => ({
        source_result_id: resultId,
        external_id: match.externalId,
        name: match.name,
        owner: match.owner ?? null,
        description: match.description ?? null,
        categories: match.categories,
        active: match.active ?? null,
        url: match.url ?? null,
        is_exact: exact,
        sim_text: match.similarity.text,
        sim_phonetic: match.similarity.phonetic,
        sim_visual: match.similarity.visual,
        // Left null when unknown. Defaulting it would fabricate the judgement
        // the product deliberately declines to guess at.
        sim_industry: match.similarity.industry ?? null,
        sim_overall: match.similarity.overall,
        severity: match.severity,
      })),
    )
  }
}

/**
 * Write the final report and mark the scan complete.
 *
 * Returns the report id so a caller can attach something to it afterwards —
 * today that is only the AI summary, written in a second step once the
 * (rate-limited, sometimes slow) explanation is ready, rather than holding up
 * `completeScan` itself.
 */
export async function completeScan(
  scanId: string,
  summary: ScanSummary,
): Promise<string | undefined> {
  if (!isDatabaseConfigured()) return undefined
  const db = serviceClient()

  const { data, error } = await db
    .from('reports')
    .upsert(
      {
        scan_id: scanId,
        digital_score: summary.viability.score,
        raw_score: summary.viability.rawScore,
        coverage: summary.coverage,
        verdict: verdictFor(summary.viability.score),
        scoring_version: summary.viability.scoringVersion,
      },
      { onConflict: 'scan_id' },
    )
    .select('id')
    .single()

  if (error === null && data !== null) {
    const reportId = (data as { id: string }).id

    await db.from('report_group_scores').upsert(
      summary.viability.groups.map((g) => ({
        report_id: reportId,
        group_name: g.group,
        subscore: g.subscore,
        weight: g.weight,
      })),
      { onConflict: 'report_id,group_name' },
    )

    if (summary.viability.caps.length > 0) {
      await db.from('report_caps').upsert(
        summary.viability.caps.map((c) => ({
          report_id: reportId,
          reason: c.reason,
          maximum: c.maximum,
        })),
        { onConflict: 'report_id,reason' },
      )
    }
  }

  await db
    .from('scans')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', scanId)

  return data === null ? undefined : (data as { id: string }).id
}

/**
 * Attach the AI explanation to a report, once generated.
 *
 * `grounded` is stored alongside the text so a future audit — or a support
 * question about a specific report — can see whether the shown summary passed
 * the grounding check outright or only on the retry, without needing to
 * reconstruct that from logs.
 */
export async function saveAiSummary(
  reportId: string,
  summary: string,
  model: string,
  grounded: boolean,
): Promise<void> {
  if (!isDatabaseConfigured()) return
  await serviceClient()
    .from('ai_summaries')
    .upsert(
      { report_id: reportId, summary, model, grounded },
      { onConflict: 'report_id' },
    )
}

/** Mark a scan failed so a reconnecting client is not left waiting forever. */
export async function failScan(scanId: string): Promise<void> {
  if (!isDatabaseConfigured()) return
  await serviceClient()
    .from('scans')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', scanId)
}

/** Retries allowed per scan before the "retry" button stops working (§4). */
export const MAX_SOURCE_RETRIES = 3

/**
 * Check ownership and count one retry against a scan's cap, atomically.
 *
 * A momentary network blip should not cost a user a full quota unit to see
 * fixed — but an uncapped retry would let the same free scan be re-run
 * indefinitely, so this is bounded and checked server-side rather than
 * trusted from the client.
 */
export async function canRetrySource(subject: Subject, scanId: string): Promise<boolean> {
  if (subject.type !== 'user') return false
  if (!isDatabaseConfigured()) return true

  const { data, error } = await serviceClient().rpc('increment_scan_retry', {
    p_scan_id: scanId,
    p_subject_type: subject.type,
    p_subject_id: subject.id,
    p_max_retries: MAX_SOURCE_RETRIES,
  })
  if (error !== null) return false
  return data === true
}
