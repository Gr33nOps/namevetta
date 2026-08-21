import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import type { SourceResult } from '@/lib/core/types'
import { coverageCaveat, SCORE_EXPLAINER, TONE_FILL } from '@/lib/presentation'
import { sourceSubscore, type ViabilityResult } from '@/lib/scoring/viability'
import { GROUP_LABELS } from '@/lib/scoring/weights'
import { SourceLogo } from '@/components/SourceLogo'

/** A subscore reads as "how clear this group is": high is good, like a grade. */
function signalTone(subscore: number): 'ok' | 'warn' | 'danger' {
  if (subscore >= 75) return 'ok'
  if (subscore >= 45) return 'warn'
  return 'danger'
}

/**
 * How the score was worked out.
 *
 * Lifted out of the headline card, where it was the largest block on a report
 * about something else. It answers a second question ("why that number?"),
 * asked after the first one has been answered, so it belongs here and closed.
 *
 * The row layout is the real fix: it used to put the group name on the left and
 * its value card against the right edge of a wide card, with a couple of
 * hundred pixels of nothing between them. Label, bar and value now sit together
 * so the eye can pair them.
 */
export function ScoreBreakdown({
  viability,
  coverage,
  results,
}: {
  viability: ViabilityResult
  coverage: number
  results: readonly SourceResult[]
}) {
  const signals = viability.groups.filter((g) => g.weight > 0).sort((a, b) => b.weight - a.weight)

  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-charcoal-2">{SCORE_EXPLAINER}</p>

      <div className="grid gap-x-8 sm:grid-cols-2">
        {signals.map((g) => {
          const contributors = results
            .filter((r) => g.contributors.includes(r.source))
            .map((r) => ({ result: r, subscore: sourceSubscore(r) }))
            .sort((a, b) => (a.subscore ?? 100) - (b.subscore ?? 100))

          return (
            <details key={g.group} className="border-b border-line py-2 last:border-b-0">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_64px_auto] items-center gap-3 text-[13.5px] marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="text-charcoal-2">
                  {GROUP_LABELS[g.group]}
                  <span className="ml-1.5 text-[12px] text-faint">{Math.round(g.weight)}%</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted-bg">
                  {g.subscore !== null ? (
                    <span
                      className={`block h-full rounded-full ${TONE_FILL[signalTone(g.subscore)]}`}
                      style={{ width: `${g.subscore}%` }}
                    />
                  ) : null}
                </span>
                <span
                  className={`w-[72px] text-right text-[12.5px] tabular-nums ${
                    g.subscore === null ? 'text-faint' : 'text-charcoal-2'
                  }`}
                >
                  {g.subscore === null ? 'Not checked' : g.subscore}
                </span>
              </summary>

              {contributors.length > 0 ? (
                <ul className="mt-2 space-y-1 border-l border-line pl-3">
                  {contributors.map(({ result, subscore }) => (
                    <li
                      key={result.source}
                      className="flex items-baseline justify-between gap-2 text-[12.5px] text-charcoal-2"
                    >
                      <span className="flex items-center gap-2">
                        <SourceLogo label={SOURCE_MANIFEST[result.source].label} size="sm" />
                        {SOURCE_MANIFEST[result.source].label}
                      </span>
                      <span className="tabular-nums text-faint">{subscore ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 pl-3 text-[12.5px] text-faint">
                  No usable result in this group.
                </p>
              )}
            </details>
          )
        })}
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-[13px] text-charcoal-2">
          <span className="font-semibold text-charcoal">Coverage {coverage}%.</span>{' '}
          {coverageCaveat(coverage)}
        </p>
      </div>

      {viability.caps.length > 0 ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">
            Score capped at {viability.score} (it would otherwise be {viability.rawScore})
          </p>
          <ul className="mt-2 space-y-1 text-sm text-danger/90">
            {viability.caps.map((cap) => (
              <li key={cap.reason}>
                {cap.reason}, maximum {cap.maximum}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-danger/80">
            A direct conflict caps the score.
          </p>
        </div>
      ) : null}
    </div>
  )
}
