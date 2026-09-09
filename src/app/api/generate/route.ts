/**
 * The name generator endpoint (§12).
 *
 * Generate, reject occupied domains, research survivors, and refill until four
 * names pass. One streamed request consumes one generation quota unit.
 */
import { GenerateRequestSchema } from '@/lib/core/scan'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { identifySubject } from '@/lib/db/identity'
import { consumeQuota } from '@/lib/db/quota'
import { generateShortlist } from '@/lib/generator/shortlist'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
const API_NO_STORE = 'no-store, no-transform'

function apiError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': API_NO_STORE } })
}

export function GET(): Response {
  return Response.json(
    { error: 'Use POST to generate names.' },
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

  const parsed = GenerateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid request', 400)
  }
  const { category, description, includeSpecialized, seed } = parsed.data

  // One 'generate' unit, regardless of how many candidates end up being
  // researched — the cost of a run is fixed from the caller's point of view,
  // the same way one Deep Check costs one unit no matter how many sources it
  // happens to query underneath.
  if (isDatabaseConfigured()) {
    const user = await currentUser()
    const subject = identifySubject(req.headers, user?.id)
    if (subject === undefined) {
      return apiError('Could not identify the request for usage limiting.', 400)
    }

    const decision = await consumeQuota(subject, 'generate')
    if (!decision.allowed) {
      return apiError(decision.message ?? 'Daily limit reached.', 429)
    }
  }

  const encoder = new TextEncoder()
  const abort = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    cancel() { abort.abort() },
    async start(controller) {
      const send = (value: unknown): void => {
        if (abort.signal.aborted) return
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      }

      try {
        send({ type: 'generating' })

        const outcome = await generateShortlist({
          category, description, seed,
          signal: AbortSignal.any([abort.signal, req.signal]),
          ...(includeSpecialized ? { includeSpecialized: true } : {}),
          onProgress: (progress) => { send({ type: 'screening' }); send({ type: 'progress', ...progress }) },
        })
        if (outcome.status === 'ready') send({ type: 'result', ranked: outcome.ranked })
        else send({ type: 'error', message: outcome.message })
      } catch {
        send({
          type: 'error',
          message: 'Name generation could not finish. Please try again.',
        })
      } finally {
        if (!abort.signal.aborted) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': API_NO_STORE,
      'x-accel-buffering': 'no',
    },
  })
}
