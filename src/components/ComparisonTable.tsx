import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { Category } from '@/lib/core/scan'
import { CATEGORY_LABELS } from '@/lib/core/scan'
import type { ComparisonResult, RankedCandidate } from '@/lib/compare/rank'
import { coverageTone, SCOPE_NOTICE, VERDICT_PRESENTATION } from '@/lib/presentation'

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const stroke = 6
  const radius = size / 2 - stroke
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold">
        {score}
      </span>
    </div>
  )
}

/** One row of the comparison grid. */
function Row({
  label,
  candidates,
  render,
  muted = false,
}: {
  label: string
  candidates: RankedCandidate[]
  render: (c: RankedCandidate) => React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      role="row"
      className="grid border-b border-line last:border-b-0"
      style={{ gridTemplateColumns: `minmax(140px, 180px) repeat(${candidates.length}, 1fr)` }}
    >
      <div role="rowheader" className={`p-3 text-sm ${muted ? 'text-faint' : 'text-charcoal-2'}`}>
        {label}
      </div>
      {candidates.map((c) => (
        <div role="cell" key={c.name} className="border-l border-line p-3 text-sm">
          {render(c)}
        </div>
      ))}
    </div>
  )
}

export function ComparisonTable({
  result,
  category,
}: {
  result: ComparisonResult
  category: Category
}) {
  const { candidates, winner, winnerReason, coverageWarning, tooCloseToCall } = result
  const groups = candidates[0]?.groups ?? []

  return (
    <div className="space-y-6">
      {/* Winner, or an honest admission that there isn't one. */}
      <section
        className={`rounded-2xl p-6 ${
          tooCloseToCall ? 'border border-line bg-surface' : 'bg-accent text-white'
        }`}
      >
        {tooCloseToCall ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              Too close to call
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
              No clear winner
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-charcoal-2">{winnerReason}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest opacity-70">
                Strongest candidate
              </p>
              <h2 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">{winner}</h2>
              <p className="mt-2 max-w-xl text-sm opacity-90">{winnerReason}</p>
            </div>
            <ScoreRing score={candidates[0]?.score ?? 0} />
          </div>
        )}
      </section>

      {/* The comparison-specific honesty warning. */}
      {coverageWarning !== undefined ? (
        <section className="rounded-xl border border-warn/25 bg-warn-soft p-4">
          <h3 className="text-sm font-semibold text-warn">Uneven research</h3>
          <p className="mt-1 text-sm text-warn/90">{coverageWarning}</p>
        </section>
      ) : null}

      <p className="text-sm text-charcoal-2">For <strong className="font-medium">{CATEGORY_LABELS[category]}</strong></p>

      {/*
        Wide tables must scroll inside their own container, not the page.

        The grid is built from divs rather than a `<table>` because the column
        count is dynamic and drives `gridTemplateColumns` directly. The ARIA
        table roles restore what the markup would otherwise throw away: without
        them a screen reader gets a flat run of cells with no idea which name
        or which metric any number belongs to, on the densest view in the
        product. `tabIndex={0}` is on the scroll container so a keyboard user
        can actually reach the overflow.
      */}
      <section
        tabIndex={0}
        aria-label="Comparison of every candidate, metric by metric"
        className="hidden overflow-x-auto card rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:block"
      >
        <div role="table" className="min-w-[620px]">
          <div
            role="row"
            className="grid border-b border-line bg-muted-bg"
            style={{ gridTemplateColumns: `minmax(140px, 180px) repeat(${candidates.length}, 1fr)` }}
          >
            <div
              role="columnheader"
              className="p-3 font-mono text-[11px] uppercase tracking-widest text-faint"
            >
              Metric
            </div>
            {candidates.map((c) => (
              <div role="columnheader" key={c.name} className="border-l border-line p-3">
                <span className="font-medium">{c.name}</span>
                {c.name === winner ? (
                  <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent-ink">
                    #1
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <Row
            label="Digital Viability"
            candidates={candidates}
            render={(c) => (
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold">{c.score}</span>
                <Badge tone={VERDICT_PRESENTATION[c.verdict].tone} glyph={false}>
                  {VERDICT_PRESENTATION[c.verdict].label}
                </Badge>
              </div>
            )}
          />

          <Row
            label="Research coverage"
            candidates={candidates}
            render={(c) => (
              <div>
                <span className="font-mono">{c.coverage}%</span>
                <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-muted-bg">
                  <div
                    className={
                      coverageTone(c.coverage) === 'danger'
                        ? 'h-full bg-danger'
                        : coverageTone(c.coverage) === 'warn'
                          ? 'h-full bg-warn'
                          : 'h-full bg-line-strong'
                    }
                    style={{ width: `${c.coverage}%` }}
                  />
                </div>
              </div>
            )}
          />

          {groups.map((g) => (
            <Row
              key={g.group}
              label={g.label}
              candidates={candidates}
              muted
              render={(c) => {
                const cell = c.groups.find((x) => x.group === g.group)
                // An en dash, never a zero: a group with no usable answer was
                // not checked, and showing 0 would read as a failure.
                return cell?.subscore === null || cell === undefined ? (
                  <span className="text-faint" title="Not checked">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Not checked</span>
                  </span>
                ) : (
                  <span className="font-mono">{cell.subscore}</span>
                )
              }}
            />
          ))}
        </div>
      </section>
      {/* Per-candidate explanation cards. */}
      <section className="mx-auto grid w-full max-w-lg gap-4 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((c) => (
          <article key={c.name} className="card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">{c.name}</h3>
                <p className="mt-0.5 text-xs text-faint">Rank #{c.rank}</p>
              </div>
              <span className="font-mono text-2xl font-bold">{c.score}</span>
            </div>

            {c.caps.length > 0 ? (
              <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft p-3">
                <p className="text-xs font-semibold text-danger">Score capped</p>
                <ul className="mt-1 space-y-0.5 text-xs text-danger/90">
                  {c.caps.map((cap) => (
                    <li key={cap}>{cap}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {c.strengths.length > 0 ? (
              <div className="mt-3 rounded-xl border border-ok/20 bg-ok-soft p-3">
                <p className="text-xs">
                  <span className="font-semibold text-ok">Stronger on: </span>
                  <span className="text-ok/90">{c.strengths.join(', ')}</span>
                </p>
              </div>
            ) : null}

            {c.weaknesses.length > 0 ? (
              <div className="mt-2 rounded-xl border border-warn/20 bg-warn-soft p-3">
                <p className="text-xs">
                  <span className="font-semibold text-warn">Behind on: </span>
                  <span className="text-warn/90">{c.weaknesses.join(', ')}</span>
                </p>
              </div>
            ) : null}

            {c.caps.length === 0 && c.strengths.length === 0 && c.weaknesses.length === 0 ? (
              <p className="mt-3 text-xs text-faint">
                No notable difference from the others.
              </p>
            ) : null}
            <Link
              href={`/n/${encodeURIComponent(c.name)}?as=${category}`}
              className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-xs font-medium text-charcoal-2 transition-colors hover:border-accent hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Run a fresh Quick Check
            </Link>
          </article>
        ))}
      </section>

      <p className="text-xs text-faint">{SCOPE_NOTICE}</p>
    </div>
  )
}
