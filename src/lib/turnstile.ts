import 'server-only'

/**
 * Cloudflare Turnstile verification (§14, "Turnstile on suspicious traffic").
 *
 * Scoped to account creation only, not every request — signup is the one flow
 * where a bot has something to gain (burning through the guest-quota-evading
 * incentive of an account, or automated account farming). Free, no card.
 *
 * Optional by the same rule as every other credential in this product: with
 * no `TURNSTILE_SECRET_KEY` configured, verification always succeeds and
 * signup behaves exactly as it did before this existed.
 */
import { env } from '@/lib/env'

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface SiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
}

/**
 * Verify a Turnstile response token.
 *
 * Fails open toward "not configured", not toward "trust anything" — an empty
 * or missing token is only accepted when there is no secret to check it
 * against in the first place.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY
  if (secret === undefined) return true

  if (token === undefined || token.trim() === '') return false

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp !== undefined) body.set('remoteip', remoteIp)

    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) return false

    const data = (await response.json()) as SiteverifyResponse
    return data.success === true
  } catch {
    // Once a deployment explicitly enables Turnstile, an indeterminate
    // verification must not become a successful signup. The user can retry;
    // accepting it would turn a provider/network failure into a bot bypass.
    return false
  }
}
