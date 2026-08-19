'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { removeSavedName } from '@/app/saved/actions'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import type { SavedName } from '@/lib/db/history'

export function SavedList({ names }: { names: SavedName[] }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  const visible = names.filter((n) => !removed.has(n.id))

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold">Nothing saved yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-2">
          Save a name from any report to keep it here while you decide.
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
      {visible.map((n) => (
        <li
          key={n.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <div className="min-w-0">
            <h3 className="font-medium">{n.name}</h3>
            <p className="mt-0.5 text-xs text-faint">
              {CATEGORY_LABELS[n.category as Category] ?? n.category}
            </p>
            {n.note !== undefined ? (
              <p className="mt-1 text-sm text-charcoal-2">{n.note}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/scan?name=${encodeURIComponent(n.name)}&category=${n.category}&type=quick`}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
            >
              Research again
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeSavedName(n.id)
                  if (result.ok) setRemoved((prev) => new Set(prev).add(n.id))
                })
              }
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-charcoal-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
