'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { removeScan, shareScan } from '@/app/history/actions'
import { Badge } from '@/components/ui/Badge'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import type { HistoryEntry } from '@/lib/db/history'
import { VERDICT_PRESENTATION } from '@/lib/presentation'
import type { Verdict } from '@/lib/scoring/viability'

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function Row({ entry }: { entry: HistoryEntry }) {
  const [pending, startTransition] = useTransition()
  const [shareUrl, setShareUrl] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [removed, setRemoved] = useState(false)

  if (removed) return null

  const verdict = entry.verdict as Verdict | undefined
  const presentation = verdict !== undefined ? VERDICT_PRESENTATION[verdict] : undefined

  const rerunHref = `/scan?name=${encodeURIComponent(entry.name)}&category=${entry.category}&type=${entry.scanType}`

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{entry.name}</h3>
          <p className="mt-0.5 text-xs text-faint">
            {CATEGORY_LABELS[entry.category as Category] ?? entry.category} ·{' '}
            {entry.scanType === 'deep' ? 'Deep Research' : 'Quick Check'} ·{' '}
            {timeAgo(entry.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {entry.score !== undefined ? (
            <div className="text-right">
              <span className="font-mono text-xl font-bold">{entry.score}</span>
              <span className="ml-1 text-xs text-faint">/ 100</span>
              {entry.coverage !== undefined ? (
                <p className="text-[10px] text-faint">{entry.coverage}% coverage</p>
              ) : null}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={rerunHref}
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
        >
          Research again
        </Link>

        {entry.score !== undefined ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await shareScan(entry.id)
                if (result.ok && result.url !== undefined) {
                  setShareUrl(result.url)
                  setError(undefined)
                } else {
                  setError(result.error ?? 'Could not create a link.')
                }
              })
            }
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Share privately
          </button>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await removeScan(entry.id)
              if (result.ok) setRemoved(true)
              else setError(result.error ?? 'Could not delete.')
            })
          }
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-charcoal-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {shareUrl !== undefined ? (
        <div className="mt-3 rounded-lg border border-accent-border bg-accent-soft p-3">
          <p className="text-xs font-medium text-accent">Anyone with this link can view the report</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-surface px-2 py-1 font-mono text-[11px]">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
              className="rounded border border-accent-border px-2 py-1 text-[11px] text-accent"
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

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
        <h2 className="font-display text-lg font-semibold">No research yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-2">
          Every name you research appears here, with its evidence, so you can come back to it.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Research a name
        </Link>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
    </ul>
  )
}
