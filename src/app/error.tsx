'use client'

import * as Sentry from '@sentry/nextjs'
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
    // `instrumentation.ts` wires `onRequestError` for the server, but that hook
    // never sees a client-side render error. Without this call every crash a
    // user actually experiences in the browser is invisible, which is the
    // opposite of what having Sentry configured is supposed to buy.
    Sentry.captureException(error)
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-start px-6 py-24">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-charcoal sm:text-4xl">
        Something went wrong
      </h1>

      <p className="mt-3 max-w-[480px] text-charcoal-2">
        That&apos;s on us, not you. Try again, or head back and start a new search.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-charcoal-2 transition-colors hover:border-line-strong hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to New Check
        </Link>
      </div>

      {/*
        The digest is the only handle that ties what the user saw to the report
        we received. Showing it means a bug report can name the exact error
        instead of describing it.
      */}
      {error.digest === undefined ? null : (
        <p className="mt-8 font-mono text-xs text-faint">
          Reference: {error.digest}
        </p>
      )}
    </div>
  )
}
