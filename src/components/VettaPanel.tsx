'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { ArrowRightIcon, SearchIcon } from '@/components/vetta/Icons'
import { CategorySelect } from '@/components/CategorySelect'
import { sourceCounts } from '@/lib/core/adapter'
import { MAX_NAME_LENGTH, type Category, type ScanType } from '@/lib/core/scan'
import { isVerified, type SourceResult } from '@/lib/core/types'
import { type Tone } from '@/lib/presentation'
import { manualVerificationCount, panelRows, ROW_FILTERS, type RowFilterId } from '@/lib/rows'
import { SourceLogo } from '@/components/SourceLogo'

const RECENT_KEY = 'nv-recent'
const MAX_RECENT = 5
const COUNTS = sourceCounts()

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function rememberName(name: string): void {
  try {
    const next = [name, ...readRecent().filter((n) => n !== name)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // A browser with storage disabled loses the shortcut, not the product.
  }
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

const RING_STROKE: Record<Tone, string> = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  unknown: 'var(--color-unknown)',
  neutral: 'var(--color-line-strong)',
}

const PILL_TONE: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  unknown: 'text-unknown',
  neutral: 'text-charcoal-2',
}

/**
 * The status of one row.
 *
 * Uppercase text, not colour alone: the word is the label, so the row still
 * reads correctly in a screenshot and for anyone who cannot separate the
 * green from the red. The dot is decoration on top of that.
 */
