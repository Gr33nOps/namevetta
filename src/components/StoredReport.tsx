import Link from 'next/link'
import { Report, type ReportData } from '@/components/Report'
import { VettaPanel } from '@/components/VettaPanel'
import type { ScanContext } from '@/lib/core/scan'
import { SourceResultSchema, type SourceResult } from '@/lib/core/types'
import type { StoredScan } from '@/lib/db/history'
import { conflictBanner, headlineSentence, TONE_TEXT, VERDICT_PRESENTATION } from '@/lib/presentation'
import { computeCoverage } from '@/lib/scoring/confidence'
import { dominantVerdict, computeViability } from '@/lib/scoring/viability'
import { weightsFor } from '@/lib/scoring/weights'
import { CATEGORY_LABELS, type Category } from '@/lib/core/scan'
import { isActiveSource, sourcesFor } from '@/lib/core/adapter'

/**
 * A finished scan, reopened rather than re-run.
 *
 * The same report the live scan renders, from rows that were written the first
 * time. Nothing here calls `/api/scan`, so reopening costs no allowance and
 * adds no history entry — which is the whole point: the list used to link
 * every row at a URL that started a fresh check, so looking at your own
 * research spent more of it.
 *
 * Every stored row is put back through `SourceResultSchema` before it is
 * rendered. The database has its own copies of the honesty invariants, but a
 * row written by an older version of this code has to clear today's bar too,
 * and a row that cannot is dropped rather than displayed.
 */
export function StoredReport({ scan }: { scan: StoredScan }) {
  const category = scan.category as Category

  const results: SourceResult[] = []
  for (const raw of scan.results) {
    const parsed = SourceResultSchema.safeParse(raw)
    if (parsed.success && isActiveSource(parsed.data.source)) results.push(parsed.data)
  }

  const context: ScanContext = {
    name: scan.name,
    category,
    scanType: scan.scanType,
    ...(scan.includeSpecialized ? { includeSpecialized: true } : {}),
    ...(scan.description === undefined ? {} : { description: scan.description }),
  }

  /*
    Recomputed, not read back.

    `reports.digital_score` is what the rules said on the day. Recomputing from
    the evidence is the figure today's rules produce, and it is the only one
    that can be shown beside today's findings without the two disagreeing — a
    report recorded before an exact conflict ceilinged the score would
    otherwise print 100 above a confirmed collision. Where the two differ, the
    note below says so rather than quietly replacing history.
  */
  const viability = computeViability({ category, results })
  const intended = sourcesFor(scan.scanType).map((source) => source.id)
  const coverage = computeCoverage({
    intended,
    results: new Map(results.map((r) => [r.source, r])),
    weights: weightsFor(category),
  })

  const presentation = VERDICT_PRESENTATION[dominantVerdict(viability.score, results)]
  const banner = conflictBanner(viability.conflicts)

  const rescored =
    scan.recorded !== undefined &&
    (scan.recorded.scoringVersion !== viability.scoringVersion ||
      scan.recorded.score !== viability.score)

  return (
    <div className="page-shell">
      <header className="mb-6">
        <h1 className="page-title break-words">
          {scan.name}
        </h1>
        <p className="mt-2.5 text-sm text-charcoal-2">
          {CATEGORY_LABELS[category]} · saved report
        </p>
      </header>

      {banner === '' ? null : (
        <p
          role="status"
          className="mb-4 rounded-2xl border border-danger/35 bg-danger-soft px-4 py-3 text-[14.5px] leading-relaxed text-danger"
        >
          <span aria-hidden="true" className="mr-1.5 font-semibold">
            ✕
          </span>
          {banner}
        </p>
      )}

      <VettaPanel
        initialName={scan.name}
        results={results}
        score={viability.score}
        scoreTone={presentation.tone}
        total={intended.length}
        note={
          <>
            <span className={`font-semibold ${TONE_TEXT[presentation.tone]}`}>
              {presentation.label}.
            </span>
            <span>
              {headlineSentence(results, presentation.detail)} Research coverage {coverage}%.
            </span>
          </>
        }
      />

      {rescored && scan.recorded !== undefined ? (
        <p className="mt-4 text-[13px] leading-relaxed text-faint">
          Re-scored from the same evidence using version {viability.scoringVersion}. The original
          score was {scan.recorded.score} under version {scan.recorded.scoringVersion}. No new
          research was run.
        </p>
      ) : null}

      <Report scan={{ context, results, viability, coverage } satisfies ReportData} />

      <p className="mt-6 text-center text-[13px] text-faint">
        Saved findings.{' '}
        <Link
          href={`/n/${encodeURIComponent(scan.name)}?as=${category}${scan.scanType === 'deep' ? '&deep=1' : ''}${scan.includeSpecialized ? '&broad=1' : ''}`}
          className="text-accent-ink underline underline-offset-2"
        >
          Research it again
        </Link>{' '}
        for fresh results.
      </p>
    </div>
  )
}
