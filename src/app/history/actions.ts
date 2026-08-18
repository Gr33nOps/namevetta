'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { currentUser } from '@/lib/db/auth'
import { createShareLink, deleteScan, revokeShareLink } from '@/lib/db/history'
import { identifySubject, type Subject } from '@/lib/db/identity'

/**
 * History actions.
 *
 * Each one re-derives the subject from the request rather than trusting an id
 * sent by the client. A scan id in a form field is a claim about *what* to act
 * on; it is never a claim about *who* is acting.
 */
async function subjectFromRequest(): Promise<Subject | undefined> {
  const user = await currentUser()
  return identifySubject(await headers(), user?.id)
}

export async function removeScan(scanId: string): Promise<{ ok: boolean; error?: string }> {
  const subject = await subjectFromRequest()
  if (subject === undefined) return { ok: false, error: 'Could not identify you.' }

  const ok = await deleteScan(subject, scanId)
  if (ok) revalidatePath('/history')
  return ok ? { ok } : { ok, error: 'That scan could not be deleted.' }
}

export async function shareScan(
  scanId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const subject = await subjectFromRequest()
  if (subject === undefined) return { ok: false, error: 'Could not identify you.' }

  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const proto = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  const result = await createShareLink(subject, scanId, `${proto}://${host}`)
  if (result === undefined) {
    return { ok: false, error: 'That report could not be shared. It may still be running.' }
  }
  revalidatePath('/history')
  return { ok: true, url: result.url }
}

export async function revokeShare(token: string): Promise<{ ok: boolean }> {
  const subject = await subjectFromRequest()
  if (subject === undefined) return { ok: false }
  const ok = await revokeShareLink(subject, token)
  if (ok) revalidatePath('/history')
  return { ok }
}
