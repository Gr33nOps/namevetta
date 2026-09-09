'use client'

import { useSyncExternalStore } from 'react'
import { relativeTime } from '@/lib/relativeTime'

/**
 * A timestamp that reads "3 days ago" without breaking hydration.
 *
 * The Pixel 7 pass of a production audit caught React error #418 on
 * `/history` — a server/client text mismatch — and the cause was a relative
 * timestamp computed inline during render. Two things make that unfixable
 * in place:
 *
 *  1. `Date.now()` moves. The server renders "59m ago" and the browser, a
 *     second later, renders "1h ago". Every boundary crossing is a mismatch,
 *     and there is one on every scale.
 *  2. `toLocaleDateString()` reads the *runtime's* locale and timezone.
 *     Vercel's Node is UTC/en-US; a phone is neither. Older entries mismatched
 *     every single time, deterministically, which is why the phone reproduced
 *     it and the desktop did not.
 *
 * The fix is not to suppress the warning — the warning is correct, and
 * suppressing it would leave the client rendering one thing and the server
 * another. It is to render something *stable* on the server and during
 * hydration, then upgrade after mount, when the browser's own clock and locale
 * are legitimately available.
 *
 * The stable form is a fixed ISO-derived date in UTC: identical on both sides
 * by construction, readable, and correct with JavaScript disabled. The
 * `<time dateTime>` element carries the machine-readable value throughout, so
 * assistive technology and copy-paste get the real timestamp either way.
 */

/** Deterministic on any runtime: no locale, no timezone, no clock. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function absoluteDate(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'unknown date'
  const month = MONTHS[at.getUTCMonth()] ?? '?'
  return `${at.getUTCDate()} ${month} ${at.getUTCFullYear()}`
}

/**
 * "just now" / "12m ago" / "3d ago", and a date once that stops being useful.
 *
 * Only ever called in an effect, so `Date.now()` here is the browser's clock
 * and nothing is comparing it against the server's.
 */
export function relativeShort(iso: string, now: number): string {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return 'unknown date'

  const seconds = Math.floor((now - at) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return absoluteDate(iso)
}

/* -------------------------------------------------------------------------- */
/* The clock, as an external store                                            */
/* -------------------------------------------------------------------------- */

/**
 * One interval for every timestamp on the page, not one per row.
 *
 * A history page renders fifty of these. Fifty intervals to move fifty labels
 * from "59m ago" to "1h ago" is fifty timers doing the same arithmetic; one
 * shared tick with a set of listeners is the same behaviour for one timer.
 */
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

/** Half a minute: fine enough that "just now" stops being wrong quickly. */
const TICK_MS = 30_000

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  timer ??= setInterval(() => {
    for (const listener of listeners) listener()
  }, TICK_MS)

  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/**
 * The clock is genuinely external — it moves without React's involvement — so
 * it is read the way this codebase reads the theme: through
 * `useSyncExternalStore`, whose `getServerSnapshot` is exactly the "stable
 * value for the server and for hydration" hook this needs.
 *
 * `getSnapshot` may return a freshly built string on every call: React
 * compares snapshots with `Object.is`, and two equal strings are the same
 * value, so nothing re-renders until the wording actually changes.
 */
function useTimestamp(iso: string, render: (iso: string) => string): string {
  return useSyncExternalStore(
    subscribe,
    () => render(iso),
    () => absoluteDate(iso),
  )
}

export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const text = useTimestamp(iso, (value) => relativeShort(value, Date.now()))

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  )
}

/**
 * The long form: "3 days ago", for a finding's freshness line.
 *
 * Same contract as `TimeAgo` and for the same reason. `Report` and
 * `SourceCard` are client components (they are pulled in by `ScanRunner`) and
 * they *also* render on the server for a shared report at `/r/[token]`, so
 * both of them were computing a relative time across the hydration boundary.
 */
export function Freshness({ iso, className }: { iso: string; className?: string }) {
  const text = useTimestamp(iso, relativeTime)

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  )
}
