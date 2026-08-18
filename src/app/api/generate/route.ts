/**
 * The name generator endpoint (§12).
 *
 * "Generate ~30, auto Quick Check, discard failures, return top 5" as a single
 * streamed request: names arrive from Groq, then each is researched with a
 * Quick Check exactly like a standalone search, in the same sequential order
 * `/api/compare` uses and for the same reason — parallel would fire a burst of
 * simultaneous requests at every source, which is what the per-source rate
 * limiters exist to prevent, and here there can be six times as many
 * candidates as a comparison ever has.
 */
import { CATEGORY_LABELS, GenerateRequestSchema } from '@/lib/core/scan'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { consumeQuota } from '@/lib/db/quota'
import { generateNames } from '@/lib/generator/namegen'
import { disqualificationReason, screenCandidates } from '@/lib/generator/screen'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 })
  }

  const parsed = GenerateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 },
    )
  }
  const { category, description, seed } = parsed.data

  // One 'generate' unit, regardless of how many candidates end up being
  // researched — the cost of a run is fixed from the caller's point of view,
  // the same way one Deep Check costs one unit no matter how many sources it
  // happens to query underneath.
  if (isDatabaseConfigured()) {
    const user = await currentUser()
    const subject = identifySubject(req.headers, user?.id)
    if (subject === undefined) {
      return Response.json(
        { error: 'Could not identify the request for usage limiting.' },
        { status: 400 },
      )
    }

    const decision = await consumeQuota(subject, 'generate')
    if (!decision.allowed) {
      return Response.json({ error: decision.message ?? 'Daily limit reached.' }, { status: 429 })
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      }

      try {
        send({ type: 'generating' })

        const generated = await generateNames(CATEGORY_LABELS[category], description, seed)
        if (generated.status === 'unavailable') {
          send({ type: 'error', message: generated.reason })
          return
        }
        send({ type: 'names_ready', names: generated.names })

        const { survivors, disqualified, ranked } = await screenCandidates({
          names: generated.names,
          category,
          description,
          onCandidate: (name, summary) => {
            send({
              type: 'candidate_complete',
              name,
              score: summary.viability.score,
              disqualified: disqualificationReason(summary) !== undefined,
            })
          },
        })

        send({
          type: 'result',
          ranked,
          survivorCount: survivors.length,
          disqualifiedCount: disqualified.length,
          disqualified,
        })
      } catch (cause) {
        send({
          type: 'error',
          message: cause instanceof Error ? cause.message : 'Name generation failed unexpectedly.',
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
