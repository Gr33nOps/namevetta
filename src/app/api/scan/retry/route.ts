/**
 * Retry one source that could not be verified, without spending a quota unit.
 *
 * `SourceCard` already tells the user "this source can be retried" — this is
 * what makes that true. A transient rate limit or a momentary upstream outage
 * should not permanently cap a report's coverage; the alternative today is
 * spending a whole new Quick Check or Deep Check just to re-ask the one
 * source that hiccuped.
 *
 * The client sends back the full results array it already holds (the same
 * shape `ScanRunner` keeps in state) rather than a scan id alone, so this
 * works identically whether or not persistence is configured — consistent
 * with the rest of the product's "every credential is optional" posture.
 * When a scan id *is* supplied and the database is configured, the retry is
 * additionally capped per scan and the persisted report is refreshed.
 */
import { z } from 'zod'
import { ScanContextSchema } from '@/lib/core/scan'
import { isVerified, SourceIdSchema, SourceResultSchema, type SourceId } from '@/lib/core/types'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { canRetrySource, completeScan, saveSourceResult } from '@/lib/db/scans'
import { classifyScanContext } from '@/lib/industry/enrich'
import { runSource } from '@/lib/orchestrator/run'
import { computeCoverage } from '@/lib/scoring/confidence'
import { computeViability } from '@/lib/scoring/viability'
import { weightsFor } from '@/lib/scoring/weights'
import { sourcesFor } from '@/lib/core/adapter'
import type { SourceResult } from '@/lib/core/types'

export const maxDuration = 30
export const dynamic = 'force-dynamic'
const API_NO_STORE = 'no-store, no-transform'

function apiError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': API_NO_STORE } })
}

export function GET(): Response {
  return Response.json(
    { error: 'Use POST to retry a source.' },
    { status: 405, headers: { allow: 'POST, OPTIONS', 'cache-control': API_NO_STORE } },
  )
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS', 'cache-control': API_NO_STORE } })
}

const RetryRequestSchema = z.object({
  context: ScanContextSchema,
  results: z.array(SourceResultSchema),
  source: SourceIdSchema,
  scanId: z.string().min(1).optional(),
})

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Request body must be JSON', 400)
  }

  const parsed = RetryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid request', 400)
  }
  const { context, results, source, scanId } = parsed.data

  if (!sourcesFor(context.scanType).some((s) => s.id === source)) {
    return apiError('That source is not part of this scan.', 400)
  }

  const existing = results.find((r) => r.source === source)
  if (existing === undefined || isVerified(existing.status)) {
    return apiError('Only a source that could not be verified can be retried.', 400)
  }

  if (scanId !== undefined && isDatabaseConfigured()) {
    const user = await currentUser()
    const subject = identifySubject(req.headers, user?.id)
    if (subject === undefined) {
      return apiError('Could not identify the request for retry limiting.', 400)
    }
    const allowed = await canRetrySource(subject, scanId)
    if (!allowed) {
      return apiError('This report has already used its retries, or is not yours to retry.', 429)
    }
  }

  const scanClassification = classifyScanContext(context)
  const parent = new AbortController()

  // `runSource` already enriches with industry relevance internally (the
  // orchestrator's normal path), so its output is used as-is.
  const result: SourceResult = await runSource(
    source as SourceId,
    context,
    scanClassification,
    parent.signal,
  )

  const newResults = results.map((r) => (r.source === source ? result : r))
  const viability = computeViability({ category: context.category, results: newResults })
  const coverage = computeCoverage({
    intended: newResults.map((r) => r.source),
    results: new Map(newResults.map((r) => [r.source, r])),
    weights: weightsFor(context.category),
  })

  if (scanId !== undefined && isDatabaseConfigured()) {
    void saveSourceResult(scanId, result).catch(() => {})
    void completeScan(scanId, { results: newResults, viability, coverage }).catch(() => {})
  }

  return Response.json(
    { result, summary: { results: newResults, viability, coverage } },
    { headers: { 'cache-control': API_NO_STORE } },
  )
}
