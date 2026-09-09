import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { absoluteDate } from '@/components/ui/TimeAgo'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import { sharedReport } from '@/lib/db/history'
import {
  coverageCaveat,
  coverageTone,
  SCOPE_NOTICE,
  SCORE_EXPLAINER,
  TONE_FILL,
  VERDICT_PRESENTATION,
} from '@/lib/presentation'
import type { Verdict } from '@/lib/scoring/viability'

export const dynamic = 'force-dynamic'

/**
 * A shared report.
 *
 * Private by default is the product's position (§28), so this page exists only
 * because somebody deliberately generated a link. It is deliberately
 * `noindex`: a shared report should be reachable by the person you sent it to,
 * not by a search engine.
 *
 * It shows the headline figures and nothing else — not the evidence, not the
 * per-source detail, and never the identity of whoever ran the search.
 */
export async function generateMetadata({
  params,
}: PageProps<'/r/[token]'>): Promise<import('next').Metadata> {
  const { token } = await params
  const report = await sharedReport(token)

  return {
    title:
      report === undefined
        ? 'Report not found | NameVetta'
        : `${report.name} — ${report.score}/100 | NameVetta`,
    description:
      report === undefined
        ? 'This shared report is no longer available.'
        : `Score ${report.score}/100. Research coverage ${report.coverage}%. ${SCOPE_NOTICE}`,
    // Deliberately never indexed — see the note above.
    robots: { index: false, follow: false },
  }
}

export default async function Page({ params }: PageProps<'/r/[token]'>) {
  const { token } = await params
  const report = await sharedReport(token)

  // A revoked or unknown token is indistinguishable from one that never
  // existed, which is what stops the page confirming which tokens are real.
  if (report === undefined) notFound()

  const verdict = report.verdict as Verdict
  const presentation = VERDICT_PRESENTATION[verdict] ?? VERDICT_PRESENTATION.mixed
  const covTone = coverageTone(report.coverage)

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <section className="card rounded-2xl p-6 sm:p-8">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{report.name}</h1>
          {report.description !== undefined ? (
            <p className="mt-2 text-sm text-charcoal-2">{report.description}</p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              Score
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-5xl font-semibold tabular-nums">
                {report.score}
              </span>
              <span className="text-xl text-faint">/ 100</span>
            </p>
            <div className="mt-3">
              <Badge tone={presentation.tone}>{presentation.label}</Badge>
            </div>
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
              Research coverage
            </p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-5xl font-semibold tabular-nums">
                {report.coverage}
              </span>
              <span className="text-xl text-faint">%</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted-bg">
              <div
                className={`h-full rounded-full ${TONE_FILL[covTone]}`}
                style={{ width: `${report.coverage}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-charcoal-2">{coverageCaveat(report.coverage)}</p>
          </div>
        </div>

        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-faint">
          {SCORE_EXPLAINER}
        </p>
      </section>

      <p className="mt-4 text-sm text-charcoal-2">
        Researched as{' '}
        <strong className="font-medium">
          {CATEGORY_LABELS[report.category as Category] ?? report.category}
        </strong>{' '}
        · {report.scanType === 'deep' ? 'Deep Research' : 'Quick Check'} ·{' '}
        {/*
          A fixed UTC date rather than the runtime's locale. This renders on
          the server, where "the runtime" is a Vercel function in UTC/en-US and
          not the reader — and a shared report is read by several people, who
          should all be looking at the same date.
        */}
        {absoluteDate(report.createdAt)}
      </p>

      <section className="mt-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Check another name</h2>
        <p className="mt-1 text-sm text-charcoal-2">
          Free daily checks. No account needed.
        </p>
        <Link
          href="/"
          className="mt-4 btn-primary rounded-xl px-4 py-2 text-sm"
        >
          Check a name
        </Link>
      </section>

      <p className="mt-6 text-xs text-faint">
        {SCOPE_NOTICE} Scoring version {report.scoringVersion}.
      </p>
    </div>
  )
}
