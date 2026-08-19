import type { SourceResult } from '@/lib/core/types'

/**
 * A one-line scan of the whole report before the detail: how many sources
 * landed in each bucket. Placed ahead of the per-source detail so a user
 * skimming the page gets the shape of the result immediately.
 */
export function ResultsSummary({ results }: { results: SourceResult[] }) {
  let clear = 0
  let review = 0
  let conflict = 0
  let unverified = 0

  for (const r of results) {
    if (r.status === 'no_conflict') clear += 1
    else if (r.status === 'similar_found') review += 1
    else if (r.status === 'confirmed_conflict') conflict += 1
    else unverified += 1
  }

  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-charcoal-2">
      <span>
        <span className="font-mono font-semibold text-ok">{clear}</span> clear
      </span>
      {review > 0 ? (
        <span>
          <span className="font-mono font-semibold text-warn">{review}</span> to review
        </span>
      ) : null}
      {conflict > 0 ? (
        <span>
          <span className="font-mono font-semibold text-danger">{conflict}</span> conflict
          {conflict === 1 ? '' : 's'}
        </span>
      ) : null}
      {unverified > 0 ? (
        <span>
          <span className="font-mono font-semibold text-unknown">{unverified}</span> unverified
        </span>
      ) : null}
    </p>
  )
}
