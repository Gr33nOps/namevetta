'use client'

import Link from 'next/link'

import { useEffect, useMemo, useReducer, useState } from 'react'
import { ResearchProgress } from '@/components/ResearchProgress'
import { Report, type ReportData } from '@/components/Report'

import { NameSuggestions } from '@/components/NameSuggestions'
import { VettaPanel } from '@/components/VettaPanel'
import { sourcesFor } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { SourceId, SourceResult } from '@/lib/core/types'
import type { AiSummaryEvent, ScanEvent, ScanSummary } from '@/lib/orchestrator/run'
import {
  conflictBanner,
  headlineSentence,
  TONE_TEXT,
  VERDICT_PRESENTATION,
} from '@/lib/presentation'
import { dominantVerdict } from '@/lib/scoring/viability'

type SourcePhase =
  | { phase: 'pending' }
  | { phase: 'done'; result: SourceResult }

interface State {
  phases: Record<string, SourcePhase>
  summary: ScanSummary | undefined
  aiSummary: AiSummaryEvent | undefined
  error: string | undefined
  /** True when the refusal was about the daily allowance, not a failure. */
  outOfChecks: boolean
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
  | { type: 'error'; message: string; outOfChecks?: boolean }
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
        outOfChecks: false,
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
      return { ...state, error: action.message, outOfChecks: action.outOfChecks ?? false }
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
  const [attempt, setAttempt] = useState(0)
  const order = useMemo(() => sourcesFor(context.scanType).map((s) => s.id), [context.scanType])

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    phases: {},
    summary: undefined,
    aiSummary: undefined,
    error: undefined,
    outOfChecks: false,
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
        dispatch({
          type: 'error',
          message: message ?? 'The scan could not be started.',
          outOfChecks: response.status === 429,
        })
        return
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      let terminal = false

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done && buffer.trim() === '') break
          buffer += done ? '\n' : value

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
            else if (event.type === 'complete') {
              terminal = true
              dispatch({ type: 'complete', summary: event.summary })
            }
            else if (event.type === 'ai_summary') dispatch({ type: 'ai_summary', summary: event.summary })
            else if (event.type === 'error') {
              terminal = true
              dispatch({ type: 'error', message: event.message })
            }
          }
          if (done) break
        }
        if (!terminal) dispatch({ type: 'error', message: 'The connection ended before the check finished. Please try again.' })
      } catch {
        if (!controller.signal.aborted && !terminal) {
          dispatch({ type: 'error', message: 'The connection dropped while researching.' })
        }
      }
    }

    void run()
    return () => controller.abort()
    /*
      The values, not the object.

      `context` is built as an object literal by the server component above,
      so it is a new identity on every render — and a server action refreshes
      the route it was called from, which re-renders this page. Saving a name
      therefore started a second scan and spent a second Quick Check, and the
      history filled with duplicates of whatever the visitor had just looked
      at. Depending on the three values means a refresh re-renders and nothing
      re-researches.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.name, context.category, context.scanType, context.description, context.includeSpecialized, order, attempt])

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
      state.outOfChecks ? (
        // Running out is not a failure, and dressing it in red as one makes a
        // normal daily limit look like something broke. It is also the first
        // moment an account is worth anything to this person, which is why it
        // is the only place the product mentions one.
        <section className="mx-auto w-full max-w-[440px] px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-charcoal">
            That&rsquo;s your checks for today
          </h1>
          <p className="mt-2.5 text-[15px] text-charcoal-2">{state.error}</p>
          <Link
            href="/auth"
            className="mt-6 btn-primary rounded-xl px-5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign in for more
          </Link>
        </section>
      ) : (
      <section className="panel mx-auto w-full max-w-3xl rounded-panel px-6 py-10 text-center">
          <h1 className="font-semibold text-danger">Couldn&rsquo;t finish the check</h1>
        <p className="mt-2 text-sm text-danger/90">{state.error}</p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="mt-4 btn-primary rounded-xl px-4 py-2 text-sm"
        >
          Try again
        </button>
      </section>
      )
    )
  }

  /*
    Everything that has answered so far, in the manifest's order rather than
    the order they happened to land in. A list that reshuffles itself as each
    source replies is unreadable while it is filling.
  */
  const answered = order
    .map((id) => state.phases[id])
    .filter((p): p is { phase: 'done'; result: SourceResult } => p?.phase === 'done')
    .map((p) => p.result)

  if (state.summary !== undefined) {
    const { viability, results, coverage } = state.summary
    const presentation = VERDICT_PRESENTATION[dominantVerdict(viability.score, results)]

    /*
      The banner that outranks the score.

      An exact confirmed collision now ceilings the score below the "Mostly
      Clear" band, so the number and the verdict can no longer disagree — but
      the number still has to be read *after* the finding, not instead of it.
      This sits above the panel, in danger tone, naming the colliding entry.
    */
    const banner = conflictBanner(viability.conflicts)

    return (
      <div className="page-shell report-ready">
        <header className="mb-6">
          <h1 className="page-title break-words">
            {context.name}
          </h1>
          {context.description === undefined ? null : (
            <p className="mt-2.5 text-sm text-charcoal-2">{context.description}</p>
          )}
        </header>

        {banner === '' ? null : (
          <aside
            role="status"
            className="mb-5 flex flex-col gap-2 rounded-xl border border-danger/25 border-l-[3px] bg-danger-soft/75 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-[14px] leading-relaxed text-charcoal-2">
              <strong className="font-semibold text-danger">Exact match. </strong>
              {banner}
            </p>
            <a href="#findings" className="w-fit text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              View findings
            </a>
          </aside>
        )}

        <VettaPanel
          initialName={context.name}
          results={results}
          score={viability.score}
          scoreTone={presentation.tone}
          total={order.length}
          suggestions={
            <NameSuggestions
              seed={context.name}
              category={context.category}
              {...(context.description === undefined ? {} : { description: context.description })}
            />
          }
          note={
            <>
              <span className={`font-semibold ${TONE_TEXT[presentation.tone]}`}>
                {presentation.label}.
              </span>{' '}
              <span>
                {headlineSentence(results, presentation.detail)} Research coverage {coverage}%.
              </span>
            </>
          }
        />


        {state.retryError !== undefined ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.retryError}
          </p>
        ) : null}

        <Report
          scan={{ context, ...state.summary } satisfies ReportData}
          aiSummary={state.aiSummary}
          onRetrySource={(source) => void retrySource(source)}
          retryingSources={state.retrying}
        />
      </div>
    )
  }

  return (
    <div className="page-shell">
      <h1 className="page-title mb-6 break-words">
        {context.name}
      </h1>
      <ResearchProgress title="Checking your name" detail={`${context.scanType === 'deep' ? 'Deep Research considers' : 'Quick Check uses'} ${order.length} sources. Your score and its explanation appear together when the checks finish.`} status={`${answered.length} of ${order.length} sources answered`}>
        <progress className="research-progress mt-6 h-2 w-full" max={order.length} value={answered.length} aria-label="Sources answered" />
        <Link href="/" className="btn-secondary mt-6 rounded-xl px-4 py-2 text-sm">Back to search</Link>
      </ResearchProgress>
    </div>
  )
}
