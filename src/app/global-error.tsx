'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import './globals.css'

// global-error replaces the root layout entirely when it fires, so it
// defines its own html/body and can't assume next/font or SiteNav ran —
// this only fires for errors the root layout itself throws.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // The root layout failing is the most serious thing that can happen in the
    // browser and was, until now, the one error nothing reported.
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui, sans-serif' }}
        className="flex min-h-screen flex-col items-start justify-center bg-canvas px-6 text-charcoal"
      >
        <div className="mx-auto w-full max-w-[480px]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">Error</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-charcoal-2">
            Reload the page, then try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-8 btn-primary rounded-xl px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
          {error.digest === undefined ? null : (
            <p className="mt-8 font-mono text-xs text-faint">Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
