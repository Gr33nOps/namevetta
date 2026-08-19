'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { MAX_NAME_LENGTH } from '@/lib/core/scan'

const RECENT_KEY = 'nv-recent'
const MAX_RECENT = 4

/** Read the recent list, tolerating anything that is not the shape we wrote. */
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

/**
 * The whole homepage interaction.
 *
 * One field, one button. No category, no description, no depth picker: every
 * one of those was a question asked before the product had given anything, and
 * all of them are answerable afterwards on the result itself.
 *
 * Recent names live in `localStorage`, not the database, so they work for a
 * signed-out visitor and never become something we store about anyone.
 */
export function NameSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    // localStorage is client-only, so this can only be known after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent())
  }, [])

  const go = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed === '') return
    rememberName(trimmed)
    router.push(`/n/${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(name)
        }}
        className="flex items-center gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 pl-4 shadow-[0_2px_10px_-4px_rgba(22,21,31,0.18)] focus-within:border-accent"
      >
        <label htmlFor="name" className="sr-only">
          Name to check
        </label>
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
          placeholder="Type a name"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] text-charcoal outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={name.trim() === ''}
          className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Check
        </button>
      </form>

      {recent.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[12.5px] text-faint">Recent</span>
          {recent.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => go(item)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-charcoal-2 transition-colors hover:border-line-strong hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
