'use client'

import { useActionState, useState } from 'react'
import { deleteAccount, type DeleteAccountState } from '@/app/account/actions'

const initial: DeleteAccountState = {}

/**
 * Requires typing the account email before the delete button becomes live.
 *
 * A confirmation dialog is easy to click through without reading; typing the
 * exact email is the same friction GitHub and most serious delete-account
 * flows use, and it is cheap insurance against an irreversible mistake.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [confirmText, setConfirmText] = useState('')
  const [state, action, pending] = useActionState(deleteAccount, initial)
  const confirmed = confirmText.trim().toLowerCase() === email.toLowerCase()

  return (
    <form action={action} className="space-y-3">
      <label htmlFor="confirm-email" className="block text-sm text-charcoal-2">
        Type <span className="font-mono font-medium text-charcoal">{email}</span> to confirm.
      </label>
      <input
        id="confirm-email"
        name="confirm-email"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoComplete="off"
        placeholder={email}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-all placeholder:text-faint focus:border-danger focus:ring-2 focus:ring-danger/20"
      />

      {state.error !== undefined ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!confirmed || pending}
        className="w-full rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Deleting…' : 'Permanently delete my account'}
      </button>
    </form>
  )
}
