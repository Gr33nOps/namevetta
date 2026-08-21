/**
 * Streaming scan endpoint.
 *
 * Emits newline-delimited JSON, one `ScanEvent` per line, so the client renders
 * each source the moment it lands (§58).
 *
 * Persistence and quota enforcement are both **optional at runtime**. With no
 * database configured the route still researches names — it simply cannot
 * remember them or count usage. That keeps local development and a
 * credential-less deploy working, and it means a database outage degrades the
 * product rather than taking it down.
 */
import { generateSummary } from '@/lib/ai/summarize'
import { ScanContextSchema } from '@/lib/core/scan'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { consumeQuota } from '@/lib/db/quota'
import { completeScan, createScan, failScan, saveAiSummary, saveSourceResult } from '@/lib/db/scans'
import { runScan, type ScanSummary } from '@/lib/orchestrator/run'

/**
 * Fluid compute allows up to 300s on Hobby. Sources are individually bounded
 * well below that; this is the outer backstop only.
 */
export const maxDuration = 120
export const dynamic = 'force-dynamic'
const API_NO_STORE = 'no-store, no-transform'

function apiError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': API_NO_STORE } })
}

export function GET(): Response {
  return Response.json(
    { error: 'Use POST to start a scan.' },
    { status: 405, headers: { allow: 'POST, OPTIONS', 'cache-control': API_NO_STORE } },
  )
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS', 'cache-control': API_NO_STORE } })
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Request body must be JSON', 400)
  }

  const parsed = ScanContextSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid request', 400)
  }
  const ctx = parsed.data

  // ── quota ────────────────────────────────────────────────────────────────
  let scanId: string | undefined

  if (isDatabaseConfigured()) {
    // A signed-in user gets their own identity, and with it the larger daily
    // allowance and history that an account is for.
    const user = await currentUser()
    const subject = identifySubject(req.headers, user?.id)

    if (subject === undefined) {
      // No session and no usable address means no way to enforce a limit.
      // Refusing is the only honest option — the alternative is an unlimited
      // free tier for anyone who can strip a header.
      return apiError('Could not identify the request for usage limiting.', 400)
    }

    const decision = await consumeQuota(subject, ctx.scanType)
    if (!decision.allowed) {
      return apiError(decision.message ?? 'Daily limit reached.', 429)
    }

    scanId = (await createScan(ctx, subject))?.id
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      }

      let completedSummary: ScanSummary | undefined
      let completedReportId: string | undefined

      try {
        for await (const event of runScan(ctx, {
          log: (name, data) => {
            // Structured logs only — never the raw query, so scan contents stay
            // out of server logs by default (§28).
            console.log(JSON.stringify({ event: name, ...data }))
          },
        })) {
          if (scanId !== undefined && event.type === 'source') {
            // Persistence is best-effort: a write failure costs the user their
            // history, never their results.
            void saveSourceResult(scanId, event.result).catch(() => {})
          }
          if (event.type === 'complete') {
            completedSummary = event.summary
            if (scanId !== undefined) {
              completedReportId = await completeScan(scanId, event.summary).catch(() => undefined)
            }
          }
          // The `started` event carries the scan id when persistence produced
          // one, so the client can later ask to retry a single source without
          // spending a new quota unit — the id is otherwise never sent to the
          // browser, since nothing else needs it.
          send(event.type === 'started' && scanId !== undefined ? { ...event, scanId } : event)
        }

        // A separate step after `complete`, deliberately. The report the user
        // came for is already on screen; the explanation is the slow,
        // rate-limited part, and it must never hold up the score or evidence —
        // only Deep Check pays for it, since a five-source Quick Check does not
        // carry enough evidence to explain.
        if (ctx.scanType === 'deep' && completedSummary !== undefined) {
          const outcome = await generateSummary(ctx, completedSummary)
          send({ type: 'ai_summary', summary: outcome })
          if (outcome.status === 'ready' && completedReportId !== undefined) {
            void saveAiSummary(completedReportId, outcome.text, outcome.model, true).catch(() => {})
          }
        }
      } catch (cause) {
        // The orchestrator is built not to throw, so reaching here is a bug.
        // Tell the client plainly rather than truncating the stream and leaving
        // the UI waiting forever.
        if (scanId !== undefined) void failScan(scanId).catch(() => {})
        send({
          type: 'error',
          message: cause instanceof Error ? cause.message : 'The scan failed unexpectedly.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': API_NO_STORE,
      // Disable proxy buffering so events actually arrive incrementally.
      'x-accel-buffering': 'no',
    },
  })
}
