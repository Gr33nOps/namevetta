import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PRIVATE_CACHE_CONTROL = 'private, no-store, no-cache, must-revalidate, max-age=0'

function applyPrivateCachePolicy(request: NextRequest, response: NextResponse): NextResponse {
  const pathname = request.nextUrl.pathname
  const isPrivateRoute =
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname === '/history' ||
    pathname === '/saved' ||
    pathname.startsWith('/r/')

  if (isPrivateRoute) response.headers.set('Cache-Control', PRIVATE_CACHE_CONTROL)
  return response
}

/**
 * Session refresh.
 *
 * Supabase access tokens are short-lived. Without a refresh on each request the
 * user is signed out mid-session, so this runs before every page and rewrites
 * the auth cookies onto the outgoing response.
 *
 * It deliberately does **not** guard routes. Authorisation lives in RLS, where
 * the database enforces it; a proxy redirect is a convenience, and treating it
 * as a security boundary is how people end up with unprotected API routes
 * behind a protected page.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // The product runs without a database. No credentials means no session to
  // refresh, and the request should pass straight through.
  if (url === undefined || key === undefined || url === '' || key === '') {
    return applyPrivateCachePolicy(request, NextResponse.next({ request }))
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, responseHeaders) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options)
        }
        for (const [name, value] of Object.entries(responseHeaders)) {
          response.headers.set(name, value)
        }
      },
    },
  })

  // This verifies the token and refreshes it when needed. The result is unused.
  await supabase.auth.getClaims()

  return applyPrivateCachePolicy(request, response)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never carry a
     * session and refreshing on them would burn requests for nothing.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
