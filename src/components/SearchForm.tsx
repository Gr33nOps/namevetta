'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('saas')
  const [description, setDescription] = useState('')
  const [scanType, setScanType] = useState<ScanType>('quick')
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSearch = name.trim().length > 0

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
      <div
        className={`rounded-xl border bg-surface shadow-sm transition-all duration-200 ${
          focused ? 'border-accent-border ring-2 ring-accent/15' : 'border-line'
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <SearchIcon />
          <label htmlFor="name" className="sr-only">
            Name to research
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (e.target.value.trim()) setExpanded(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            maxLength={MAX_NAME_LENGTH}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder="Enter a name to research…"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : 'search-error'}
            className="flex-1 bg-transparent text-lg text-charcoal outline-none placeholder:text-faint"
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
          ) : null}
        </div>

        {expanded ? (
          <div className="animate-fade-in border-t border-line bg-muted-bg/50 px-4 pb-4 pt-3">
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
                  <span className="font-normal text-faint">(optional — improves relevance)</span>
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

            <fieldset>
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
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
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

        <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
          {expanded ? (
            <span className="text-xs text-faint">Press Enter to run</span>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm text-charcoal-2 transition-colors hover:text-charcoal"
            >
              + Set category and description
            </button>
          )}

          <button
            type="submit"
            disabled={!canSearch}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
