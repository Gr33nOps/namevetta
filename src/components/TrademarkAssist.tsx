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
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Trademark Assist</h2>
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

      {/* Step 1 — what to search */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">
          1. We found {brief.variants.length} variants worth checking
        </h3>
        <p className="mt-1 text-sm text-charcoal-2">
          Registries treat confusingly similar marks as conflicts, so searching only the exact
          spelling misses most of what matters.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {brief.variants.map((v) => (
            <li
              key={v.value}
              className="rounded-lg border border-line bg-muted-bg px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm">{v.value}</code>
                <span className="text-xs text-faint">{v.kind}</span>
              </div>
              <p className="mt-1 text-xs text-charcoal-2">{v.reason}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Step 2 — where to look */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">2. Likely classes and wording</h3>
        <p className="mt-1 text-sm text-charcoal-2">
          Trademarks are registered per class of goods and services. Filtering to these cuts out
          unrelated industries — but confirm them, since classification is a judgement call.
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
          Useful search wording: {brief.goodsAndServices.join(' · ')}
        </p>
      </div>

      {/* Step 3 — the guided searches */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">3. Search the official registries</h3>
        <div className="mt-3 space-y-3">
          {brief.destinations.map((destination) => {
            const check = screening.checks.find((c) => c.jurisdiction === destination.jurisdiction)
            const status = check?.status ?? 'not_started'

            return (
              <div
                key={destination.jurisdiction}
                className="rounded-lg border border-line p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium">
                      {JURISDICTION_LABELS[destination.jurisdiction]} — {destination.registry}
                    </h4>
                    <p className="mt-0.5 text-xs text-faint">Free official search</p>
                  </div>
                  <Badge tone={SCREENING_PRESENTATION[status].tone}>
                    {SCREENING_PRESENTATION[status].label}
                  </Badge>
                </div>

                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-charcoal-2">
                  {destination.instructions.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-accent hover:text-accent">
                    What to look for
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal-2">
                    {destination.whatToLookFor.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    href={destination.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => update(destination.jurisdiction, { status: 'in_progress' })}
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
                  >
                    Search {destination.registry} ↗
                  </a>

                  {status !== 'not_started' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-faint">Mark result:</span>
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
                              ? 'border-accent bg-accent-soft font-medium text-accent'
                              : 'border-line text-charcoal-2 hover:border-line-strong'
                          }`}
                        >
                          {OUTCOME_LABELS[outcome]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
