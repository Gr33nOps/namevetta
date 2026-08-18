import 'server-only'

/**
 * Guest identity.
 *
 * Guests get daily quotas and their own scan history without an account, which
 * means we need a stable per-visitor key. That key must not be, or lead back
 * to, an IP address.
 *
 * Approach: HMAC-SHA256 of the client IP under a server-side salt, truncated.
 * Salted because an unsalted hash of an IPv4 address is trivially reversible —
 * the entire address space is only ~4 billion values, which a laptop can
 * enumerate in minutes. With a secret salt that attack requires the salt.
 *
 * §28 makes privacy a core feature rather than a footnote, and this is the
 * cheapest place to honour it.
 */
import { createHmac } from 'node:crypto'
import { dbEnv } from './client'

/**
 * Extract the client IP from proxy headers.
 *
 * `x-forwarded-for` is a client-controllable header in general, but behind
 * Vercel the leftmost entry is set by the platform. This is used only for
 * quota bucketing, never for authorisation, so a spoofed value costs the
 * spoofer their own quota rather than granting them anything.
 */
export function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    const first = forwarded.split(',')[0]?.trim()
    if (first !== undefined && first !== '') return first
  }
  const real = headers.get('x-real-ip')
  if (real !== null && real.trim() !== '') return real.trim()
  return undefined
}

/** Stable, non-reversible identifier for a guest. */
export function guestHash(ip: string): string {
  return createHmac('sha256', dbEnv().GUEST_HASH_SALT)
    .update(ip)
    .digest('hex')
    .slice(0, 32)
}

export type Subject =
  | { type: 'user'; id: string }
  | { type: 'guest'; id: string }

/**
 * Identify the requester.
 *
 * Returns `undefined` when there is neither a session nor a usable IP — in that
 * case we cannot enforce a quota, and the caller refuses the request rather
 * than granting an unlimited one.
 */
export function identifySubject(
  headers: Headers,
  userId: string | undefined,
): Subject | undefined {
  if (userId !== undefined) return { type: 'user', id: userId }
  const ip = clientIp(headers)
  if (ip === undefined) return undefined
  return { type: 'guest', id: guestHash(ip) }
}
