'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 *
 * Used only where a client component needs the session Supabase itself
 * detected from the page URL — a password-recovery link lands its session
 * token in the URL fragment, which is never sent to the server, so no
 * server action can see it. Everything else in this app goes through the
 * cookie-bound server client in `@/lib/db/auth` instead.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
}
