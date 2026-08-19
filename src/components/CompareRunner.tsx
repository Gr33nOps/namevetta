'use client'

import { useState } from 'react'
import { ComparisonTable } from '@/components/ComparisonTable'
import { Badge } from '@/components/ui/Badge'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  MAX_COMPARE_NAMES,
  MAX_DESCRIPTION_LENGTH,
  MIN_COMPARE_NAMES,
  CompareRequestSchema,
  type Category,
  type ScanType,
} from '@/lib/core/scan'
import type { ComparisonResult } from '@/lib/compare/rank'
import type { ScanSummary } from '@/lib/orchestrator/run'

type Phase =
  | { kind: 'setup' }
  | { kind: 'running'; current: string | undefined; done: string[] }
  | { kind: 'done'; result: ComparisonResult }
  | { kind: 'error'; message: string }

export function CompareRunner() {
  const [names, setNames] = useState<string[]>(['', ''])
  const [category, setCategory] = useState<Category>('saas')
  const [description, setDescription] = useState('')
  const [scanType, setScanType] = useState<ScanType>('quick')
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<string | null>(null)

  const setName = (index: number, value: string): void => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  const addName = (): void => {
    if (names.length < MAX_COMPARE_NAMES) setNames((prev) => [...prev, ''])
  }

  const removeName = (index: number): void => {
    if (names.length > MIN_COMPARE_NAMES) setNames((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()

    const filled = names.map((n) => n.trim()).filter((n) => n !== '')
    const parsed = CompareRequestSchema.safeParse({
      names: filled,
      category,
      description: description.trim() === '' ? undefined : description,
      scanType,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your candidates')
      return
    }
    setError(null)
    setPhase({ kind: 'running', current: undefined, done: [] })

    let response: Response
    try {
      response = await fetch('/api/compare', {
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
      setPhase({ kind: 'error', message: message ?? 'The comparison could not be started.' })
      return
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    const completed: string[] = []

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.trim() === '') continue
          let event: {
            type: string
            name?: string
            summary?: ScanSummary
            result?: ComparisonResult
            message?: string
          }
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          if (event.type === 'candidate_started' && event.name !== undefined) {
            setPhase({ kind: 'running', current: event.name, done: [...completed] })
          } else if (event.type === 'candidate_complete' && event.name !== undefined) {
            completed.push(event.name)
            setPhase({ kind: 'running', current: undefined, done: [...completed] })
          } else if (event.type === 'comparison' && event.result !== undefined) {
            setPhase({ kind: 'done', result: event.result })
          } else if (event.type === 'error') {
            setPhase({ kind: 'error', message: event.message ?? 'The comparison failed.' })
          }
        }
      }
    } catch {
      setPhase({ kind: 'error', message: 'The connection dropped while comparing.' })
    }
  }

  if (phase.kind === 'done') {
    return (
      <div className="space-y-6">
        <ComparisonTable result={phase.result} category={category} />
        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
        >
          Compare different names
        </button>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft p-6 text-center">
        <h2 className="text-xl font-semibold text-danger">The comparison could not complete</h2>
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

  if (phase.kind === 'running') {
    const filled = names.map((n) => n.trim()).filter((n) => n !== '')
    return (
      <div aria-live="polite" aria-busy="true" className="rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold">Researching {filled.length} names</h2>
        <p className="mt-1 text-sm text-charcoal-2">
          Each name is researched separately, one at a time, so we stay within every source&rsquo;s
          rate limit.
        </p>

        <ul className="mt-5 divide-y divide-line">
          {filled.map((name) => {
            const isDone = phase.done.includes(name)
            const isCurrent = phase.current === name
            return (
              <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                <span className={isDone || isCurrent ? 'font-mono' : 'font-mono text-faint'}>
                  {name}
                </span>
                {isDone ? (
                  <Badge tone="ok">Done</Badge>
                ) : isCurrent ? (
                  <span className="flex items-center gap-2 text-xs text-charcoal-2">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
                    />
                    researching…
                  </span>
                ) : (
                  <span className="text-xs text-faint">queued</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <fieldset className="min-w-0">
        <legend className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Candidate names
        </legend>

        <div className="mt-3 space-y-2">
          {names.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(index, e.target.value)}
                placeholder={`Name ${index + 1}${index === 0 ? ' · e.g. Envryn' : ''}`}
                aria-label={`Candidate name ${index + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-charcoal outline-none transition-all placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
              />
              {index >= MIN_COMPARE_NAMES ? (
                <button
                  type="button"
                  onClick={() => removeName(index)}
                  aria-label={`Remove candidate ${index + 1}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-faint transition-colors hover:border-line-strong hover:text-charcoal"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {names.length < MAX_COMPARE_NAMES ? (
          <button
            type="button"
            onClick={addName}
            className="mt-2 w-full rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-charcoal-2 transition-colors hover:border-accent hover:text-accent"
          >
            + Add another name{' '}
            <span className="text-faint">({MAX_COMPARE_NAMES - names.length} remaining)</span>
          </button>
        ) : null}
      </fieldset>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Shared context for all candidates
        </p>

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
          <label htmlFor="cmp-description" className="mb-1.5 block text-sm font-medium">
            Description{' '}
            <span className="font-normal text-faint">(optional, improves relevance)</span>
          </label>
          <input
            id="cmp-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="One sentence about what you're naming…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-sm font-medium">Research depth</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'quick', label: 'Quick Check' },
                { value: 'deep', label: 'Deep Research' },
              ] as const
            ).map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setScanType(d.value)}
                aria-pressed={scanType === d.value}
                className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                  scanType === d.value
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-line hover:border-accent-border'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {/* Comparing N names is N pieces of research, and the allowance
              reflects that. Saying so up front avoids a surprise refusal. */}
          <p className="mt-2 text-xs text-faint">
            Each candidate uses one {scanType === 'deep' ? 'Deep Research' : 'Quick Check'} from
            your daily allowance.
          </p>
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
        Compare names →
      </button>
    </form>
  )
}
