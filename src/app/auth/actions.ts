'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sessionClient } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'
import { clientIp } from '@/lib/db/identity'
import { verifyTurnstile } from '@/lib/turnstile'

/**
 * Authentication actions.
 *
 * Errors are returned as plain messages rather than thrown, so the form can
 * render them. Supabase's own error text is deliberately not passed through —
 * it leaks whether an address is registered, which turns the sign-in form into
 * an account-enumeration oracle.
 */

const CredentialsSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Passwords must be at least 8 characters'),
})

const EmailSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export interface AuthState {
  error?: string
  message?: string
}

/** The origin to build a redirect link on, taken from the request rather
 * than an env var since none is configured for this deployment. */
async function requestOrigin(): Promise<string> {
  const reqHeaders = await headers()
  const host = reqHeaders.get('host') ?? 'localhost:3000'
  const proto = reqHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Accounts are not available in this environment.' }
  }

  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details' }
  }

  const supabase = await sessionClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error !== null) {
    if (error.status === 429) {
      return { error: 'Too many attempts. Wait a moment and try again.' }
    }
    // Deliberately generic: distinguishing "no such account" from "wrong
    // password" tells an attacker which addresses are registered here.
    return { error: 'Those details did not match an account.' }
  }

  redirect('/history')
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Accounts are not available in this environment.' }
  }

  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details' }
  }

  // Scoped to account creation, not every request — this is the one flow
  // where a bot has something to gain. A no-op when TURNSTILE_SECRET_KEY is
  // unset, so a deployment that hasn't configured it behaves exactly as it
  // did before this existed.
  const reqHeaders = await headers()
  const turnstileToken = formData.get('cf-turnstile-response')
  const verified = await verifyTurnstile(
    typeof turnstileToken === 'string' ? turnstileToken : undefined,
    clientIp(reqHeaders),
  )
  if (!verified) {
    return { error: 'Verification failed. Please try again.' }
  }

  const supabase = await sessionClient()
  const origin = await requestOrigin()
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/history` },
  })

  if (error !== null) {
    if (error.status === 429) {
      return { error: 'Too many attempts. Wait a moment and try again.' }
    }
    return { error: 'That account could not be created. Try a different address.' }
  }

  // With email confirmation on, Supabase returns a user but no session.
  if (data.session === null) {
    return {
      message: 'Check your email for a confirmation link. It will sign you in.',
    }
  }

  redirect('/history')
}

export async function signOut(): Promise<void> {
  if (isDatabaseConfigured()) {
    const supabase = await sessionClient()
    await supabase.auth.signOut()
  }
  redirect('/')
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Accounts are not available in this environment.' }
  }

  const parsed = EmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details' }
  }

  const origin = await requestOrigin()
  const supabase = await sessionClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset`,
  })

  if (error !== null && error.status === 429) {
    return { error: 'Too many attempts. Wait a moment and try again.' }
  }

  // Same message whether or not the address has an account — confirming
  // either way turns this into an account-enumeration oracle.
  return { message: 'If that address has an account, a reset link is on its way.' }
}
