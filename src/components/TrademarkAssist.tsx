'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { ScanContext } from '@/lib/core/scan'
import {
  CONCERN_PRESENTATION,
  SCREENING_PRESENTATION,
  TRADEMARK_DISCLAIMER,
} from '@/lib/presentation'
import { trademarkAdvisory } from '@/lib/scoring/viability'
import { buildAssistBrief, TRADEMARK_SCOPE_NOTICE } from '@/lib/trademark/assist'
import {
  emptyScreening,
  JURISDICTION_LABELS,
  rollUpScreening,
  type Jurisdiction,
  type JurisdictionCheck,
  type ScreeningOutcome,
  type TrademarkScreening,
} from '@/lib/trademark/provider'

const OUTCOME_LABELS: Record<ScreeningOutcome, string> = {
  no_obvious_conflict: 'Nothing obvious found',
  possible_conflict: 'Found something concerning',
  unclear: 'Could not tell',
}

/**
 * Trademark Assist.
 *
 * V1 does no automated trademark searching. What it does instead is the part a
 * founder genuinely cannot do unaided: work out which spellings, sounds and
 * classes are worth searching, then walk them through the official free
 * registries one at a time and record what they found.
 *
 * The screening state lives in component state here because V1 has no database
 * yet. Phase 4 persists it to `trademark_screenings`; the shape is already the
 * schema's, so that swap does not change this component.
 *
 * Draws no surface of its own. Its one call site is a fold on the report,
 * which is already a card with padding, and a card inside an identical card
 * is a border that means nothing.
 */
export function TrademarkAssist({ context }: { context: ScanContext }) {
  const brief = useMemo(() => buildAssistBrief(context), [context])
  const [screening, setScreening] = useState<TrademarkScreening>(() => ({
    ...emptyScreening(),
    checks: brief.destinations.map((d) => ({
      jurisdiction: d.jurisdiction,
      status: 'not_started' as const,
    })),
  }))

  const advisory = trademarkAdvisory(screening)
  const screeningPresentation = SCREENING_PRESENTATION[advisory.status]
  const concernPresentation = CONCERN_PRESENTATION[advisory.concern]

  const update = (jurisdiction: Jurisdiction, patch: Partial<JurisdictionCheck>): void => {
    setScreening((prev) => {
      const checks = prev.checks.map((c) =>
        c.jurisdiction === jurisdiction ? { ...c, ...patch } : c,
      )
      return { ...prev, checks, status: rollUpScreening(checks) }
    })
  }

  return (
    <section>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Trademark research</h2>
          <p className="mt-1 max-w-2xl text-sm text-charcoal-2">{TRADEMARK_SCOPE_NOTICE}</p>
        </div>
        <Badge tone={screeningPresentation.tone}>{screeningPresentation.label}</Badge>
      </header>

      <p className="mt-3 rounded-lg bg-muted-bg px-3 py-2 text-sm text-charcoal-2">
        {advisory.summary}
      </p>

      {advisory.status === 'completed' ? (
        <div className="mt-3">
          <Badge tone={concernPresentation.tone}>{concernPresentation.label}</Badge>
          <p className="mt-1.5 text-sm text-charcoal-2">{concernPresentation.detail}</p>
        </div>
      ) : null}

      {/* Steps 1-2 — what to search, collapsed until wanted */}
      <details className="mt-6 group">
        <summary className="cursor-pointer text-sm font-medium text-accent-ink hover:text-accent-ink">
          Search terms ({brief.variants.length} variants,{' '}
          {brief.classes.length} {brief.classes.length === 1 ? 'class' : 'classes'})
        </summary>

        <div className="mt-4">
          <h3 className="text-sm font-semibold">1. Search variants</h3>
          <p className="mt-1 text-sm text-charcoal-2">
            Search close spellings too. Exact spelling alone can miss relevant marks.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {brief.variants.map((v) => (
              <li key={v.value} className="rounded-lg border border-line bg-muted-bg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-sm">{v.value}</code>
                  <span className="text-xs text-faint">{v.kind}</span>
                </div>
                <p className="mt-1 text-xs text-charcoal-2">{v.reason}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">2. Likely classes</h3>
          <p className="mt-1 text-sm text-charcoal-2">
            Trademarks are registered by goods and services. Check these classes before searching.
          </p>
          <ul className="mt-3 space-y-2">
            {brief.classes.map((c) => (
              <li key={c.code} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold">Class {c.code}</span>
                  <span className="text-sm">{c.title}</span>
                </div>
                <p className="mt-1 text-xs text-charcoal-2">{c.rationale}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">
            Search wording: {brief.goodsAndServices.join(' · ')}
          </p>
        </div>
      </details>

      {/* Step 3 — the guided searches, compact by default */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">3. Search registries</h3>
        <div className="mt-3 space-y-2">
          {brief.destinations.map((destination) => {
            const check = screening.checks.find((c) => c.jurisdiction === destination.jurisdiction)
            const status = check?.status ?? 'not_started'

            return (
              <div key={destination.jurisdiction} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-medium">
                    {JURISDICTION_LABELS[destination.jurisdiction]}: {destination.registry}
                  </h4>
                  <div className="flex items-center gap-2">
                    <Badge tone={SCREENING_PRESENTATION[status].tone}>
                      {SCREENING_PRESENTATION[status].label}
                    </Badge>
                    <a
                      href={destination.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={() => update(destination.jurisdiction, { status: 'in_progress' })}
                      className="btn-primary rounded-lg px-3 py-1.5 text-xs"
                    >
                      Search registry ↗
                    </a>
                  </div>
                </div>

                {status !== 'not_started' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-faint">Mark as:</span>
                    {(Object.keys(OUTCOME_LABELS) as ScreeningOutcome[]).map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() =>
                          update(destination.jurisdiction, {
                            status: 'completed',
                            outcome,
                            completedAt: new Date().toISOString(),
                          })
                        }
                        aria-pressed={check?.outcome === outcome}
                        className={`rounded-full border px-2.5 py-1 text-xs transition ${
                          check?.outcome === outcome
                            ? 'border-accent bg-accent-soft font-medium text-accent-ink'
                            : 'border-line text-charcoal-2 hover:border-line-strong'
                        }`}
                      >
                        {OUTCOME_LABELS[outcome]}
                      </button>
                    ))}
                  </div>
                ) : null}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-accent-ink hover:text-accent-ink">
                    Search tips
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-charcoal-2">
                    {destination.instructions.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs font-medium text-charcoal-2">Look for</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-charcoal-2">
                    {destination.whatToLookFor.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs text-faint">
        {TRADEMARK_DISCLAIMER}
      </p>
    </section>
  )
}
