import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import type { SourceResult } from '@/lib/core/types'
import {
  coverageCaveat,
  coverageTone,
  SCORE_EXPLAINER,
  SCORE_NAME_SHORT,
  TONE_FILL,
  VERDICT_PRESENTATION,
} from '@/lib/presentation'
import { sourceSubscore, verdictFor, type ViabilityResult } from '@/lib/scoring/viability'
import { GROUP_LABELS } from '@/lib/scoring/weights'

/** A subscore reads as "how clear this group is", so the tone thresholds run
 * the same direction as a grade: high is good. */
function signalTone(subscore: number): 'ok' | 'warn' | 'danger' {
  if (subscore >= 75) return 'ok'
  if (subscore >= 45) return 'warn'
  return 'danger'
}

/** The same three words used everywhere else, so a signal row never
 * introduces a fourth vocabulary for "how clear is this". */
const SIGNAL_WORD: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'Clear',
  warn: 'Review',
  danger: 'Conflict',
}

/** Circular gauge for the headline score. */
function ScoreRing({ score, size = 104 }: { score: number; size?: number }) {
  const stroke = 7
  const radius = size / 2 - stroke
  const circumference = 2 * Math.PI * radius
  const dash = (score / 100) * circumference

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold tabular-nums text-charcoal">
          {score}
        </span>
        <span className="text-[11px] text-faint">/ 100</span>
      </span>
    </div>
  )
}

interface ScoreHeadlineProps {
  name: string
  description: string | undefined
  viability: ViabilityResult
  coverage: number
  results: readonly SourceResult[]
}

/**
 * The headline block: score, verdict, and — given equal prominence — research
 * coverage.
 *
 * §2 requires these to be separate figures. They sit side by side rather than
 * stacked so neither can be read as a qualifier on the other, and the coverage
 * caveat renders always, not only when coverage is poor.
 */
export function ScoreHeadline({
  name,
  description,
  viability,
  coverage,
  results,
}: ScoreHeadlineProps) {
  const verdict = verdictFor(viability.score)
  const presentation = VERDICT_PRESENTATION[verdict]
  const covTone = coverageTone(coverage)
  const signals = viability.groups.filter((g) => g.weight > 0).sort((a, b) => b.weight - a.weight)
  const hasUncappedConflict =
    viability.caps.length === 0 && results.some((r) => r.status === 'confirmed_conflict')

  return (
    <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
          {name}
        </h1>
        {description ? <p className="mt-1 text-sm text-charcoal-2">{description}</p> : null}
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex items-start gap-5">
          <ScoreRing score={viability.score} />
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              {SCORE_NAME_SHORT}
            </p>
            <div className="mt-2">
              <Badge tone={presentation.tone}>{presentation.label}</Badge>
            </div>
            <p className="mt-2 text-sm text-charcoal-2">{presentation.detail}</p>
            {hasUncappedConflict ? (
              <p className="mt-2 text-sm text-warn">
                A source below shows a confirmed conflict. It wasn&rsquo;t weighted heavily enough
                for this category to change the verdict on its own — read the evidence before
                deciding.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Research coverage
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-4xl font-semibold tabular-nums text-charcoal">
              {coverage}
            </span>
            <span className="text-lg text-faint">%</span>
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted-bg"
            role="img"
            aria-label={`Research coverage ${coverage} percent`}
          >
            <div
              className={`h-full rounded-full ${TONE_FILL[covTone]}`}
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-charcoal-2">{coverageCaveat(coverage)}</p>
        </div>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
          Signal breakdown
        </p>
        <p className="mt-1 text-xs text-faint">
          {signals.length} {signals.length === 1 ? 'group' : 'groups'} weighted for this category.
          Open one to see exactly which sources set its number.
        </p>
        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {signals.map((g) => {
            const contributors = results
              .filter((r) => g.contributors.includes(r.source))
              .map((r) => ({ result: r, subscore: sourceSubscore(r) }))
              .sort((a, b) => (a.subscore ?? 100) - (b.subscore ?? 100))

            return (
              <details key={g.group} className="group/signal py-1.5">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 text-sm marker:content-none">
                  <span className="text-charcoal-2">
                    {GROUP_LABELS[g.group]}
                    <span className="ml-1 text-faint">({Math.round(g.weight)}%)</span>
                  </span>
                  <span className="font-mono text-xs text-faint">
                    {g.subscore === null
                      ? 'Not checked'
                      : `${SIGNAL_WORD[signalTone(g.subscore)]} · ${g.subscore}`}
                  </span>
                </summary>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted-bg">
                  {g.subscore !== null ? (
                    <div
                      className={`h-full rounded-full ${TONE_FILL[signalTone(g.subscore)]}`}
                      style={{ width: `${g.subscore}%` }}
                    />
                  ) : null}
                </div>
                {contributors.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-l border-line pl-3">
                    {contributors.map(({ result, subscore }) => (
                      <li
                        key={result.source}
                        className="flex items-baseline justify-between gap-2 text-xs text-charcoal-2"
                      >
                        <span>{SOURCE_MANIFEST[result.source].label}</span>
                        <span className="font-mono tabular-nums text-faint">
                          {subscore === null ? '—' : subscore}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 pl-3 text-xs text-faint">
                    No source in this group produced a usable answer.
                  </p>
                )}
              </details>
            )
          })}
        </div>
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-faint">
        {SCORE_EXPLAINER}
      </p>

      {viability.caps.length > 0 ? (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-4">
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
            A conflict this direct outweighs everything else, so the score is capped rather than
            averaged.
          </p>
        </div>
      ) : null}
    </section>
  )
}
