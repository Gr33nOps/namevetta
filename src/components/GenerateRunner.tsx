'use client'

import { useState } from 'react'
import { ComparisonTable } from '@/components/ComparisonTable'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GenerateRequestSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  type Category,
} from '@/lib/core/scan'
import type { ComparisonResult } from '@/lib/compare/rank'

interface DisqualifiedName {
  name: string
  reason: string
}

const STEPS = [
  { label: 'Generate', detail: 'An AI model proposes around 30 candidate names.' },
  { label: 'Research', detail: 'Every candidate gets its own Quick Check.' },
  { label: 'Discard conflicts', detail: 'Names with a confirmed conflict are dropped.' },
  { label: 'Return top 5', detail: 'The strongest survivors are ranked and shown.' },
] as const

type Phase =
  | { kind: 'setup' }
  | { kind: 'generating' }
  | { kind: 'screening'; total: number; done: { name: string; disqualified: boolean }[] }
  | {
      kind: 'done'
      result: ComparisonResult
      survivorCount: number
      disqualified: DisqualifiedName[]
    }
  | { kind: 'error'; message: string }

interface StreamEvent {
  type: string
  names?: string[]
  name?: string
  score?: number
  disqualified?: boolean | DisqualifiedName[]
  ranked?: ComparisonResult
  survivorCount?: number
  disqualifiedCount?: number
  message?: string
}

export function GenerateRunner() {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('saas')
  const [seed, setSeed] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()

    const parsed = GenerateRequestSchema.safeParse({
      category,
      description: description.trim() === '' ? undefined : description,
      seed: seed.trim() === '' ? undefined : seed,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your details')
      return
    }
    setError(null)
    setPhase({ kind: 'generating' })

    let response: Response
    try {
      response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
    } catch {
      setPhase({ kind: 'error', message: 'Could not reach the server.' })
      return
    }

    if (!response.ok || response.body === null) {
      const message = await response
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined)
      setPhase({ kind: 'error', message: message ?? 'Name generation could not be started.' })
      return
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    const seen: { name: string; disqualified: boolean }[] = []
    let total = 0

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim() === '') continue
          let evt: StreamEvent
          try {
            evt = JSON.parse(line)
          } catch {
            continue
          }

          if (evt.type === 'names_ready' && evt.names !== undefined) {
            total = evt.names.length
            setPhase({ kind: 'screening', total, done: [] })
          } else if (evt.type === 'candidate_complete' && evt.name !== undefined) {
            seen.push({ name: evt.name, disqualified: evt.disqualified === true })
            setPhase({ kind: 'screening', total, done: [...seen] })
          } else if (evt.type === 'result' && evt.ranked !== undefined) {
            setPhase({
              kind: 'done',
              result: evt.ranked,
              survivorCount: evt.survivorCount ?? 0,
              disqualified: Array.isArray(evt.disqualified) ? evt.disqualified : [],
            })
          } else if (evt.type === 'error') {
            setPhase({ kind: 'error', message: evt.message ?? 'Name generation failed.' })
          }
        }
      }
    } catch {
      setPhase({ kind: 'error', message: 'The connection dropped while generating names.' })
    }
  }

  if (phase.kind === 'done') {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-charcoal-2">
            Generated {phase.survivorCount + phase.disqualified.length} candidates, researched
            every one, and kept{' '}
            <strong className="font-medium text-charcoal">{phase.survivorCount}</strong> that
            cleared screening. The top {phase.result.candidates.length} are below.
          </p>
        </section>

        <ComparisonTable result={phase.result} category={category} />

        {phase.disqualified.length > 0 ? (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">
              {phase.disqualified.length} discarded during screening
            </h3>
            <ul className="mt-3 divide-y divide-line">
              {phase.disqualified.map((d) => (
                <li key={d.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-mono">{d.name}</span>
                  <span className="text-xs text-faint">{d.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
        >
          Generate more names
        </button>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft p-6 text-center">
        <h2 className="text-xl font-semibold text-danger">Name generation could not complete</h2>
        <p className="mt-2 text-sm text-danger/90">{phase.message}</p>
        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    )
  }

  if (phase.kind === 'generating') {
    return (
      <div aria-live="polite" aria-busy="true" className="rounded-xl border border-line bg-surface p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-accent"
        />
        <h2 className="mt-4 text-xl font-semibold">Coming up with ideas…</h2>
        <p className="mt-1 text-sm text-charcoal-2">
          An AI model is proposing candidate names from your description.
        </p>
      </div>
    )
  }

  if (phase.kind === 'screening') {
    const done = phase.done.length
    return (
      <div aria-live="polite" aria-busy="true" className="rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold">
          Researching {done} of {phase.total} candidates
        </h2>
        <p className="mt-1 text-sm text-charcoal-2">
          Each name gets its own Quick Check, one at a time, so we stay within every source&rsquo;s
          rate limit. This can take a minute.
        </p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted-bg">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${phase.total === 0 ? 0 : Math.round((done / phase.total) * 100)}%` }}
          />
        </div>

        <ul className="mt-5 flex flex-wrap gap-2">
          {phase.done.map((c) => (
            <li
              key={c.name}
              className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
                c.disqualified
                  ? 'border-line text-faint line-through'
                  : 'border-ok/30 bg-ok-soft text-ok'
              }`}
            >
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div className="rounded-xl border border-line bg-surface p-5">
        <div>
          <label htmlFor="gen-description" className="mb-1.5 block text-sm font-medium">
            What are you naming?
          </label>
          <input
            id="gen-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="A project management tool for small design teams…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          />
          <p className="mt-1.5 text-xs text-faint">
            The more specific this is, the more relevant the generated names will be.
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1.5 block text-sm font-medium">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  category === c
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-line text-charcoal-2 hover:border-line-strong'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label htmlFor="gen-seed" className="mb-1.5 block text-sm font-medium">
            Starting idea <span className="font-normal text-faint">(optional)</span>
          </label>
          <input
            id="gen-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="A name you already like, for inspiration…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      {error !== null ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-6 w-full rounded-lg bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Generate names →
      </button>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
        {STEPS.map((step, i) => (
          <div key={step.label}>
            <span className="font-mono text-xs text-faint">0{i + 1}</span>
            <h3 className="mt-1 text-sm font-semibold">{step.label}</h3>
            <p className="mt-1 text-xs leading-relaxed text-charcoal-2">{step.detail}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-faint">
        Uses one generation run from your daily allowance and can take about a minute.
      </p>
    </form>
  )
}
