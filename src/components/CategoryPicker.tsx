import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS, type Category, type ScanType } from '@/lib/core/scan'

/**
 * Refining a result, after the fact.
 *
 * The homepage asks nothing, so this is where a person says what they are
 * naming. It changes which places lead the grid and how the score underneath
 * is weighted. Reached only from the "change" link on a result, which is why
 * it is a plain list of links and not a form: one tap, straight back to the
 * answer.
 */
export function CategoryPicker({
  name,
  current,
  scanType,
  includeSpecialized,
}: {
  name: string
  current: Category
  scanType: ScanType
  includeSpecialized: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-16">
      <h1 className="text-center font-display text-[28px] font-semibold tracking-[-0.03em] text-charcoal">
        What are you naming?
      </h1>
      <p className="mt-2 text-center text-[14px] text-faint">
        Pick the closest fit for <span className="text-charcoal-2">{name}</span>. This changes
        weighting, not which core sources are checked.
      </p>

      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/n/${encodeURIComponent(name)}?as=${category}${scanType === 'deep' ? '&deep=1' : ''}${includeSpecialized ? '&broad=1' : ''}`}
            /*
              The chosen one is filled with the brand gradient rather than
              `card`'s tint. `card` paints a background colour of its own, so
              the two cannot both apply: an accent fill layered on it never
              showed, and every tile looked unselected.
            */
            className={`press rounded-xl border px-4 py-3 text-[14.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              category === current
                ? 'btn-primary border-transparent'
                : 'card font-medium text-charcoal-2 hover:border-accent-border hover:text-charcoal'
            }`}
          >
            {CATEGORY_LABELS[category]}
          </Link>
        ))}
      </div>
    </div>
  )
}
