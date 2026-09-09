/**
 * Human-readable relative time, for "as of" freshness labels on a report.
 *
 * An undated finding reads as permanent when it isn't — "no registration
 * found" was true at the moment it was checked, not forever. This is what
 * lets the report say when, not just what.
 */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'unknown time'

  const diffMs = Date.now() - then
  if (diffMs < 0) return 'just now'

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diffMs < minute) return 'just now'
  if (diffMs < hour) {
    const n = Math.round(diffMs / minute)
    return `${n} ${n === 1 ? 'minute' : 'minutes'} ago`
  }
  if (diffMs < day) {
    const n = Math.round(diffMs / hour)
    return `${n} ${n === 1 ? 'hour' : 'hours'} ago`
  }
  if (diffMs < week) {
    const n = Math.round(diffMs / day)
    return `${n} ${n === 1 ? 'day' : 'days'} ago`
  }
  const n = Math.round(diffMs / week)
  if (n < 8) return `${n} ${n === 1 ? 'week' : 'weeks'} ago`
  const months = Math.round(diffMs / (30 * day))
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'} ago`
  const years = Math.round(diffMs / (365 * day))
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

/** The oldest `checkedAt` among a set of ISO timestamps, or undefined if empty. */
export function oldest(timestamps: readonly string[]): string | undefined {
  let min: string | undefined
  let minAt = Number.POSITIVE_INFINITY
  for (const iso of timestamps) {
    const at = Date.parse(iso)
    if (Number.isNaN(at)) continue
    if (at < minAt) {
      minAt = at
      min = iso
    }
  }
  return min
}
