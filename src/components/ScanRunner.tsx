'use client'

import { useEffect, useMemo, useReducer } from 'react'
import { Report, type ReportData } from '@/components/Report'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST, sourcesFor } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceId, SourceResult } from '@/lib/core/types'
import type { AiSummaryEvent, ScanEvent, ScanSummary } from '@/lib/orchestrator/run'
import { STATUS_PRESENTATION } from '@/lib/presentation'

type SourcePhase =
  | { phase: 'pending' }
  | { phase: 'done'; result: SourceResult }

interface State {
  phases: Record<string, SourcePhase>
  summary: ScanSummary | undefined
  aiSummary: AiSummaryEvent | undefined
  error: string | undefined
  scanId: string | undefined
  retrying: Set<SourceId>
  retryError: string | undefined
}

type Action =
  | { type: 'reset'; sources: SourceId[] }
  | { type: 'scanId'; scanId: string }
  | { type: 'source'; result: SourceResult }
  | { type: 'complete'; summary: ScanSummary }
  | { type: 'ai_summary'; summary: AiSummaryEvent }
  | { type: 'error'; message: string }
  | { type: 'retry_start'; source: SourceId }
  | { type: 'retry_done'; source: SourceId; summary: ScanSummary }
  | { type: 'retry_failed'; source: SourceId; message: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return {
        phases: Object.fromEntries(action.sources.map((id) => [id, { phase: 'pending' as const }])),
        summary: undefined,
        aiSummary: undefined,
        error: undefined,
        scanId: undefined,
        retrying: new Set(),
        retryError: undefined,
      }
    case 'scanId':
      return { ...state, scanId: action.scanId }
    case 'source':
      return {
        ...state,
        phases: { ...state.phases, [action.result.source]: { phase: 'done', result: action.result } },
      }
    case 'complete':
      return { ...state, summary: action.summary }
    case 'ai_summary':
      return { ...state, aiSummary: action.summary }
    case 'error':
      return { ...state, error: action.message }
    case 'retry_start': {
      const retrying = new Set(state.retrying)
      retrying.add(action.source)
      return { ...state, retrying, retryError: undefined }
    }
    case 'retry_done': {
      const retrying = new Set(state.retrying)
      retrying.delete(action.source)
      return { ...state, retrying, summary: action.summary }
    }
    case 'retry_failed': {
      const retrying = new Set(state.retrying)
      retrying.delete(action.source)
      return { ...state, retrying, retryError: action.message }
    }
  }
}

/**
 * Drives a scan and renders progress, then the report.
 *
 * Consumes the NDJSON event stream from `/api/scan`, applying each event as it
 * arrives (§58). Phase 4 swaps this transport for a Supabase Realtime
 * subscription; the reducer and the rendering below stay as they are, because
 * both consume the same `ScanEvent` shape.
 */
