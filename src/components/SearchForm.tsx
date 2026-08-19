'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  ScanContextSchema,
  type Category,
  type ScanType,
} from '@/lib/core/scan'

const DEPTHS: { value: ScanType; label: string; sub: string; badge: string }[] = [
  {
    value: 'quick',
    label: 'Quick Check',
    sub: 'Core digital sources',
    badge: 'Free · 5/day',
  },
  {
    value: 'deep',
    label: 'Deep Research',
    sub: 'Broader evidence + similarity analysis',
    badge: 'Free · 1/day',
  },
]

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5 flex-shrink-0 text-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M16 16l-3-3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The homepage search (§3).
 *
 * Progressive disclosure: one input to start, and the category/description/depth
 * controls unfold once there is something to search for. The extra fields
 * genuinely improve relevance, but asking for them up front turns a ten-second
 * action into a form.
 *
 * Validation runs through the same Zod schema the API uses, so the client cannot
 * construct a request the server would reject and the error text stays identical
 * in both places.
 */
export function SearchForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('saas')
  const [description, setDescription] = useState('')
  const [scanType, setScanType] = useState<ScanType>('quick')
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guessed at render, corrected on mount — Mac gets ⌘K, everyone else gets
  // Ctrl K, so the hint matches the key that actually works.
  const [isMac, setIsMac] = useState(true)

  const canSearch = name.trim().length > 0

  // A quick way in for anyone who reaches for it out of habit — Ctrl/Cmd+K
  // focuses the search box from anywhere on the page.
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent))

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const submit = (): void => {
    const parsed = ScanContextSchema.safeParse({
      name,
      category,
      description: description.trim() === '' ? undefined : description,
      scanType,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input')
      return
    }
    setError(null)

    const params = new URLSearchParams({
      name: parsed.data.name,
      category: parsed.data.category,
      type: parsed.data.scanType,
    })
    if (parsed.data.description !== undefined) params.set('description', parsed.data.description)
    router.push(`/scan?${params.toString()}`)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !canSearch) return
    if (!expanded) setExpanded(true)
    else submit()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="w-full"
    >
      <div className="rounded-xl border border-line bg-surface transition-all duration-200 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(99,91,255,0.15),0_8px_24px_-8px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <SearchIcon />
          <label htmlFor="name" className="sr-only">
            Name to research
          </label>
          <input
            id="name"
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (e.target.value.trim()) setExpanded(true)
            }}
            onKeyDown={onKeyDown}
            maxLength={MAX_NAME_LENGTH}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder="Enter a name to research…"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : 'search-error'}
            className="min-w-0 flex-1 bg-transparent text-lg text-charcoal outline-none placeholder:text-faint"
          />
          {name !== '' ? (
            <button
              type="button"
              onClick={() => {
                setName('')
                setExpanded(false)
              }}
              className="text-xl leading-none text-faint transition-colors hover:text-charcoal-2"
              aria-label="Clear name"
            >
              ×
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-faint-2 sm:inline-block">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          )}
        </div>

        {expanded ? (
          <div className="animate-fade-in border-t border-line bg-muted-bg/50 px-4 pb-4 pt-3">
            <p className="mb-3 pt-3 text-xs text-faint">
              Category and description tell similarity and industry matching what to weigh, so an
              unrelated company with the same name doesn&rsquo;t count against you.
            </p>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-charcoal-2">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-charcoal outline-none transition-all focus:border-accent-border focus:ring-2 focus:ring-accent/20"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="mb-1.5 block text-xs font-medium text-charcoal-2"
                >
                  Description{' '}
                  <span className="font-normal text-faint">(optional, improves relevance)</span>
                </label>
                <input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder="One sentence about what you're naming…"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-charcoal outline-none transition-all placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <fieldset className="min-w-0">
              <legend className="mb-2 block text-xs font-medium text-charcoal-2">
                Research depth
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEPTHS.map((depth) => (
                  <button
                    key={depth.value}
                    type="button"
                    onClick={() => setScanType(depth.value)}
                    aria-pressed={scanType === depth.value}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      scanType === depth.value
                        ? 'border-accent bg-accent-soft ring-1 ring-accent/30'
                        : 'border-line bg-surface hover:border-accent-border'
                    }`}
                  >
                    <span className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-charcoal">{depth.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                          scanType === depth.value
                            ? 'bg-accent/10 text-accent'
                            : 'bg-muted-bg text-faint'
                        }`}
                      >
                        {depth.badge}
                      </span>
                    </span>
                    <span className="block text-xs text-charcoal-2">{depth.sub}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3">
          {expanded ? (
            <span className="text-xs text-faint">Press Enter to run</span>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm text-charcoal-2 transition-colors hover:text-charcoal"
            >
              + Add context for more accurate results
            </button>
          )}

          <button
            type="submit"
            disabled={!canSearch}
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {scanType === 'deep' ? 'Run Deep Research' : 'Run Quick Check'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {error !== null ? (
        <p id="search-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