function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${PILL_TONE[tone]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** The score, drawn as an arc. 15.5r on a 36 box is a 97.4 circumference. */
function ScoreRing({ score, tone }: { score: number; tone: Tone }) {
  const circumference = 2 * Math.PI * 15.5

  return (
    <div className="relative grid h-16 w-16 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke={RING_STROKE[tone]}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="font-display absolute text-lg font-semibold tabular-nums">{score}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                  */
/* -------------------------------------------------------------------------- */

interface VettaPanelProps {
  /** Pre-fills the field, so the panel on a result page shows what was asked. */
  initialName?: string
  /** Omitted until a check has started. */
  results?: readonly SourceResult[]
  score?: number
  scoreTone?: Tone
  /** How many sources this check will ask, for "n of m checks clear". */
  total?: number
  /** True while sources are still answering. */
  busy?: boolean
  /** The line under the list. Says what the list is, or what it is missing. */
  note?: React.ReactNode
  /**
   * Sits directly under the field. Empty on a homepage nobody has searched
   * yet: a row of invented example names is noise to someone who arrived with
   * a name of their own in mind.
   */
  suggestions?: React.ReactNode
  autoFocus?: boolean
  /** Shows the primary-flow controls on the homepage, before a scan starts. */
  showResearchOptions?: boolean
  initialCategory?: Category
  initialScanType?: ScanType
}

/**
 * The search box, and everything a check produces.
 *
 * One object: you type into the top of it and the answer fills the rest of the
 * same panel, rather than the page swapping for a different layout. The score
 * and the list are the whole verdict at a glance; the evidence for any of it
 * lives in the report below, which is where a person goes once a row has
 * surprised them.
 */
export function VettaPanel({
  initialName = '',
  results,
  score,
  scoreTone = 'neutral',
  total,
  busy = false,
  note,
  suggestions,
  autoFocus = false,
  showResearchOptions = false,
  initialCategory = 'other',
  initialScanType = 'quick',
}: VettaPanelProps) {
  const router = useRouter()
  const [navigating, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [filter, setFilter] = useState<RowFilterId | 'all'>('all')
  const [category, setCategory] = useState<Category>(initialCategory)
  const [scanType, setScanType] = useState<ScanType>(initialScanType)

  /*
    The field follows the URL: clicking an example on a result page swaps the
    name, and the panel must not keep showing the old one.

    Adjusted during render rather than in an effect. The alternative fires a
    second render pass after paint, which is the flash of the previous name in
    the box; this is React's documented way to reset state when a prop changes.
  */
  const [lastInitial, setLastInitial] = useState(initialName)
  if (initialName !== lastInitial) {
    setLastInitial(initialName)
    setName(initialName)
  }

  /**
   * The button is never disabled. It is the brightest thing on the page, and
   * greying it out until somebody types made the page open switched off. An
   * empty submit puts the cursor in the field, which is what disabling it was
   * trying to say.
   */
  const go = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed === '') {
      inputRef.current?.focus()
      return
    }
    rememberName(trimmed)
    const query = new URLSearchParams({ as: category })
    if (scanType === 'deep') query.set('deep', '1')
    startTransition(() => router.push(`/n/${encodeURIComponent(trimmed)}?${query.toString()}`))
  }

  const shown =
    results === undefined
      ? []
      : panelRows(results, filter)

  const clear = results?.filter((r) => r.status === 'no_conflict').length ?? 0
  const review =
    results?.filter((r) => r.status === 'similar_found' || r.status === 'confirmed_conflict').length ?? 0
  const manual = results === undefined ? 0 : manualVerificationCount(results)
  const unverified = results?.filter((r) => r.status === 'unable_to_verify').length ?? 0
  const hasConfirmedConflict = results?.some((r) => r.status === 'confirmed_conflict') ?? false
  const completedScoreTone: Tone = hasConfirmedConflict
    ? 'danger'
    : (score ?? 0) >= 85
      ? 'ok'
      : (score ?? 0) >= 50
        ? 'warn'
        : 'danger'
  /*
    The denominator excludes what was deliberately never asked.

    A source the product chose not to call must not count as a check that
    failed to come back clear. That is the same arithmetic mistake as scoring
    it zero.
  */
  const answered = results?.filter((result) => isVerified(result.status)).length ?? 0

  return (
    <div className="panel glass-spotlight relative overflow-hidden rounded-panel p-5 sm:p-7">
      {/* A light travelling the top edge while sources are still answering. */}
      {busy ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
        >
          <span className="brand-gradient-bg animate-sweep block h-px w-1/3" />
        </span>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(name)
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="name" className="sr-only">
          Name to check
        </label>
        {/*
          The field is the product. It is the one control in the app built as
          a container rather than a bare `<input>`, so the search glyph sits
          inside the border and the whole thing takes the focus ring as one
          object — which is what `.field`'s `:focus-within` is for.
        */}
        <span className="field flex flex-1 items-center gap-3 rounded-xl px-4 py-3.5">
          <span aria-hidden="true" className="text-faint">
            <SearchIcon />
          </span>
          <input
            id="name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter a name"
            className="w-full min-w-0 bg-transparent font-mono text-base tracking-tight text-charcoal outline-none placeholder:text-faint"
          />
        </span>
        <button
          type="submit"
          disabled={navigating}
          aria-busy={navigating}
          className="btn-primary shrink-0 gap-2 rounded-xl px-5 py-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {navigating ? 'Starting your check…' : 'Search a name'}
          <ArrowRightIcon />
        </button>
        </form>

        {showResearchOptions ? (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <CategorySelect value={category} onChange={setCategory} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-charcoal">Research</legend>
              <div className="flex min-h-[58px] flex-wrap items-stretch gap-2" role="group" aria-label="Research depth">
                {(['quick', 'deep'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setScanType(type)}
                    aria-pressed={scanType === type}
                    className={`min-h-10 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      scanType === type
                        ? 'border-accent-border bg-accent-soft font-medium text-accent-ink'
                        : 'border-line bg-surface text-charcoal-2 hover:border-line-strong hover:text-charcoal'
                    }`}
                  >
                    {type === 'quick' ? 'Quick Check' : 'Deep Research'}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-relaxed text-faint sm:col-span-2">
              {scanType === 'quick' ? COUNTS.quick : COUNTS.deep} sources, chosen for this use
            </p>
          </div>
        ) : null}

      {suggestions}

      {results === undefined ? null : (
        <>
          {note === undefined ? null : <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed" role="status">{note}</div>}
          {/*
            A fixed column, not `auto`.

            The counter under the score grows a character at a time while a
            scan runs — "9 of 53" to "10 of 53" to "39 of 53" — and an `auto`
            column resized on every one of them, jogging the filter pills
            beside it left and right for the whole scan. The width is settled
            up front and the digits are tabular, so nothing moves but the
            numbers.
          */}
          <div className="mt-7 grid gap-4 sm:grid-cols-[17.5rem_1fr] sm:items-center">
            <div className="inset flex items-center gap-4 rounded-2xl px-5 py-4">
              <ScoreRing score={score ?? 0} tone={busy ? scoreTone : completedScoreTone} />
              <div>
                <p className="font-display text-sm font-semibold text-charcoal">Score</p>
                {!busy ? <p className="mb-1 text-xs text-charcoal-2">Out of 100, based on these checks</p> : null}
                <p className="text-xs tabular-nums text-charcoal-2">
                  {busy
                    ? `${answered} of ${total ?? answered} sources answered`
                    : manual > 0
                      ? `${clear} automatic checks clear. ${manual} direct ${manual === 1 ? 'check' : 'checks'} remain.`
                      : `${clear} of ${answered} automatic checks clear`}
                </p>
              </div>
            </div>

            {busy ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter results">
                {[{ id: 'all' as const, label: 'All' }, ...ROW_FILTERS].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      filter === f.id
                        ? 'border-accent-border bg-accent-soft text-accent-ink'
                        : 'border-line bg-surface text-charcoal-2 hover:border-line-strong hover:text-charcoal'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inset rounded-2xl px-5 py-4">
                <p className="text-sm font-semibold text-charcoal">What needs attention</p>
                <p className="mt-1 text-sm leading-relaxed text-charcoal-2">
                  {review === 0 && manual === 0 && unverified === 0
                    ? 'No conflicts, manual checks, or incomplete sources.'
                    : [
                        review > 0 ? `${review} to review` : undefined,
                        manual > 0 ? `${manual} manual` : undefined,
                        unverified > 0 ? `${unverified} incomplete` : undefined,
                      ]
                        .filter((item): item is string => item !== undefined)
                        .join(' · ')}
                </p>
                <a
                  href="#findings"
                  className="mt-2 inline-flex text-sm font-medium text-accent-ink underline decoration-accent-border underline-offset-4 hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View details
                </a>
              </div>
            )}
          </div>

          {busy && shown.length === 0 ? (
            <div className="inset mt-5 rounded-2xl px-4 py-5">
              <p role="status" className="text-center text-sm text-charcoal-2">{results.length === 0 ? 'Waiting for the first result.' : 'No results in this filter yet.'}</p>
              <div aria-hidden="true" className="scan-skeleton mt-4 space-y-4">
                {[0, 1, 2].map((index) => <div key={index} className="flex items-center gap-3"><span className="skeleton-block h-9 w-9 rounded-xl" /><span className="skeleton-block h-3 flex-1 rounded-full" /><span className="skeleton-block h-6 w-16 rounded-full" /></div>)}
              </div>
            </div>
          ) : busy ? (
            /*
              Rules between the rows, and no box around them. The list already
              sits inside the search panel; drawing a second bordered rectangle
              inside the first is the thing that makes an interface look like
              cards all the way down.
            */
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {shown.map((row, i) => (
                  <li
                    key={row.key}
                    className="animate-rise flex items-center justify-between gap-4 py-3.5"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-charcoal">
                        <SourceLogo label={row.label} size="sm" />
                        {row.label}
                        {row.category === '' ? null : (
                          <span className="text-[10px] tracking-widest text-faint uppercase">
                            {row.category}
                          </span>
                        )}
                      </p>
                      <p className="truncate font-mono text-xs text-charcoal-2">{row.detail}</p>
                    </div>
                    <StatusPill tone={row.tone}>{row.statusLabel}</StatusPill>
                  </li>
              ))}
            </ul>
          ) : null}

        </>
      )}
    </div>
  )
}
