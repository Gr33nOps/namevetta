'use client'

import { useFormStatus } from 'react-dom'
import { signOut } from '@/app/auth/actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

/** A visible session exit, kept beside the rest of the account controls. */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Submit />
    </form>
  )
}
