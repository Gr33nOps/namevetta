import Link from 'next/link'
import { NavModeLink } from '@/components/NavModeLink'
import { NavSession } from '@/components/NavSession'
import { SiteMark } from '@/components/SiteMark'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * The whole navigation.
 *
 * A wordmark, the next useful action, and whoever is doing it.
 *
 * It is a pane of glass held clear of the top of the page rather than a bar
 * painted across it, and it is sticky, which is the argument for the glass:
 * this is one of the few surfaces in the app with the page genuinely moving
 * behind it. As you scroll it settles — a little more opaque, a little more
 * shadow — which is handled by a scroll-timeline in `globals.css` and costs no
 * JavaScript and no state.
 *
 * Three of the four things on the right are client components, each for its
 * own reason: `NavModeLink` needs the current route, `ThemeToggle` needs
 * `localStorage`, and `NavSession` needs the session. None of them is a client
 * component because it is interactive; they are client components because
 * reading any of those on the server would make every static page in the app
 * render per request.
 *
 * The links are plain text. Boxing each of them would give the row four
 * competing surfaces and say nothing about which one matters; only the
 * account control, on the right, gets an edge of its own.
 */
export function SiteNav() {
  return (
    <header className="nav-shell sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4 print:hidden">
      <div className="glass-bar mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-2 rounded-2xl pr-2 pl-4 sm:h-[66px] sm:gap-5 sm:rounded-panel sm:pr-3 sm:pl-6">
        <Link
          href="/"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <SiteMark wordFrom="sm" />
        </Link>

        {/*
          The anchor is absolute rather than a bare fragment so it works from a
          report or a legal page, where there is no `#how` to scroll to.
        */}
        <nav
          aria-label="Main"
          className="flex items-center gap-2.5 text-[14.5px] text-charcoal-2 sm:gap-5"
        >
          <NavModeLink />
          {/*
            A rule, so the row reads as two groups rather than one queue.

            The toggle sat between "Generate names" and the account control
            with nothing to say which side it belonged to — a bare icon
            floating between two buttons. Navigation is on the left of this
            line; how the page looks and who is looking at it are on the right.
          */}
          <NavSession />
          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
