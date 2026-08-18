'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { addSavedName } from '@/app/saved/actions'
import type { Category } from '@/lib/core/scan'

/**
 * Saves a name from a report.
 *
 * Saving never consumes daily allowance (§31) — only fresh research does.
 */
export function SaveNameButton({
  name,
  category,
  note,
}: {
  name: string
  category: Category
  note?: string
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [needsAccount, setNeedsAccount] = useState(false)

  if (needsAccount) {
    return (
      <Link
        href="/auth"
        className="rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/10"
      >
        Sign in to save
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={pending || saved}
      onClick={() =>
        startTransition(async () => {
          const result = await addSavedName(name, category, note)
          if (result.ok) setSaved(true)
          else setNeedsAccount(true)
        })
      }
      className="rounded-lg border border-line-strong px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {saved ? 'Saved ✓' : pending ? 'Saving…' : 'Save this name'}
    </button>
  )
}
