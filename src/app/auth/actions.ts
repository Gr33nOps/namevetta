'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sessionClient } from '@/lib/db/auth'
import { isDatabaseConfigured } from '@/lib/db/client'

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

export interface AuthState {
  error?: string
  message?: string
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

  const supabase = await sessionClient()
  const { data, error } = await supabase.auth.signUp(parsed.data)

  if (error !== null) {
    return { error: 'That account could not be created. Try a different address.' }
  }

  // With email confirmation on, Supabase returns a user but no session.
  if (data.session === null) {
    return {
      message: 'Check your email for a confirmation link, then sign in.',
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
