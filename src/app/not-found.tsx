import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 py-24 text-center">
      <p className="font-display text-7xl font-extrabold tabular-nums text-accent sm:text-8xl">
        404
      </p>
      <div aria-hidden="true" className="mt-5 h-px w-16 border-t border-dashed border-line-strong" />

      <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-charcoal sm:text-4xl">
        Page not found
      </h1>

      <p className="mt-3 max-w-[480px] text-charcoal-2">
        That page doesn&apos;t exist, or it moved. Check the address, or start a new search.
      </p>

      <Link
        href="/"
        className="mt-8 flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Back to New Check
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
