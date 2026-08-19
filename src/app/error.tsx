'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-start px-6 py-24">
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Error</p>

      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-charcoal sm:text-4xl">
        Something went wrong
      </h1>

      <p className="mt-3 max-w-[480px] text-charcoal-2">
        That&apos;s on us, not you. Try again, or head back and start a new search.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-charcoal-2 transition-colors hover:border-line-strong hover:text-charcoal"
        >
          Back to New Check
        </Link>
      </div>
    </div>
  )
}
