'use client'

import Script from 'next/script'
import { useActionState, useState } from 'react'
import { requestPasswordReset, signIn, signUp, type AuthState } from '@/app/auth/actions'
import { browserClient } from '@/lib/db/browserClient'
import { SourceLogo } from '@/components/SourceLogo'

const initial: AuthState = {}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {open ? (
        <>
          <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="10" r="2.25" />
        </>
      ) : (
        <>
          <path
            d="M3 3l14 14M8.3 8.4a2.25 2.25 0 0 0 3.3 3.3M6.2 6.3C4 7.6 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.4 3.7-1M14 6.2c2.3 1.3 4 3.8 4 3.8s-.6 1.1-1.7 2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}

export function AuthForm({
  turnstileSiteKey,
}: {
  turnstileSiteKey?: string
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const [oauthProvider, setOauthProvider] = useState<'google' | 'github' | undefined>()
  const [oauthError, setOauthError] = useState<string | undefined>()
  const [signInState, signInAction, signingIn] = useActionState(signIn, initial)
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initial)
  const [resetState, resetAction, resetting] = useActionState(requestPasswordReset, initial)

  if (mode === 'reset') {
    return (
      <div className="card rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="mt-1 text-sm text-charcoal-2">
          Enter your email and we&rsquo;ll send a reset link.
        </p>

        <form action={resetAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full field rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {resetState.error !== undefined ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {resetState.error}
            </p>
          ) : null}

          {resetState.message !== undefined ? (
            <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{resetState.message}</p>
          ) : null}

          <button
            type="submit"
            disabled={resetting}
            className="w-full btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {resetting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode('signin')}
          className="mt-4 text-sm text-charcoal-2 underline underline-offset-2 hover:text-charcoal"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  const isSignIn = mode === 'signin'
  const state = isSignIn ? signInState : signUpState
  const pending = isSignIn ? signingIn : signingUp

  async function continueWith(provider: 'google' | 'github') {
    setOauthProvider(provider)
    setOauthError(undefined)

    const { error } = await browserClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/history`,
      },
    })

    if (error !== null) {
      setOauthProvider(undefined)
      setOauthError('That sign-in option is unavailable right now. Try email sign-in instead.')
    }
  }

  return (
    <div className="panel rounded-panel p-6 sm:p-7">
      {turnstileSiteKey === undefined ? null : (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}

      <div className="mb-6 flex gap-1 rounded-xl bg-muted-bg p-1">
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
            className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors ${
              mode === tab.value
                ? 'bg-surface font-medium text-charcoal shadow-sm'
                : 'text-charcoal-2 hover:text-charcoal'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid gap-2">
        {(['google', 'github'] as const).map(provider => (
          <button key={provider} type="button" onClick={() => void continueWith(provider)} disabled={oauthProvider !== undefined} className="btn-secondary w-full px-4 py-3 text-sm">
            <SourceLogo label={provider === 'google' ? 'Google' : 'GitHub'} />
            {oauthProvider === provider ? 'Opening…' : `Continue with ${provider === 'google' ? 'Google' : 'GitHub'}`}
          </button>
        ))}
      </div>
      {oauthError ? <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{oauthError}</p> : null}
      <div className="mb-5 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" /><span>or use email</span><span className="h-px flex-1 bg-line" /></div>
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
            className="w-full field rounded-xl px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            {isSignIn ? (
              <button
                type="button"
                onClick={() => setMode('reset')}
                className="text-xs text-accent-ink underline underline-offset-2 hover:text-accent-ink"
              >
                Forgot password?
              </button>
            ) : null}
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              placeholder="At least 8 characters"
              className="w-full field rounded-xl px-3 py-2.5 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint transition-colors hover:text-charcoal-2"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
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
          className="w-full btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
        >
          {pending ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}

