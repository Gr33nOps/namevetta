import Link from 'next/link'
import { ScoreHeadline } from '@/components/ScoreHeadline'
import { TrademarkAssist } from '@/components/TrademarkAssist'
import { SourceCard } from '@/components/SourceCard'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { CATEGORY_LABELS, type ScanContext } from '@/lib/core/scan'
import { isVerified } from '@/lib/core/types'
import type { ScanSummary } from '@/lib/orchestrator/run'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { GROUP_LABELS, SOURCE_GROUP, type ScoreGroup } from '@/lib/scoring/weights'

/** A completed scan plus the request that produced it. */
export interface ReportData extends ScanSummary {
  context: ScanContext
}

/**
 * The results page (§59).
 *
 * Ordered so the caveats arrive before the reassurance: anything unverified is
 * listed at the top, ahead of the per-source detail, so a user skimming the page
 * cannot miss that part of the research did not complete.
 */
export function Report({ scan }: { scan: ReportData }) {
  const { context, results, viability, coverage } = scan

  const unverified = results.filter((r) => !isVerified(r.status))
  const byGroup = new Map<ScoreGroup, typeof results>()
  for (const r of results) {
    const group = SOURCE_GROUP[r.source]
    const bucket = byGroup.get(group)
    if (bucket === undefined) byGroup.set(group, [r])
    else bucket.push(r)
  }

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-6 py-10">
      <ScoreHeadline
        name={context.name}
        description={context.description}
        viability={viability}
        coverage={coverage}
      />

      <p className="text-sm text-charcoal-2">
        Researched as <strong className="font-medium">{CATEGORY_LABELS[context.category]}</strong>{' '}
        · {context.scanType === 'deep' ? 'Deep Check' : 'Quick Check'}
      </p>

      {unverified.length > 0 ? (
        <section className="rounded-xl border border-unknown/30 bg-unknown-soft p-5">
          <h2 className="font-semibold text-unknown">
            {unverified.length} {unverified.length === 1 ? 'check' : 'checks'} did not complete
          </h2>
          <p className="mt-1 text-sm text-unknown/90">
            These are not evidence that the name is free. Nothing below accounts for them.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {/* Source labels, not group labels: five sources share the "web"
                group, and repeating the group name five times reads like a bug
                rather than telling the user which checks are actually missing. */}
            {unverified.map((r) => (
              <li key={r.source}>
                <Badge tone="unknown">{SOURCE_MANIFEST[r.source].label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TrademarkAssist context={context} />

      <section className="space-y-6">
        <h2 className="font-display text-xl font-semibold">Findings by source</h2>
        {[...byGroup.entries()].map(([group, groupResults]) => (
          <div key={group} className="space-y-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-faint">
              {GROUP_LABELS[group]}
            </h3>
            <div className="grid gap-3">
              {groupResults.map((r) => (
                <SourceCard key={r.source} result={r} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Next steps</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm transition hover:border-accent hover:text-accent"
          >
            Check another name
          </Link>
        </div>
        <p className="mt-4 text-xs text-faint">
          {SCOPE_NOTICE} Scoring version {viability.scoringVersion}. Every figure above is derived
          from the evidence shown — nothing is inferred beyond it.
        </p>
      </section>
    </div>
  )
}
