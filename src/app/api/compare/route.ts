/**
 * Comparison endpoint.
 *
 * Runs each candidate through the same orchestrator a single scan uses, so a
 * compared name is researched exactly as thoroughly as one researched alone —
 * no shortcuts that would make the two paths disagree.
 *
 * Candidates run **sequentially**, not in parallel. Five names in parallel would
 * fire five simultaneous requests at every source, which is precisely the burst
 * the per-source rate limiters exist to prevent. Sequential is slower and is the
 * behaviour a well-behaved API client owes its upstreams.
 */
import { CompareRequestSchema } from '@/lib/core/scan'
import { compareCandidates, type Candidate } from '@/lib/compare/rank'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { consumeQuota } from '@/lib/db/quota'
import { runScan } from '@/lib/orchestrator/run'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 })
  }

  const parsed = CompareRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    )
  }
  const { names, category, description, scanType } = parsed.data

  // Comparing N names is N separate pieces of research, so it costs N units of
  // allowance. Charging one would let a user get five scans for the price of
  // one simply by using a different form.
  if (isDatabaseConfigured()) {
    const subject = identifySubject(req.headers, undefined)
    if (subject === undefined) {
      return Response.json(
        { error: 'Could not identify the request for usage limiting.' },
        { status: 400 },
      )
    }

    for (let i = 0; i < names.length; i++) {
      const decision = await consumeQuota(subject, scanType)
      if (!decision.allowed) {
        return Response.json(
          {
            error:
              i === 0
                ? (decision.message ?? 'Daily limit reached.')
                : `Comparing ${names.length} names needs ${names.length} checks and you have ${i} left today. Try comparing fewer names.`,
          },
          { status: 429 },
        )
      }
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      }

      try {
        send({ type: 'started', names })
        const candidates: Candidate[] = []

        for (const name of names) {
          send({ type: 'candidate_started', name })

          for await (const event of runScan(
            {
              name,
              category,
              scanType,
              ...(description === undefined ? {} : { description }),
            },
            {
              log: (evt, data) => {
                console.log(JSON.stringify({ event: evt, ...data }))
              },
            },
          )) {
            // Tag every event with its candidate so the client can attribute
            // progress to the right column.
            if (event.type === 'source') {
              send({ type: 'candidate_source', name, result: event.result })
            } else if (event.type === 'complete') {
              candidates.push({ name, summary: event.summary })
              send({ type: 'candidate_complete', name, summary: event.summary })
            }
          }
        }

        send({ type: 'comparison', result: compareCandidates(candidates) })
      } catch (cause) {
        send({
          type: 'error',
          message:
            cause instanceof Error ? cause.message : 'The comparison failed unexpectedly.',
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
      'x-accel-buffering': 'no',
    },
  })
}