export function ScanRunner({ context }: { context: ScanContext }) {
  const order = useMemo(() => sourcesFor(context.scanType).map((s) => s.id), [context.scanType])

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    phases: {},
    summary: undefined,
    aiSummary: undefined,
    error: undefined,
    scanId: undefined,
    retrying: new Set<SourceId>(),
    retryError: undefined,
  }))

  useEffect(() => {
    const controller = new AbortController()
    dispatch({ type: 'reset', sources: order })

    const run = async (): Promise<void> => {
      let response: Response
      try {
        response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(context),
          signal: controller.signal,
        })
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: 'error', message: 'Could not reach the server. Check your connection.' })
        }
        return
      }

      if (!response.ok || response.body === null) {
        const message = await response
          .json()
          .then((b: { error?: string }) => b.error)
          .catch(() => undefined)
        dispatch({ type: 'error', message: message ?? 'The scan could not be started.' })
        return
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += value

          // NDJSON: everything before the final newline is a complete event.
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.trim() === '') continue
            // `scanId` rides along on the `started` event only when
            // persistence produced one — see the special case in the scan
            // route. Nothing else needs it, so it isn't part of `ScanEvent`.
            let event: (ScanEvent | { type: 'error'; message: string }) & { scanId?: string }
            try {
              event = JSON.parse(line) as typeof event
            } catch {
              continue // A partial or corrupt line must not abort the scan.
            }

            if (event.type === 'started' && event.scanId !== undefined) {
              dispatch({ type: 'scanId', scanId: event.scanId })
            } else if (event.type === 'source') dispatch({ type: 'source', result: event.result })
            else if (event.type === 'complete') dispatch({ type: 'complete', summary: event.summary })
            else if (event.type === 'ai_summary') dispatch({ type: 'ai_summary', summary: event.summary })
            else if (event.type === 'error') dispatch({ type: 'error', message: event.message })
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: 'error', message: 'The connection dropped while researching.' })
        }
      }
    }

    void run()
    return () => controller.abort()
  }, [context, order])

  /**
   * Retry one source that came back `unable_to_verify`, without spending a
   * new quota unit. Sends the results already on screen so the server can
   * recompute the score and coverage around the one updated source; the
   * response replaces `summary` wholesale, same as the initial scan.
   */
  const retrySource = async (source: SourceId): Promise<void> => {
    if (state.summary === undefined || state.retrying.has(source)) return
    dispatch({ type: 'retry_start', source })

    try {
      const response = await fetch('/api/scan/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          context,
          results: state.summary.results,
          source,
          ...(state.scanId === undefined ? {} : { scanId: state.scanId }),
        }),
      })

      const body: { summary?: ScanSummary; error?: string } = await response.json().catch(() => ({}))

      if (!response.ok || body.summary === undefined) {
        dispatch({
          type: 'retry_failed',
          source,
          message: body.error ?? 'The retry did not complete. Try again in a moment.',
        })
        return
      }

      dispatch({ type: 'retry_done', source, summary: body.summary })
    } catch {
      dispatch({ type: 'retry_failed', source, message: 'Could not reach the server to retry.' })
    }
  }

  if (state.error !== undefined) {
    return (
      <section className="mx-auto w-full max-w-[520px] rounded-xl border border-danger/20 bg-danger-soft p-6 px-6 py-10 text-center">
        <h1 className="font-semibold text-danger">The scan could not complete</h1>
        <p className="mt-2 text-sm text-danger/90">{state.error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
      </section>
    )
  }

  if (state.summary !== undefined) {
    return (
      <>
        {state.retryError !== undefined ? (
          <p
            role="alert"
            className="mx-auto mt-6 w-full max-w-[900px] px-6 text-sm text-danger"
          >
            {state.retryError}
          </p>
        ) : null}
        <Report
          scan={{ context, ...state.summary } satisfies ReportData}
          aiSummary={state.aiSummary}
          onRetrySource={(source) => void retrySource(source)}
          retryingSources={state.retrying}
        />
      </>
    )
  }

  const done = order.filter((id) => state.phases[id]?.phase === 'done').length

  return (
    <section aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[640px] px-6 py-14">
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold">
            Researching <span className="font-mono">{context.name}</span>
          </h1>
          <p className="mt-1 text-sm text-charcoal-2">
            {done} of {order.length} sources complete
          </p>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted-bg">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${order.length === 0 ? 0 : Math.round((done / order.length) * 100)}%` }}
          />
        </div>

        <ul className="mt-5 divide-y divide-line">
          {order.map((id) => (
            <SourceProgressRow key={id} id={id} phase={state.phases[id] ?? { phase: 'pending' }} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function SourceProgressRow({ id, phase }: { id: SourceId; phase: SourcePhase }) {
  const label = SOURCE_MANIFEST[id].label

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className={phase.phase === 'pending' ? 'text-faint' : ''}>{label}</span>
      {phase.phase === 'pending' ? (
        <span className="flex items-center gap-2 text-xs text-charcoal-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
          />
          checking…
        </span>
      ) : (
        <Badge tone={STATUS_PRESENTATION[phase.result.status].tone}>
          {STATUS_PRESENTATION[phase.result.status].label}
        </Badge>
      )}
    </li>
  )
}
