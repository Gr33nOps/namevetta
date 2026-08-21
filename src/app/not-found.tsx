import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 py-24 text-center">
      <p className="font-display text-7xl font-semibold tabular-nums text-accent sm:text-8xl">
        404
      </p>
      <div aria-hidden="true" className="mt-5 h-px w-16 border-t border-dashed border-line-strong" />

      <h1 className="mt-6 font-display text-[34px] font-semibold tracking-[-0.03em] text-charcoal sm:text-[40px]">
        Page not found
      </h1>

      <p className="mt-3 max-w-[480px] text-charcoal-2">
        Check the address, or start a new name check.
      </p>

      <Link
        href="/"
        className="mt-8 btn-primary rounded-xl px-5 py-2 text-sm"
      >
        Check a name
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
