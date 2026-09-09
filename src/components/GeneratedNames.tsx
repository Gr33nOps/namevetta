'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SaveNameButton } from '@/components/SaveNameButton'
import { Badge } from '@/components/ui/Badge'
import type { ComparisonResult } from '@/lib/compare/rank'
import type { Category } from '@/lib/core/scan'
import { VERDICT_PRESENTATION } from '@/lib/presentation'

export function GeneratedNames({ result, category }: { result: ComparisonResult; category: Category }) {
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState(false)

  return (
    <div className="space-y-5">
      {result.coverageWarning ? <p className="rounded-xl border border-warn/25 bg-warn-soft p-4 text-sm text-warn">{result.coverageWarning}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {result.candidates.map((candidate, index) => {
          const verdict = VERDICT_PRESENTATION[candidate.verdict]
          return (
            <article key={candidate.name} style={{ animationDelay: `${Math.min(index, 8) * 90}ms` }} className="card result-card flex min-w-0 flex-col rounded-panel p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium tracking-widest text-faint">{String(index + 1).padStart(2, '0')}</span>
                <Badge tone={verdict.tone} glyph={false}>{candidate.coverage < 50 ? 'Limited checks' : verdict.label}</Badge>
              </div>
              <h3 className="font-display mt-4 break-words text-2xl font-semibold tracking-tight text-charcoal">{candidate.name}</h3>
              {candidate.domain ? <p className="mt-2 break-all text-xs text-charcoal-2"><span className="font-mono">{candidate.domain.name}</span> · No registration found</p> : null}
              <p className="mt-2 text-sm leading-relaxed text-charcoal-2">{candidate.coverage < 50 ? 'Several sources could not be checked. Review this name before choosing it.' : verdict.detail}</p>
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-charcoal-2">Name check score</span>
                  <span className="font-semibold tabular-nums">{candidate.score}<span className="text-xs font-normal text-faint"> / 100</span></span>
                </div>
                <meter min={0} max={100} value={candidate.score} aria-label={`${candidate.name} name check score`} className="score-meter mt-2 h-2 w-full" />
                <p className="mt-2 text-xs text-faint">{candidate.coverage}% of research completed</p>
              </div>
              <details className="mt-4 text-sm">
                <summary className="min-h-11 cursor-pointer py-3 font-medium text-charcoal-2">Check details</summary>
                <dl className="space-y-2 border-t border-line py-3">
                  {candidate.groups.map((group) => <div key={group.group} className="flex justify-between gap-4 text-xs"><dt className="text-charcoal-2">{group.label}</dt><dd className="text-right tabular-nums">{group.subscore === null ? 'Not checked' : `${group.subscore}/100`}</dd></div>)}
                </dl>
                {candidate.caps.length > 0 ? <p className="mb-3 text-xs text-warn">{candidate.caps.join(' ')}</p> : null}
                <Link href={`/n/${encodeURIComponent(candidate.name)}?as=${category}`} className="inline-flex min-h-11 items-center text-xs font-medium text-accent-ink underline underline-offset-4">Run a fresh check →</Link>
              </details>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <SaveNameButton name={candidate.name} category={category} />
                <button type="button" className="btn-secondary rounded-xl px-3.5 py-2 text-sm" aria-label={`Copy ${candidate.name}`} onClick={async () => {
                  try { await navigator.clipboard.writeText(candidate.name); setCopied(candidate.name); setCopyError(false) }
                  catch { setCopyError(true) }
                }}>{copied === candidate.name ? 'Copied ✓' : 'Copy name'}</button>
              </div>
            </article>
          )
        })}
      </div>
      <p role="status" className="sr-only">{copied ? `${copied} copied` : ''}</p>
      {copyError ? <p role="alert" className="text-sm text-danger">Couldn&rsquo;t copy. Select the name to copy it manually.</p> : null}
      <p className="text-xs leading-relaxed text-faint">These are starting points, not a guarantee of availability. Check the domains and handles you need before committing. Trademark clearance is separate.</p>
    </div>
  )
}
