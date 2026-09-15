import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page-shell max-w-[840px]">
      <p className="text-sm font-medium text-faint">
        404
      </p>

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
