'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { removeScan, shareScan } from '@/app/history/actions'
import { Badge } from '@/components/ui/Badge'
import { TimeAgo } from '@/components/ui/TimeAgo'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import type { HistoryEntry } from '@/lib/db/history'
import { VERDICT_PRESENTATION } from '@/lib/presentation'
import type { Verdict } from '@/lib/scoring/viability'

/** Buckets an entry by its verdict tone, so filtering reuses the same colour
 * language as the badge the user already sees on every row. */
type FilterBucket = 'all' | 'ok' | 'warn' | 'danger' | 'none'

const FILTER_LABELS: Record<Exclude<FilterBucket, 'all'>, string> = {
  ok: 'Clear',
  warn: 'Review',
  danger: 'Conflict',
  none: 'Incomplete',
}

function bucketFor(entry: HistoryEntry): FilterBucket {
  const verdict = entry.verdict as Verdict | undefined
  const tone = verdict === undefined ? undefined : VERDICT_PRESENTATION[verdict].tone
  return tone === 'ok' || tone === 'warn' || tone === 'danger' ? tone : 'none'
}

type SortKey = 'newest' | 'oldest' | 'score-desc' | 'score-asc' | 'name'

function sortEntries(entries: HistoryEntry[], sort: SortKey): HistoryEntry[] {
  const sorted = [...entries]
  switch (sort) {
    case 'oldest':
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case 'score-desc':
      return sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    case 'score-asc':
      return sorted.sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    default:
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}

/**
 * Where a history row goes, and where it deliberately does not.
 *
 * The name opens the report that was recorded. "Research again" is the only
 * thing that starts a new check, and it says so — every row used to link
 * straight at a fresh scan, so opening your own history spent an allowance
 * unit per click and wrote a duplicate entry while doing it.
 */
function hrefsFor(entry: HistoryEntry): { viewHref: string; rerunHref: string } {
  const deep = entry.scanType === 'deep' ? '&deep=1' : ''
  const name = encodeURIComponent(entry.name)
  return {
    viewHref: `/n/${name}?as=${entry.category}${deep}&scan=${encodeURIComponent(entry.id)}`,
    rerunHref: `/n/${name}?as=${entry.category}${deep}`,
  }
}

/** Share/delete state and mutations, shared by both the card and table row. */
function useRowActions(entry: HistoryEntry) {
  const [pending, startTransition] = useTransition()
  const [shareUrl, setShareUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [removed, setRemoved] = useState(false)

  const onShare = (): void => {
    startTransition(async () => {
      const result = await shareScan(entry.id)
      if (result.ok && result.url !== undefined) {
        setShareUrl(result.url)
        setError(undefined)
      } else {
        setError(result.error ?? 'Couldn\'t create a link.')
      }
    })
  }

  const onDelete = (): void => {
    startTransition(async () => {
      const result = await removeScan(entry.id)
      if (result.ok) setRemoved(true)
      else setError(result.error ?? 'Couldn\'t delete it.')
    })
  }

  return { pending, shareUrl, error, removed, onShare, onDelete }
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-xl border px-3 py-1 text-xs transition ${
        active
          ? 'border-accent bg-accent-soft font-medium text-accent-ink'
          : 'border-line text-charcoal-2 hover:border-line-strong'
      }`}
    >
      {label}
    </button>
  )
}

function Row({ entry }: { entry: HistoryEntry }) {
  const { pending, shareUrl, error, removed, onShare, onDelete } = useRowActions(entry)
  if (removed) return null

  const verdict = entry.verdict as Verdict | undefined
  const presentation = verdict !== undefined ? VERDICT_PRESENTATION[verdict] : undefined
  const { viewHref, rerunHref } = hrefsFor(entry)

  return (
    <li className="card rounded-xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">
            <Link href={viewHref} className="inline-flex min-h-7 items-center break-words [overflow-wrap:anywhere] hover:text-accent-ink">
              {entry.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-faint">
            {CATEGORY_LABELS[entry.category as Category] ?? entry.category} ·{' '}
            {entry.scanType === 'deep' ? 'Deep Research' : 'Quick Check'} ·{' '}
            <TimeAgo iso={entry.createdAt} />
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {entry.score !== undefined ? (
            <div className="text-right">
              <span className="font-mono text-lg font-bold">{entry.score}</span>
              <span className="ml-1 text-xs text-faint">/ 100</span>
            </div>
          ) : (
            <Badge tone="unknown">{entry.status === 'running' ? 'Incomplete' : 'No report'}</Badge>
          )}
          {presentation !== undefined ? (
            <Badge tone={presentation.tone} glyph={false}>
              {presentation.label}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={viewHref}
          className="btn-primary min-h-11 justify-center rounded-xl px-2 py-2 text-center text-xs"
        >
          Open report <span aria-hidden="true">→</span>
        </Link>
        <Link href={rerunHref} className="btn-secondary min-h-11 justify-center rounded-xl px-2 py-2 text-center text-xs">
          Research again
        </Link>
        <details className="group col-span-2">
          <summary className="min-h-11 cursor-pointer list-none rounded-lg border border-line px-3 py-3 text-xs text-charcoal-2 marker:content-none transition-colors hover:border-line-strong hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Actions <span aria-hidden="true" className="ml-1 text-faint group-open:hidden">+</span><span aria-hidden="true" className="ml-1 text-faint hidden group-open:inline">−</span>
          </summary>
          <div className="mt-2 flex flex-col gap-1 rounded-xl border border-line-strong bg-surface p-1.5">
            {entry.score !== undefined ? (
              <button
                type="button"
                disabled={pending}
                onClick={onShare}
                className="rounded-lg px-2.5 py-2 text-left text-xs text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal disabled:opacity-50"
              >
                Share privately
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded-lg px-2.5 py-2 text-left text-xs text-charcoal-2 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </details>
      </div>

      {shareUrl !== undefined ? (
        <div className="mt-3 rounded-lg border border-accent-border bg-accent-soft p-3">
          <p className="text-xs font-medium text-accent-ink">Anyone with this link can view this report</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-surface px-2 py-1 font-mono text-[11px]">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
              className="rounded border border-accent-border px-2 py-1 text-[11px] text-accent-ink"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      {error !== undefined ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  )
}

function TableRow({ entry }: { entry: HistoryEntry }) {
  const { pending, shareUrl, error, removed, onShare, onDelete } = useRowActions(entry)
  if (removed) return null

  const verdict = entry.verdict as Verdict | undefined
  const presentation = verdict !== undefined ? VERDICT_PRESENTATION[verdict] : undefined
  const { viewHref, rerunHref } = hrefsFor(entry)

  return (
    <>
      <tr className="border-b border-line last:border-b-0 hover:bg-muted-bg/50">
        <td className="p-3">
          <Link href={viewHref} className="font-medium hover:text-accent-ink">
            {entry.name}
          </Link>
          <p className="text-xs text-faint">
            {CATEGORY_LABELS[entry.category as Category] ?? entry.category}
          </p>
        </td>
        <td className="p-3">
          {entry.score !== undefined ? (
            <span className="font-mono text-sm font-semibold">{entry.score}</span>
          ) : (
            <span className="text-xs text-faint">–</span>
          )}
        </td>
        <td className="p-3">
          {presentation !== undefined ? (
            <Badge tone={presentation.tone} glyph={false}>
              {presentation.label}
            </Badge>
          ) : (
            <Badge tone="unknown" glyph={false}>
              {entry.status === 'running' ? 'Incomplete' : 'No report'}
            </Badge>
          )}
        </td>
        <td className="p-3 text-sm text-charcoal-2"><TimeAgo iso={entry.createdAt} /></td>
        <td className="p-3 text-sm text-charcoal-2">
          {entry.scanType === 'deep' ? 'Deep' : 'Quick'}
        </td>
        <td className="p-3 text-right">
          <details className="group relative inline-block text-left">
            <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1.5 text-xs text-charcoal-2 marker:content-none transition-colors hover:border-line-strong hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Actions <span aria-hidden="true" className="ml-1 text-faint group-open:hidden">+</span><span aria-hidden="true" className="ml-1 hidden text-faint group-open:inline">−</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex min-w-40 flex-col gap-1 rounded-xl border border-line-strong bg-surface p-1.5 shadow-card">
              <Link href={rerunHref} className="rounded-lg px-2.5 py-2 text-xs text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal">
                Research again
              </Link>
              {entry.score !== undefined ? (
                <button type="button" disabled={pending} onClick={onShare} className="rounded-lg px-2.5 py-2 text-left text-xs text-charcoal-2 transition-colors hover:bg-muted-bg hover:text-charcoal disabled:opacity-50">
                  Share privately
                </button>
              ) : null}
              <button type="button" disabled={pending} onClick={onDelete} className="rounded-lg px-2.5 py-2 text-left text-xs text-charcoal-2 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50">
                Delete
              </button>
            </div>
          </details>
        </td>
      </tr>

      {shareUrl !== undefined || error !== undefined ? (
        <tr className="border-b border-line bg-muted-bg/40 last:border-b-0">
          <td colSpan={6} className="px-3 pb-3 pt-2">
            {shareUrl !== undefined ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-surface px-2 py-1 font-mono text-[11px]">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(shareUrl)}
                  className="rounded border border-accent-border px-2 py-1 text-[11px] text-accent-ink"
                >
                  Copy
                </button>
              </div>
            ) : null}
            {error !== undefined ? <p className="text-xs text-danger">{error}</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  )
}

const PAGE_SIZES = [25, 50] as const

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [filter, setFilter] = useState<FilterBucket>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const byBucket = filter === 'all' ? entries : entries.filter((e) => bucketFor(e) === filter)
    const q = query.trim().toLowerCase()
    return q === '' ? byBucket : byBucket.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, filter, query])
  const sorted = useMemo(() => sortEntries(filtered, sort), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageItems = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sorted, currentPage, pageSize],
  )

  // A stale page number after narrowing the results would otherwise show a
  // blank or wrong page, so every control that changes what's shown resets
  // back to page 1 rather than relying on the clamp above to look right.
  const onFilterChange = (next: FilterBucket): void => {
    setFilter(next)
    setPage(1)
  }
  const onSortChange = (next: SortKey): void => {
    setSort(next)
    setPage(1)
  }
  const onQueryChange = (next: string): void => {
    setQuery(next)
    setPage(1)
  }
  const onPageSizeChange = (next: number): void => {
    setPageSize(next)
    setPage(1)
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold">No checks yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-2">
          Your saved reports will appear here.
        </p>
        <Link
          href="/"
          className="mt-5 btn-primary rounded-xl px-4 py-2 text-sm"
        >
          Check a name
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch">
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Find a name"
        aria-label="Search history by name"
        className="w-full max-w-md field rounded-xl px-3 py-2 text-sm text-charcoal"
      />

      <div className="mt-4 flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={filter === 'all'} onClick={() => onFilterChange('all')} />
          {(Object.keys(FILTER_LABELS) as Exclude<FilterBucket, 'all'>[]).map((bucket) => (
            <FilterChip
              key={bucket}
              label={FILTER_LABELS[bucket]}
              active={filter === bucket}
              onClick={() => onFilterChange(bucket)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-faint">
            Sort
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortKey)}
              className="field rounded-xl px-2 py-1.5 text-sm text-charcoal"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="score-desc">Highest score</option>
              <option value="score-asc">Lowest score</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-faint">
            Show
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="field rounded-xl px-2 py-1.5 text-sm text-charcoal"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 text-sm text-faint">No reports match this filter.</p>
      ) : (
        <>
          <div className="mt-4 hidden w-full overflow-x-auto card rounded-2xl md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-muted-bg text-xs uppercase tracking-wide text-faint">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Score</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Checked</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((entry) => (
                  <TableRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 w-full space-y-3 md:hidden">
            {pageItems.map((entry) => (
              <Row key={entry.id} entry={entry} />
            ))}
          </ul>

          {pageCount > 1 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-faint">
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-charcoal-2"
                >
                  Previous
                </button>
                <span className="text-xs text-faint">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-charcoal-2"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
