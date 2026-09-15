import Link from 'next/link'
import { NavSession } from '@/components/NavSession'
import { PrimaryNav } from '@/components/PrimaryNav'
import { SiteMark } from '@/components/SiteMark'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * The whole navigation.
 *
 * A wordmark, three stable primary destinations, and whoever is doing it.
 *
 * It is a pane of glass held clear of the top of the page rather than a bar
 * painted across it, and it is sticky, which is the argument for the glass:
 * this is one of the few surfaces in the app with the page genuinely moving
 * behind it. As you scroll it settles — a little more opaque, a little more
 * shadow — which is handled by a scroll-timeline in `globals.css` and costs no
 * JavaScript and no state.
 *
 * The primary navigation, theme toggle, and session control are client
 * components because they read browser state. Keeping those reads in small
 * islands lets the rest of the public pages remain static.
 *
 * The primary tasks are simple text tabs. The selected task gets a gradient
 * underline, while account remains separate.
 */
export function SiteNav() {
  return (
    <header className="nav-shell sticky top-0 z-50 print:hidden">
      <div className="mx-auto grid w-full max-w-[1088px] grid-cols-[1fr_auto] grid-rows-[auto_auto] items-center gap-x-3 px-5 pt-2 lg:min-h-16 lg:grid-cols-[auto_1fr_auto] lg:grid-rows-1 lg:gap-8 lg:px-6 lg:pt-0">
        <Link
          href="/"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <SiteMark />
        </Link>

        <PrimaryNav />
        <div className="flex items-center justify-self-end gap-1.5 text-[14.5px] text-charcoal-2 lg:gap-3">
          <NavSession />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

