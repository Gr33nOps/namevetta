'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The navigation entry point for name generation.
 *
 * The link always names the other main task. A visitor making ideas gets an
 * explicit way back to a name check without having to infer that the mark is
 * also a navigation control.
 *
 * `usePathname` rather than a prop threaded down from each page: the header is
 * rendered once in the root layout, and passing the route into it from there
 * would mean reading params in a server layout, which opts every static page
 * in the app out of static rendering to decide two words.
 *
 * `startsWith` rather than equality, so a future `/generate/…` keeps the same
 * label instead of silently reverting.
 *
 * The phone label is shorter so the account control and theme switch remain
 * reachable without turning the header into a second row.
 */
export function NavModeLink() {
  const pathname = usePathname()
  const onGenerator = pathname?.startsWith('/generate') ?? false

  return (
    <Link
      href={onGenerator ? '/' : '/generate'}
      className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-charcoal-2 whitespace-nowrap transition-colors hover:bg-muted-bg hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      {onGenerator ? (
        <>
          <span className="sm:hidden">Search</span>
          <span className="hidden sm:inline">Back to search</span>
        </>
      ) : (
        <>
          <span className="sm:hidden">Ideas</span>
          <span className="hidden sm:inline">Generate ideas</span>
        </>
      )}
    </Link>
  )
}
