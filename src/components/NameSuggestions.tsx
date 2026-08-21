'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SparklesIcon } from '@/components/vetta/Icons'
import type { RankedCandidate } from '@/lib/compare/rank'
import type { Category } from '@/lib/core/scan'
import { CATEGORY_LABELS } from '@/lib/core/scan'

/** How many free names the row shows, and so how many the run needs. */
const WANTED = 5

interface Phase {
  kind: 'idle' | 'inventing' | 'screening' | 'done' | 'error'
  survivors?: RankedCandidate[]
  message?: string
}

interface StreamEvent {
  type: string
  ranked?: { candidates: RankedCandidate[] }
  message?: string
}

/**
 * Alternatives to a name that is already taken.
 *
 * The row this replaces held five hard-coded example names, which were useful
 * to nobody who had already typed something of their own. This asks the
 * generator for names in the same spirit as theirs and shows only the ones
 * that survived a real Quick Check, so every chip here is a name the product
 * has actually researched rather than merely invented.
 *
 * It is a button, not something that fires as you type. A run is one AI call
 * plus a full Quick Check per candidate, run one at a time to stay inside the
 * per-source rate limits, and it spends one generation from the daily
 * allowance. Firing that on a keystroke would exhaust the day's budget before
 * anyone finished typing their name.
 */
export function NameSuggestions({
  seed,
  category,
  description,
}: {
  seed: string
  category: Category
  description?: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const run = async (): Promise<void> => {
    setPhase({ kind: 'inventing' })

    let response: Response
    try {
      response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category,
          seed,
          // Five is what the row can show. Asking for exactly that many stops
          // the run as soon as it has them instead of screening the full batch.
          stopAfterSurvivors: WANTED,
          description:
            description ??
            `Alternative ${CATEGORY_LABELS[category]} names inspired by ${seed}`,
        }),
      })
    } catch {
      setPhase({ kind: 'error', message: 'Could not reach the server.' })
      return
    }

    if (!response.ok || response.body === null) {
      const body: { error?: string } = await response.json().catch(() => ({}))
      setPhase({
        kind: 'error',
        message: body.error ?? 'Suggestions could not be generated right now.',
      })
      return
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim() === '') continue
          let event: StreamEvent
          try {
            event = JSON.parse(line) as StreamEvent
          } catch {
            continue
          }

          if (event.type === 'screening') {
            setPhase({ kind: 'screening' })
          } else if (event.type === 'result') {
            setPhase({
              kind: 'done',
              survivors: event.ranked?.candidates ?? [],
            })
          } else if (event.type === 'error') {
            setPhase({ kind: 'error', message: event.message ?? 'Generation failed.' })
          }
        }
      }
    } catch {
      setPhase({ kind: 'error', message: 'The connection dropped while generating.' })
    }
  }

  if (phase.kind === 'idle') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-faint">
        <span aria-hidden="true">
          <SparklesIcon />
        </span>
        Need another direction?
        <button
          type="button"
          onClick={() => void run()}
          className="rounded-full border border-line px-3 py-1 text-[11px] font-medium text-charcoal-2 transition-colors hover:border-accent-border hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Suggest alternatives
        </button>
        <span>Uses one idea run.</span>
      </div>
    )
  }

  if (phase.kind === 'inventing' || phase.kind === 'screening') {
    return (
      <div
        aria-live="polite"
        className="mt-4 flex flex-wrap items-center gap-2 text-xs text-charcoal-2"
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
        />
        {phase.kind === 'inventing'
          ? 'Finding alternatives…'
          : 'Checking the best options…'}
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <p role="alert" className="mt-4 text-xs text-danger">
        {phase.message}
      </p>
    )
  }

  const survivors = phase.survivors ?? []

  if (survivors.length === 0) {
    return (
      <p className="mt-4 text-xs text-charcoal-2">
        No clear alternative this time. Try adding more detail.
      </p>
    )
  }

  return (
    <div className="mt-4">
      <p className="flex items-center gap-2 text-xs text-faint">
        <span aria-hidden="true">
          <SparklesIcon />
        </span>
        Suggested alternatives. Open one for the full report.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {survivors.map((candidate) => (
          <button
            key={candidate.name}
            type="button"
            onClick={() => router.push(`/n/${encodeURIComponent(candidate.name)}`)}
            className="press inline-flex items-center gap-2 rounded-full border border-ok/35 bg-ok/12 px-3 py-1.5 font-mono text-[12px] text-charcoal transition-colors hover:border-ok focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {candidate.name}
            <span className="text-[11px] font-semibold text-ok tabular-nums">
              {candidate.score}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
