import 'server-only'

/**
 * Server-side authentication.
 *
 * Sessions live in cookies, refreshed by middleware, and every read goes through
 * `getUser()` rather than `getSession()`. That distinction matters: `getSession`
 * returns whatever the cookie claims without verifying it, so trusting it for
 * authorisation would let a forged cookie assert any identity. `getUser`
 * revalidates against Supabase.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dbEnv, isDatabaseConfigured } from './client'

/**
 * Supabase client bound to the request's cookies.
 *
 * Respects RLS, so anything read through it is scoped to the signed-in user by
 * the database rather than by application code remembering to filter.
 */
export async function sessionClient(): Promise<SupabaseClient> {
  const env = dbEnv()
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so a failure here is expected and safe.
        }
      },
    },
  })
}

export interface AuthedUser {
  id: string
  email: string | undefined
  displayName: string | undefined
}

/**
 * The signed-in user, or undefined.
 *
 * Returns undefined rather than throwing when the database is unconfigured, so
 * the whole product keeps working without credentials — signed out, but working.
 */
export async function currentUser(): Promise<AuthedUser | undefined> {
  if (!isDatabaseConfigured()) return undefined

  try {
    const supabase = await sessionClient()
    const { data, error } = await supabase.auth.getUser()
    if (error !== null || data.user === null) return undefined

    const meta = data.user.user_metadata as { full_name?: string } | null
    return {
      id: data.user.id,
      email: data.user.email,
      displayName: meta?.full_name ?? data.user.email?.split('@')[0],
    }
  } catch {
    return undefined
  }
}
