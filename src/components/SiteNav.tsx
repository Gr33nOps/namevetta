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
    <header className="nav-shell sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4 print:hidden">
      <div className="glass-bar mx-auto grid min-h-[52px] w-full max-w-[1200px] grid-cols-[1fr_auto] grid-rows-[auto_auto] items-center gap-1 rounded-2xl px-3 py-1.5 sm:h-[58px] sm:grid-cols-[auto_1fr_auto] sm:grid-rows-1 sm:gap-7 sm:rounded-panel sm:px-3 sm:py-0 sm:pl-5">
        <Link
          href="/"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <SiteMark wordFrom="sm" />
        </Link>

        <PrimaryNav />
        <div className="flex items-center justify-self-end gap-1.5 text-[14.5px] text-charcoal-2 sm:gap-3">
          <NavSession />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
