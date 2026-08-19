import Link from 'next/link'
import { ResultsNav } from '@/components/ResultsNav'
import { ResultsSummary } from '@/components/ResultsSummary'
import { SaveNameButton } from '@/components/SaveNameButton'
import { ScoreHeadline } from '@/components/ScoreHeadline'
import { TrademarkAssist } from '@/components/TrademarkAssist'
import { CompactSourceRow, SourceCard } from '@/components/SourceCard'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { CATEGORY_LABELS, type ScanContext } from '@/lib/core/scan'
import { isVerified } from '@/lib/core/types'
import type { AiSummaryEvent, ScanSummary } from '@/lib/orchestrator/run'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { GROUP_LABELS, SOURCE_GROUP, type ScoreGroup } from '@/lib/scoring/weights'

/** Statuses compact enough to collapse into a single-line row by default. */
const COMPACT_STATUSES = new Set(['no_conflict', 'unable_to_verify'])

function groupId(group: ScoreGroup): string {
  return `group-${group}`
}

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
export function Report({
  scan,
  aiSummary,
}: {
  scan: ReportData
  /**
   * Undefined means "not applicable or not arrived yet" — Quick Check never
   * requests one, and a Deep Check's explanation streams in a moment after
   * the score. Both look identical here: the section simply isn't rendered
   * until there's something to show, never a placeholder or a spinner that
   * could imply the score itself is still pending.
   */
  aiSummary?: AiSummaryEvent
}) {
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
        results={results}
      />

      <div className="space-y-2">
        <p className="text-sm text-charcoal-2">
          Researched as{' '}
          <strong className="font-medium">{CATEGORY_LABELS[context.category]}</strong> ·{' '}
          {context.scanType === 'deep' ? 'Deep Research' : 'Quick Check'}
        </p>
        <ResultsSummary results={results} />
      </div>

      {aiSummary?.status === 'ready' ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            AI summary, generated from the evidence above
          </p>
          <p className="mt-2 text-sm leading-relaxed text-charcoal">{aiSummary.text}</p>
          <p className="mt-3 text-xs text-faint">
            Written by an AI model from the findings in this report only. Not legal advice, and not
            a substitute for reading the evidence yourself.
          </p>
        </section>
      ) : context.scanType === 'deep' && aiSummary === undefined ? (
        // Only a Deep Check ever requests one, so this is the one case where
        // "not here yet" (rather than "never coming") is worth signalling —
        // it usually resolves within a few seconds of the score appearing.
        <section className="flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-charcoal-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
          />
          Writing an AI summary of these findings…
        </section>
      ) : null}

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
        <h2 className="text-xl font-semibold">Findings by source</h2>

        <ResultsNav
          items={[...byGroup.entries()].map(([group, groupResults]) => ({
            id: groupId(group),
            label: GROUP_LABELS[group],
            count: groupResults.length,
          }))}
        />

        {[...byGroup.entries()].map(([group, groupResults]) => {
          const flagged = groupResults.filter((r) => !COMPACT_STATUSES.has(r.status))
          const compact = groupResults.filter((r) => COMPACT_STATUSES.has(r.status))

          return (
            <div key={group} id={groupId(group)} className="scroll-mt-28 space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-faint">
                {GROUP_LABELS[group]}
              </h3>

              {flagged.length > 0 ? (
                <div className="grid gap-3">
                  {flagged.map((r) => (
                    <SourceCard key={r.source} result={r} />
                  ))}
                </div>
              ) : null}

              {compact.length > 0 ? (
                <div className="divide-y divide-line rounded-xl border border-line bg-surface px-4">
                  {compact.map((r) => (
                    <CompactSourceRow key={r.source} result={r} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Next steps</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <SaveNameButton
            name={context.name}
            category={context.category}
            {...(context.description === undefined ? {} : { note: context.description })}
          />
          <Link
            href="/compare"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm transition hover:border-accent hover:text-accent"
          >
            Compare with another name
          </Link>
          <Link
            href="/history"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm transition hover:border-accent hover:text-accent"
          >
            View history
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm transition hover:border-accent hover:text-accent"
          >
            Check another name
          </Link>
        </div>
        <p className="mt-4 text-xs text-faint">
          {SCOPE_NOTICE} Scoring version {viability.scoringVersion}. Every figure above is derived
          from the evidence shown. Nothing is inferred beyond it.
        </p>
      </section>
    </div>
  )
}
