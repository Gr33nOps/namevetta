import { isVerified, type SourceResult } from '@/lib/core/types'
import { coverageTone, TONE_FILL, VERDICT_PRESENTATION, type Tone } from '@/lib/presentation'
import { verdictFor, type ViabilityResult } from '@/lib/scoring/viability'

/**
 * The ring's stroke, by verdict.
 *
 * It used to be the brand accent at every score, so a 94 and a 30 drew the
 * identical purple circle: the largest, most prominent thing on the report
 * carried no information at all. Tone is already computed for the badge sitting
 * next to it; this just stops throwing it away.
 */
const RING_STROKE: Record<Tone, string> = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  unknown: 'var(--color-unknown)',
  neutral: 'var(--color-line-strong)',
}

const VERDICT_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  unknown: 'text-unknown',
  neutral: 'text-charcoal',
}

function ScoreRing({ score, tone, size = 104 }: { score: number; tone: Tone; size?: number }) {
  const stroke = 7
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
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_STROKE[tone]}
          strokeWidth={stroke}
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[30px] font-extrabold leading-none tabular-nums text-charcoal">
          {score}
        </span>
        <span className="mt-1 text-[11px] text-faint">/ 100</span>
      </span>
    </div>
  )
}

/**
 * What the report actually says, in one sentence.
 *
 * The verdict's own `detail` string describes the score and nothing else, so a
 * 94 announced "No significant digital conflicts surfaced" while two sources
 * below it said Review and two more were never checked. That is the headline
 * contradicting its own page.
 *
 * This keeps the verdict word, which is consistent with the rest of the
 * product, and makes the sentence carry the counts that were already on screen
 * further down. Nothing is recomputed; these are the same results the findings
 * list renders.
 */
export function headlineSentence(results: readonly SourceResult[], base: string): string {
  const flagged = results.filter(
    (r) => r.status === 'similar_found' || r.status === 'confirmed_conflict',
  ).length
  const unchecked = results.filter((r) => !isVerified(r.status)).length

  const caveats: string[] = []
  if (flagged > 0) {
    // "to review" rather than "needs a look": the cards below carry a Review
    // badge, and the verdict copy for a near-clear score already says "worth a
    // look", so repeating it read as a stutter.
    caveats.push(`${flagged} ${flagged === 1 ? 'source' : 'sources'} to review`)
  }
  if (unchecked > 0) {
    caveats.push(`${unchecked} couldn't be checked`)
  }

  if (caveats.length === 0) return base
  return `${base} ${caveats.join(', and ')}.`
}

interface ScoreHeadlineProps {
  name: string
  description: string | undefined
  viability: ViabilityResult
  coverage: number
  results: readonly SourceResult[]
}

/**
 * The answer, and only the answer.
 *
 * The score breakdown that used to live here moved to its own collapsed
 * section (`ScoreBreakdown`) below the findings. It explains a number, which is
 * a question people ask second, after "so is it taken or not".
 */
export function ScoreHeadline({
  name,
  description,
  viability,
  coverage,
  results,
}: ScoreHeadlineProps) {
  const verdict = verdictFor(viability.score)

  /**
   * The word above the score, when findings disagree with it.
   *
   * `verdictFor` describes the *score*, and a handful of low-severity near
   * misses barely move it, so a 94 can be labelled "Clear" while two sources
   * below say Review. The score is right and stays untouched; the word is what
   * misleads, because a reader takes it as a verdict on the name.
   *
   * So a top verdict with unresolved findings steps down one, to a label that
   * already exists in the same vocabulary. Nothing new is invented and no
   * number changes.
   */
  const flaggedCount = results.filter(
    (r) => r.status === 'similar_found' || r.status === 'confirmed_conflict',
  ).length
  const shown = verdict === 'strong' && flaggedCount > 0 ? 'promising' : verdict
  const presentation = VERDICT_PRESENTATION[shown]
  const covTone = coverageTone(coverage)
  const hasUncappedConflict =
    viability.caps.length === 0 && results.some((r) => r.status === 'confirmed_conflict')

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h1 className="font-display text-[34px] font-extrabold leading-none tracking-tighter text-charcoal sm:text-[42px]">
        {name}
      </h1>
      {description ? <p className="mt-2 text-sm text-charcoal-2">{description}</p> : null}

      <div className="mt-7 flex flex-wrap items-start gap-6">
        <ScoreRing score={viability.score} tone={presentation.tone} />

        <div className="min-w-[240px] flex-1">
          <h2
            className={`font-display text-2xl font-bold tracking-tight ${VERDICT_TEXT[presentation.tone]}`}
          >
            {presentation.label}
          </h2>
          <p className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-charcoal-2">
            {headlineSentence(results, presentation.detail)}
          </p>

          {/*
            Coverage stays a separate figure (§2) but stops competing with the
            score for the same attention. It was a second 40px numeral beside
            the first, which made the report open with two big numbers and no
            answer.
          */}
          <div className="mt-5 max-w-[300px]">
            <div className="flex items-baseline justify-between text-[12.5px] text-faint">
              <span>Research coverage</span>
              <span className="font-semibold tabular-nums text-charcoal-2">{coverage}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted-bg"
              role="img"
              aria-label={`Research coverage ${coverage} percent`}
            >
              <div
                className={`h-full rounded-full ${TONE_FILL[covTone]}`}
                style={{ width: `${coverage}%` }}
              />
            </div>
          </div>

          {hasUncappedConflict ? (
            <p className="mt-4 max-w-[46ch] text-sm text-warn">
              A source below shows a confirmed conflict. It wasn&rsquo;t weighted heavily enough for
              this category to change the verdict on its own, so read the evidence before deciding.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
