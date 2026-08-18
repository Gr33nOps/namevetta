'use client'

import Script from 'next/script'
import { useActionState, useState } from 'react'
import { signIn, signUp, type AuthState } from '@/app/auth/actions'

const initial: AuthState = {}

export function AuthForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [signInState, signInAction, signingIn] = useActionState(signIn, initial)
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initial)

  const isSignIn = mode === 'signin'
  const state = isSignIn ? signInState : signUpState
  const pending = isSignIn ? signingIn : signingUp

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      {turnstileSiteKey === undefined ? null : (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      <div className="mb-6 flex gap-1 rounded-lg bg-muted-bg p-1">
        {(
          [
            { value: 'signin' as const, label: 'Sign in' },
            { value: 'signup' as const, label: 'Create account' },
          ]
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMode(tab.value)}
            aria-pressed={mode === tab.value}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
              mode === tab.value
                ? 'bg-surface font-medium text-charcoal shadow-sm'
                : 'text-charcoal-2 hover:text-charcoal'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form action={isSignIn ? signInAction : signUpAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-all placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignIn ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-all placeholder:text-faint focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {/* Scoped to account creation, not sign-in — that's the one flow a
            bot has something to gain from. A fresh key on each mode switch so
            Cloudflare's script reliably picks up the element as newly mounted
            rather than an update to one it already rendered into. */}
        {!isSignIn && turnstileSiteKey !== undefined ? (
          <div key="signup-turnstile" className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        ) : null}

        {state.error !== undefined ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        {state.message !== undefined ? (
          <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? 'Working…' : isSignIn ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-faint">
        An account raises your daily allowance and keeps your history. Research works without
        one — you get 5 Quick Checks and 1 Deep Research per day as a guest.
      </p>
    </div>
  )
}
