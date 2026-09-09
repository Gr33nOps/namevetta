'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { GeneratedNames } from '@/components/GeneratedNames'
import { CategorySelect } from '@/components/CategorySelect'
import { ResearchProgress } from '@/components/ResearchProgress'
import {
  GENERATE_DESCRIPTION_REQUIRED,
  GenerateRequestSchema,
  GENERATED_NAME_COUNT,
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
  checked?: number
  accepted?: number
}

export function GenerateRunner({
  guestGenerateLimit,
  userGenerateLimit,
}: {
  guestGenerateLimit: number
  userGenerateLimit: number
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('other')
  const [seed, setSeed] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [error, setError] = useState<string | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [checked, setChecked] = useState(0)
  const [accepted, setAccepted] = useState(0)
  const [progressMessage, setProgressMessage] = useState<string | undefined>()
  useEffect(() => () => requestRef.current?.abort(), [])
  const errorId = useId()

  const submit = async (event?: React.FormEvent): Promise<void> => {
    event?.preventDefault()

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
    setChecked(0)
    setAccepted(0)
    setProgressMessage(undefined)
    setPhase({ kind: 'generating' })
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = setTimeout(() => controller.abort('timeout'), 290_000)
    let terminal = false
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      })

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
      const handleLine = (line: string): void => {
        if (line.trim() === '' || terminal) return
        let evt: StreamEvent
        try { evt = JSON.parse(line) } catch { return }
        if (evt.type === 'screening') setPhase({ kind: 'screening' })
        if (evt.type === 'progress' && typeof evt.checked === 'number') setChecked(evt.checked)
        if (evt.type === 'progress' && typeof evt.accepted === 'number') setAccepted(evt.accepted)
        if (evt.type === 'progress') setProgressMessage(evt.message)
        if (evt.type === 'result' && evt.ranked !== undefined) {
          terminal = true
          if (evt.ranked.candidates.length !== GENERATED_NAME_COUNT) {
            setPhase({ kind: 'error', message: 'This run did not produce four checked names. Please try again.' })
            return
          }
          setPhase({ kind: 'done', result: evt.ranked })
        } else if (evt.type === 'error') {
          terminal = true
          setPhase({ kind: 'error', message: evt.message ?? 'Name generation failed. Please try again.' })
        }
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) handleLine(line)
        if (terminal) { await reader.cancel(); break }
      }
      handleLine(buffer)
      if (!terminal) setPhase({ kind: 'error', message: 'The connection ended before your names arrived. Please try again.' })
    } catch {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return
      if (!terminal) setPhase({ kind: 'error', message: controller.signal.aborted ? 'This run took too long. Please try again with a more specific brief.' : 'The connection dropped. Check your connection and try again.' })
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  if (phase.kind === 'done') {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h2 className="font-display text-center text-2xl font-semibold text-charcoal">
          Four names to consider
        </h2>
        <GeneratedNames result={phase.result} category={category} />

        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="btn-secondary rounded-xl px-4 py-3 text-sm"
        >
          Edit your brief
        </button>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div role="alert" className="panel mx-auto max-w-3xl rounded-panel p-6 text-center sm:p-10">
        <h2 className="text-xl font-semibold text-danger">Couldn&rsquo;t generate names</h2>
        <p className="mt-2 text-sm text-danger/90">{phase.message}</p>
        <button
          type="button"
          onClick={() => void submit()}
          className="mt-4 btn-primary rounded-xl px-4 py-2 text-sm"
        >
          Try again
        </button>
        <button type="button" onClick={() => setPhase({ kind: 'setup' })} className="btn-secondary ml-3 mt-4 rounded-xl px-4 py-2 text-sm">Edit your brief</button>
      </div>
    )
  }

  if (phase.kind === 'generating' || phase.kind === 'screening') {
    return (
      <ResearchProgress title={phase.kind === 'generating' ? 'Finding your naming direction' : 'Checking where the names are used'} detail={phase.kind === 'generating' ? 'Creating and reviewing names that fit your brief.' : 'Checking domains and conflicts. We replace rejected ideas until four pass, within this run.'} status={progressMessage ?? (checked > 0 ? `${accepted} of ${GENERATED_NAME_COUNT} names shortlisted · ${checked} checked` : 'Your brief is saved while we work.')}>
        <ol className="loading-stages mx-auto mt-7 grid max-w-md grid-cols-3 gap-2 text-xs text-charcoal-2" aria-label="Generation stages">
          {['Find ideas', 'Check names', 'Your shortlist'].map((label, index) => <li key={label} aria-current={index === (phase.kind === 'generating' ? 0 : 1) ? 'step' : undefined} className={`border-t-2 pt-3 ${index <= (phase.kind === 'generating' ? 0 : 1) ? 'border-accent text-accent-ink' : 'border-line'}`}>{label}</li>)}
        </ol>
        <button type="button" className="btn-secondary mt-6 rounded-xl px-4 py-2 text-sm" onClick={() => { requestRef.current?.abort(); setPhase({ kind: 'setup' }) }}>Back to your brief</button>
      </ResearchProgress>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-3xl">
      <div className="panel glass-spotlight rounded-panel p-5 sm:p-7">
        <div>
          <label htmlFor="gen-description" className="mb-1.5 block text-sm font-medium">
            What are you naming?
          </label>
          <div>
            <textarea
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
              rows={4}
              placeholder="Describe your idea, who it is for, and the feeling you want the name to have."
              className={`w-full min-w-0 resize-y field rounded-xl px-4 py-3 text-base leading-relaxed ${
                error === null ? '' : 'border-danger'
              }`}
            />
          </div>
          <p className="mt-2 text-xs text-faint">Include your audience, the feeling you want, and any languages or markets that matter.</p>
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

        <div className="mt-5">
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
            className="w-full field rounded-xl px-3 py-2.5 text-base"
          />
        </div>
        <button type="submit" className="btn-primary mt-6 w-full gap-2 rounded-xl px-5 py-3.5 text-base">Generate ideas <span aria-hidden="true">→</span></button>
        <p className="mt-3 text-center text-xs leading-relaxed text-charcoal-2">Four names, screened for conflicts and an unregistered .com. Registrar confirmation and trademark clearance are separate.</p>
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        One run includes ideas and checks. Daily limits: {guestGenerateLimit} as a guest, {userGenerateLimit} with an account.
      </p>
    </form>
  )
}
