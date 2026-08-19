import Image from 'next/image'
import Link from 'next/link'
import { signOut } from '@/app/auth/actions'
import { currentUser } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { NavLinks } from './NavLinks'
import { ThemeToggle } from './ThemeToggle'

/** The wordmark glyph — the brand mark. */
function Mark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center">
      <Image src="/logo.png" alt="" width={28} height={28} priority className="h-7 w-7" />
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
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="flex items-center text-sm font-bold tracking-tight text-charcoal">
            NameVetta
            <span className="ml-1.5 hidden rounded border border-line px-1 py-0.5 text-xs font-normal text-faint sm:inline-block">
              beta
            </span>
          </span>
        </Link>

        <NavLinks
          signedIn={user !== undefined}
          accountsAvailable={accountsAvailable}
          displayName={user?.displayName}
          onSignOut={accountsAvailable ? signOut : undefined}
        />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!accountsAvailable ? null : user !== undefined ? (
            <>
              <Link
                href="/account"
                className="hidden text-sm text-charcoal-2 transition-colors hover:text-charcoal lg:block"
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
                className="hidden px-2 py-1.5 text-sm text-charcoal-2 transition-colors hover:text-charcoal lg:block"
              >
                Sign in
              </Link>
              <Link
                href="/auth"
                title="Save your history, raise your daily limits, no card required"
                className="hidden rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover lg:block"
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
