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
        className="btn-secondary rounded-xl border-accent-border bg-accent-soft px-3.5 py-2 text-[13.5px] text-accent-ink"
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
      className="btn-secondary rounded-xl px-3.5 py-2 text-[13.5px]"
    >
      {saved ? 'Saved ✓' : pending ? 'Saving…' : 'Save name'}
    </button>
  )
}
