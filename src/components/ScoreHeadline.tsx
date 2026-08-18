import { Badge } from '@/components/ui/Badge'
import {
  coverageCaveat,
  coverageTone,
  SCORE_EXPLAINER,
  SCORE_NAME_SHORT,
  TONE_FILL,
  VERDICT_PRESENTATION,
} from '@/lib/presentation'
import { verdictFor, type ViabilityResult } from '@/lib/scoring/viability'

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
        <span className="text-[10px] text-faint">/ 100</span>
      </span>
    </div>
  )
}

interface ScoreHeadlineProps {
  name: string
  description: string | undefined
  viability: ViabilityResult
  coverage: number
}

/**
 * The headline block: score, verdict, and — given equal prominence — research
 * coverage.
 *
 * §2 requires these to be separate figures. They sit side by side rather than
 * stacked so neither can be read as a qualifier on the other, and the coverage
 * caveat renders always, not only when coverage is poor.
 */
export function ScoreHeadline({ name, description, viability, coverage }: ScoreHeadlineProps) {
  const verdict = verdictFor(viability.score)
  const presentation = VERDICT_PRESENTATION[verdict]
  const covTone = coverageTone(coverage)

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
            <p className="font-mono text-[10px] uppercase tracking-widest text-faint">
              {SCORE_NAME_SHORT}
            </p>
            <div className="mt-2">
              <Badge tone={presentation.tone}>{presentation.label}</Badge>
            </div>
            <p className="mt-2 text-sm text-charcoal-2">{presentation.detail}</p>
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-faint">
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

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-faint">
        {SCORE_EXPLAINER}
      </p>

      {viability.caps.length > 0 ? (
        <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">
            Score capped at {viability.score} — it would otherwise be {viability.rawScore}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-danger/90">
            {viability.caps.map((cap) => (
              <li key={cap.reason}>
                {cap.reason} — maximum {cap.maximum}
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
