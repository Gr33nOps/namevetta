'use server'

import { revalidatePath } from 'next/cache'
import type { Category } from '@/lib/core/scan'
import { currentUser } from '@/lib/db/auth'
import { saveName, unsaveName } from '@/lib/db/history'

/**
 * Saved names require an account.
 *
 * A guest identity is derived from an IP hash, which changes with the network.
 * Hanging a durable list off something that impermanent would quietly lose
 * people's work, so this is the one feature that genuinely needs signing in.
 */
export async function addSavedName(
  name: string,
  category: Category,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUser()
  if (user === undefined) {
    return { ok: false, error: 'Sign in to save names.' }
  }
  const ok = await saveName(user.id, name, category, note)
  if (ok) revalidatePath('/saved')
  return ok ? { ok } : { ok, error: 'That name could not be saved.' }
}

export async function removeSavedName(id: string): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (user === undefined) return { ok: false }
  const ok = await unsaveName(id)
  if (ok) revalidatePath('/saved')
  return { ok }
}
