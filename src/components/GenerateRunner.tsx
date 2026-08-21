'use client'

import { useId, useRef, useState } from 'react'
import { ComparisonTable } from '@/components/ComparisonTable'
import { CategorySelect } from '@/components/CategorySelect'
import {
  GENERATE_DESCRIPTION_REQUIRED,
  GenerateRequestSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MIN_GENERATE_DESCRIPTION_LENGTH,
  type Category,
} from '@/lib/core/scan'
import type { ComparisonResult } from '@/lib/compare/rank'

type Phase =
  | { kind: 'setup' }
  | { kind: 'generating' }
  | { kind: 'screening' }
  | { kind: 'done'; result: ComparisonResult }
  | { kind: 'error'; message: string }

interface StreamEvent {
  type: string
  ranked?: ComparisonResult
  message?: string
}

export function GenerateRunner({
  guestGenerateLimit,
  userGenerateLimit,
}: {
  guestGenerateLimit: number
  userGenerateLimit: number
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('saas')
  const [seed, setSeed] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<string | null>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()

    /*
      Validated before anything is sent, and before the loading state.

      A blank submit used to reach the API, spend a generation unit and then
      show "Coming up with ideas…" over a prompt with nothing in it. The same
      schema the route parses runs here first, so an empty form costs nothing
      and says why.
    */
    const parsed = GenerateRequestSchema.safeParse({
      category,
      description,
      seed: seed.trim() === '' ? undefined : seed,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? GENERATE_DESCRIPTION_REQUIRED)
      descriptionRef.current?.focus()
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

          if (evt.type === 'screening') {
            setPhase({ kind: 'screening' })
          } else if (evt.type === 'result' && evt.ranked !== undefined) {
            setPhase({ kind: 'done', result: evt.ranked })
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
        <h2 className="font-display text-2xl font-semibold text-charcoal">Top 5 names</h2>
        <ComparisonTable result={phase.result} category={category} />

        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="btn-secondary rounded-xl px-4 py-2 text-sm"
        >
          Generate more names
        </button>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center">
        <h2 className="text-xl font-semibold text-danger">Couldn&rsquo;t generate names</h2>
        <p className="mt-2 text-sm text-danger/90">{phase.message}</p>
        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="mt-4 btn-primary rounded-xl px-4 py-2 text-sm"
        >
          Try again
        </button>
      </div>
    )
  }

  if (phase.kind === 'generating') {
    return (
      <div aria-live="polite" aria-busy="true" className="card rounded-2xl p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-accent"
        />
        <h2 className="mt-4 text-xl font-semibold">Finding ideas</h2>
        <p className="mt-1 text-sm text-charcoal-2">This may take a moment.</p>
      </div>
    )
  }

  if (phase.kind === 'screening') {
    return (
      <div aria-live="polite" aria-busy="true" className="card rounded-2xl p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-accent"
        />
        <h2 className="mt-4 text-xl font-semibold">Researching the best ideas</h2>
        <p className="mt-1 text-sm text-charcoal-2">
          We&rsquo;ll show the strongest five.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="panel glass-spotlight rounded-panel p-5 sm:p-7">
        <div>
          <label htmlFor="gen-description" className="mb-1.5 block text-sm font-medium">
            What are you naming?
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="gen-description"
              aria-label="What are you naming?"
              ref={descriptionRef}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                // Clearing on edit rather than on the next submit: an error
                // still on screen while the user fixes the field reads as a
                // second, unrelated problem.
                if (error !== null) setError(null)
              }}
              required
              minLength={MIN_GENERATE_DESCRIPTION_LENGTH}
              maxLength={MAX_DESCRIPTION_LENGTH}
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : errorId}
              placeholder="A project tool for small design teams"
              className={`w-full min-w-0 flex-1 field rounded-xl px-3 py-2.5 text-sm ${
                error === null ? '' : 'border-danger'
              }`}
            />
            <button type="submit" className="btn-primary shrink-0 rounded-xl px-5 py-2.5 text-sm">
              Generate ideas →
            </button>
          </div>
          <p className="mt-1.5 text-xs text-faint">A few words help us narrow the ideas.</p>
          {/*
            The message sits under the field it belongs to, not at the bottom
            of the form: `aria-describedby` points here, and a screen reader
            reaching the input should hear what is wrong with it.
          */}
          {error === null ? null : (
            <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4">
          <CategorySelect value={category} onChange={setCategory} />
        </div>

        <div className="mt-4">
          <label htmlFor="gen-seed" className="mb-1.5 block text-sm font-medium">
            Starting point <span className="font-normal text-faint">(optional)</span>
          </label>
          <input
            id="gen-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="A name you like"
            className="w-full field rounded-xl px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        Uses one idea run. Guests get {guestGenerateLimit} daily, accounts get {userGenerateLimit}.
      </p>
    </form>
  )
}
