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
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 py-24 text-center">
      <h1 className="font-display text-[34px] font-semibold tracking-[-0.03em] text-charcoal sm:text-[40px]">
        Something went wrong
      </h1>

      <p className="mt-3 max-w-[480px] text-balance text-charcoal-2">
        Try again, or start a new name check.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="btn-primary rounded-xl px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
        <Link
          href="/"
          className="btn-secondary rounded-xl px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Check a name
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
