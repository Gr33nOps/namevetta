import { CompareRunner } from '@/components/CompareRunner'
import { MAX_COMPARE_NAMES, MIN_COMPARE_NAMES } from '@/lib/core/scan'

export const metadata = {
  title: 'Compare names — NameVetta',
  description: 'Research 2–5 candidate names against the same category and see why one stands out.',
}

/**
 * Compare Names (§26, §52).
 *
 * "That is much more valuable than simply checking names individually." Each
 * candidate goes through the identical research pipeline a single scan uses, so
 * a compared score means exactly what a standalone score means.
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-14">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Compare names</p>

      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
        Compare {MIN_COMPARE_NAMES}–{MAX_COMPARE_NAMES} name candidates
      </h1>

      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-charcoal-2">
        Enter your candidates and one shared category. We research them all and explain why one
        stands out.
      </p>

      <div className="mt-8">
        <CompareRunner />
      </div>
    </div>
  )
}
