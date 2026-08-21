import { NextResponse } from 'next/server'
import { sessionClient } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

function safeNext(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) return '/history'
  return value
}

/** Exchange Supabase's one-time PKCE code for a cookie-backed session. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!isDatabaseConfigured() || code === null || code === '') {
    return NextResponse.redirect(new URL('/auth?error=confirmation', url.origin))
  }

  const supabase = await sessionClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error !== null) {
    return NextResponse.redirect(new URL('/auth?error=confirmation', url.origin))
  }

  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url.origin))
}
