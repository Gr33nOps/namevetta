import Link from 'next/link'
import { signOut } from '@/app/auth/actions'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { NavLinks } from './NavLinks'

/** The wordmark glyph — a stylised N, from the design system. */
function Mark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current text-white" aria-hidden="true">
        <path d="M3 4h2v5.5L13 4h2v12h-2V10.5L5 16H3V4z" />
      </svg>
    </span>
  )
}

/**
 * Site navigation.
 *
 * A server component so the signed-in state is correct on first paint rather
 * than flashing signed-out and then correcting itself. The interactive parts
 * live in `NavLinks`.
 */
export async function SiteNav() {
  const user = await currentUser()
  const accountsAvailable = isDatabaseConfigured()

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="flex items-center text-sm font-semibold tracking-tight text-charcoal">
            NameVetta
            <span className="ml-1.5 rounded border border-line px-1 py-0.5 text-xs font-normal text-faint">
              beta
            </span>
          </span>
        </Link>

        <NavLinks signedIn={user !== undefined} />

        <div className="flex items-center gap-2">
          {!accountsAvailable ? null : user !== undefined ? (
            <>
              <Link
                href="/account"
                className="hidden text-sm text-charcoal-2 transition-colors hover:text-charcoal md:block"
              >
                {user.displayName}
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-charcoal-2 transition-colors hover:border-line-strong hover:text-charcoal"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="hidden px-2 py-1.5 text-sm text-charcoal-2 transition-colors hover:text-charcoal md:block"
              >
                Sign in
              </Link>
              <Link
                href="/auth"
                className="rounded-lg bg-charcoal px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-charcoal/90"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
