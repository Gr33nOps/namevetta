'use client'

import './globals.css'

// global-error replaces the root layout entirely when it fires, so it
// defines its own html/body and can't assume next/font or SiteNav ran —
// this only fires for errors the root layout itself throws.
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
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
            That&apos;s on us, not you. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-8 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
