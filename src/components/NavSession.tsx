'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { browserClient } from '@/lib/db/browserClient'

/**
 * Whether there is an auth service to ask at all. Known at build time, so it
 * decides the initial state rather than being discovered inside an effect.
 */
const CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined

/**
 * The half of the navigation that depends on who is asking.
 *
 * A client component on purpose. Reading the session on the server would mean
 * reading cookies in the root layout, which opts every page in the app out of
 * static rendering — the homepage, the legal pages, the source status page,
 * all of them rendered per request to decide one word in the header. This
 * costs a swap after hydration instead, and the swap is between two links of
 * similar width so nothing else on the row moves.
 *
 * Signed out it offers an account. Signed in it offers the account area; the
 * primary navigation owns History so it stays in the same position for every
 * visitor.
 */
export function NavSession() {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(CONFIGURED ? undefined : false)

  useEffect(() => {
    if (!CONFIGURED) return

    const supabase = browserClient()
    let live = true

    void supabase.auth.getUser().then(({ data }) => {
      if (live) setSignedIn(data.user !== null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) setSignedIn(session?.user != null)
    })

    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Undefined means "not known yet". Rendering the signed-out state here would
  // flash "Sign up" at somebody who is already signed in, which reads as being
  // logged out. The space is held instead.
  if (signedIn === undefined) {
    return <span aria-hidden="true" className="h-9 w-[86px]" />
  }

  // The one control in the header with a fill behind it. Everything else in
  // the row is text, so this reads as the thing to do without needing a
  // colour, a glow or a badge to say so.
  if (!signedIn) {
    return (
      <Link
        href="/auth"
        className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-charcoal hover:text-accent-ink"
      >
        Sign in
      </Link>
    )
  }

  return (
    <Link
      href="/account"
      className="btn-secondary px-3.5 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4 sm:text-[14px]"
    >
      Account
    </Link>
  )
}
