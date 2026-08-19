import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/core/scan'

/**
 * Refining a result, after the fact.
 *
 * The homepage asks nothing, so this is where a person says what they are
 * naming. It changes which places lead the grid and how the score underneath
 * is weighted. Reached only from the "change" link on a result, which is why
 * it is a plain list of links and not a form: one tap, straight back to the
 * answer.
 */
export function CategoryPicker({ name, current }: { name: string; current: Category }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-16">
      <h1 className="text-center font-display text-2xl font-bold tracking-tight text-charcoal">
        What are you naming?
      </h1>
      <p className="mt-2 text-center text-[14px] text-faint">
        Changes which places matter most for <span className="text-charcoal-2">{name}</span>.
      </p>

      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/n/${encodeURIComponent(name)}?as=${category}`}
            className={`rounded-xl border px-4 py-3 text-[14.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              category === current
                ? 'border-accent bg-accent-soft font-medium text-accent'
                : 'border-line bg-surface text-charcoal-2 hover:border-line-strong hover:text-charcoal'
            }`}
          >
            {CATEGORY_LABELS[category]}
          </Link>
        ))}
      </div>
    </div>
  )
}
