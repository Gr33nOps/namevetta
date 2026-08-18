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
import { ScanContextSchema } from '@/lib/core/scan'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { consumeQuota } from '@/lib/db/quota'
import { completeScan, createScan, failScan, saveSourceResult } from '@/lib/db/scans'
import { runScan } from '@/lib/orchestrator/run'

/**
 * Fluid compute allows up to 300s on Hobby. Sources are individually bounded
 * well below that; this is the outer backstop only.
 */
export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 })
  }

  const parsed = ScanContextSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    )
  }
  const ctx = parsed.data

  // ── quota ────────────────────────────────────────────────────────────────
  let scanId: string | undefined

  if (isDatabaseConfigured()) {
    // Accounts arrive with Phase 4b; until then every requester is a guest.
    const subject = identifySubject(req.headers, undefined)

    if (subject === undefined) {
      // No session and no usable address means no way to enforce a limit.
      // Refusing is the only honest option — the alternative is an unlimited
      // free tier for anyone who can strip a header.
      return Response.json(
        { error: 'Could not identify the request for usage limiting.' },
        { status: 400 },
      )
    }

    const decision = await consumeQuota(subject, ctx.scanType)
    if (!decision.allowed) {
      return Response.json(
        { error: decision.message ?? 'Daily limit reached.' },
        { status: 429 },
      )
    }

    scanId = (await createScan(ctx, subject))?.id
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      }

      try {
        for await (const event of runScan(ctx, {
          log: (name, data) => {
            // Structured logs only — never the raw query, so scan contents stay
            // out of server logs by default (§28).
            console.log(JSON.stringify({ event: name, ...data }))
          },
        })) {
          if (scanId !== undefined) {
            // Persistence is best-effort: a write failure costs the user their
            // history, never their results.
            if (event.type === 'source') {
              void saveSourceResult(scanId, event.result).catch(() => {})
            } else if (event.type === 'complete') {
              void completeScan(scanId, event.summary).catch(() => {})
            }
          }
          send(event)
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
      'cache-control': 'no-store, no-transform',
      // Disable proxy buffering so events actually arrive incrementally.
      'x-accel-buffering': 'no',
    },
  })
}
