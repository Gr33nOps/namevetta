import Link from 'next/link'
import { MAX_COMPARE_NAMES, MIN_COMPARE_NAMES } from '@/lib/core/scan'

export const metadata = {
  title: 'Compare names — NameVetta',
  description: 'Research 2–5 candidate names against the same category and see why one stands out.',
}

/**
 * Compare Names (§26, §52).
 *
 * The setup screen exists so the navigation is not a dead link, and it says
 * plainly that the feature is not running yet rather than presenting a form
 * that quietly goes nowhere. Comparison needs the scan orchestrator to run N
 * names against one shared context and a results table to rank them, which is
 * its own piece of work.
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Compare names</p>

      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
        Compare {MIN_COMPARE_NAMES}–{MAX_COMPARE_NAMES} name candidates
      </h1>

      <p className="mt-3 text-lg leading-relaxed text-charcoal-2">
        Enter your candidates and one shared category. We research them all and explain why one
        stands out.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold text-charcoal">Not available yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-charcoal-2">
          Comparison runs the full research pipeline once per candidate and ranks the results
          side by side. The research engine is built and working — the comparison view is the next
          feature to land.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-charcoal-2">
          In the meantime you can research candidates one at a time; each report is
          self-contained, so they are directly comparable.
        </p>

        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Research a single name
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  )
}
