'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { browserClient } from '@/lib/db/browserClient'

/**
 * Sets a new password from a recovery link.
 *
 * Runs entirely client-side against the browser Supabase client rather than
 * a server action: the recovery session Supabase creates from the emailed
 * link lives in the URL fragment, which the server never sees.
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [recovery, setRecovery] = useState<'checking' | 'ready' | 'invalid'>('checking')

  useEffect(() => {
    let active = true
    void browserClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return
        setRecovery(sessionError === null && data.session !== null ? 'ready' : 'invalid')
      })
      .catch(() => {
        if (active) setRecovery('invalid')
      })
    return () => {
      active = false
    }
  }, [])

  if (recovery === 'checking') {
    return (
      <div aria-live="polite" aria-busy="true" className="rounded-xl border border-line bg-surface p-6 text-sm text-charcoal-2">
        Checking reset link…
      </div>
    )
  }

  if (recovery === 'invalid') {
    return (
      <div className="rounded-xl border border-danger/25 bg-danger-soft p-6">
        <p className="text-sm text-danger">That reset link is invalid or has expired.</p>
        <Link href="/auth" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-danger/35 px-3 text-sm font-medium text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Request another reset link
        </Link>
      </div>
    )
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Passwords must be at least 8 characters')
      return
    }
    setPending(true)
    setError(undefined)

    const { error: updateError } = await browserClient().auth.updateUser({ password })

    setPending(false)
    if (updateError !== null) {
      setError('Could not update your password. The link may have expired. Request a new one.')
      return
    }
    router.push('/history')
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-line bg-surface p-6">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full field rounded-xl px-3 py-2.5 pr-14 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-faint transition-colors hover:text-charcoal-2"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {error !== undefined ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
