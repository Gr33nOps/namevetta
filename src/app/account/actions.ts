'use server'

import { redirect } from 'next/navigation'
import { currentUser, sessionClient } from '@/lib/db/auth'
import { isDatabaseConfigured, serviceClient } from '@/lib/db/client'

export interface DeleteAccountState {
  error?: string
}

/**
 * Permanently delete the signed-in user's account.
 *
 * Deletes the `auth.users` row through the admin API, which cascades through
 * `profiles` to every table that references it — scans, reports, source
 * results, saved names, share links — per the foreign keys declared in
 * `0001_schema.sql`. There is no separate cleanup step here because the
 * database already guarantees it; a hand-written deletion across a dozen
 * tables would only be a second, less trustworthy copy of that guarantee.
 *
 * Irreversible, and stated as such wherever this is called from.
 *
 * The typed-email confirmation is checked here too, not only in the disabled
 * button on the client. The client check is a UX safety net against a
 * misclick; this is the one that actually matters, since a form can always be
 * submitted directly regardless of what the button's `disabled` state says.
 */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  if (!isDatabaseConfigured()) {
    return { error: 'Accounts are not available in this environment.' }
  }

  const user = await currentUser()
  if (user === undefined) {
    return { error: 'You are not signed in.' }
  }

  const confirmed = formData.get('confirm-email')
  if (
    typeof confirmed !== 'string' ||
    user.email === undefined ||
    confirmed.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return { error: 'Type your account email exactly to confirm.' }
  }

  const { error } = await serviceClient().auth.admin.deleteUser(user.id)
  if (error !== null) {
    return { error: 'Your account could not be deleted. Try again in a moment.' }
  }

  // Clears the local session cookies. The account is already gone at this
  // point, so this is tidy-up rather than a security boundary.
  const supabase = await sessionClient()
  await supabase.auth.signOut()

  redirect('/')
}
