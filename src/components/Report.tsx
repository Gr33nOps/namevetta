import Link from 'next/link'
import { SaveNameButton } from '@/components/SaveNameButton'
import { ScoreBreakdown } from '@/components/ScoreBreakdown'
import { ScoreHeadline } from '@/components/ScoreHeadline'
import { TrademarkAssist } from '@/components/TrademarkAssist'
import { CompactSourceRow, isRetryable, SourceCard } from '@/components/SourceCard'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { CATEGORY_LABELS, type ScanContext } from '@/lib/core/scan'
import { isVerified, type SourceId, type SourceResult } from '@/lib/core/types'
import type { AiSummaryEvent, ScanSummary } from '@/lib/orchestrator/run'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { oldest, relativeTime } from '@/lib/relativeTime'

/**
 * Where a wrong report goes.
 *
 * The issue tracker rather than an address, because `CONTACT_EMAIL` is a
 * server-only value and this renders on the client, and because a public
 * thread is where a scoring complaint is actually useful to the next person.
 *
 * Deliberately carries no searched name, category or description in the
 * prefill. A user clicking this out of curiosity must not land on a public
 * form already filled in with the name they're considering; the report itself
 * is noindex for the same reason. The scoring version is the one thing worth
 * prefilling, and it says nothing about who asked.
 */
const FEEDBACK_URL = 'https://github.com/Gr33nOps/NameVetta/issues/new'

/** A completed scan plus the request that produced it. */
export interface ReportData extends ScanSummary {
  context: ScanContext
}

/** A collapsible block. Shared so every fold on the page behaves identically. */
function Fold({
  title,
  meta,
  open = false,
  children,
}: {
  title: string
  meta?: React.ReactNode
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={open} className="rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 text-[14.5px] font-semibold text-charcoal marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span aria-hidden="true" className="text-[11px] text-faint">
          ▸
        </span>
        {title}
        {meta === undefined ? null : (
          <span className="ml-auto text-[12.5px] font-normal text-faint">{meta}</span>
        )}
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  )
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h2 className="font-display text-[17px] font-bold tracking-tight text-charcoal">{title}</h2>
      {count === undefined ? null : <span className="text-[12.5px] text-faint">{count}</span>}
    </div>
  )
}

/**
 * The results page (§59).
 *
 * Ordered by what a person needs, in the order they need it: the answer, then
 * anything that needs a decision, then anything that could not be established,
 * then everything that was fine, then the arithmetic, then trademark.
 *
 * Nothing here is dropped. The twelve identical "Clear" rows the old layout
 * printed in full, each repeating its confidence and timestamp, are folded into
 * one line that opens; the score breakdown and the trademark workflow are whole
 * and one click away. What changed is that a page about whether a name is taken
 * now leads with the parts that say it might be.
 */
export function Report({
  scan,
  aiSummary,
  onRetrySource,
  retryingSources,
}: {
  scan: ReportData
  /**
   * Undefined means "not applicable or not arrived yet" — Quick Check never
   * requests one, and a Deep Check's explanation streams in a moment after
   * the score.
   */
  aiSummary?: AiSummaryEvent
  onRetrySource?: (source: SourceId) => void
  retryingSources?: ReadonlySet<SourceId>
}) {
  const { context, results, viability, coverage } = scan

  const flagged = results.filter(
    (r) => r.status === 'similar_found' || r.status === 'confirmed_conflict',
  )
  const unverified = results.filter((r) => !isVerified(r.status))
  const cleared = results.filter((r) => r.status === 'no_conflict')
  const retryableUnverified = unverified.filter(isRetryable)
  const oldestChecked = oldest(results.filter((r) => isVerified(r.status)).map((r) => r.checkedAt))

  const label = (r: SourceResult): string => SOURCE_MANIFEST[r.source].label

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4 px-5 py-10">
      <ScoreHeadline
        name={context.name}
        description={context.description}
        viability={viability}
        coverage={coverage}
        results={results}
      />

      <p className="px-1 text-[13px] text-faint">
        Researched as <span className="text-charcoal-2">{CATEGORY_LABELS[context.category]}</span> ·{' '}
        {context.scanType === 'deep' ? 'Deep Research' : 'Quick Check'}
        {oldestChecked === undefined ? null : ` · oldest finding ${relativeTime(oldestChecked)}`}
      </p>

      {aiSummary?.status === 'ready' ? (
        <section className="rounded-2xl border border-accent-border bg-accent-soft p-5">
          <p className="text-[15px] leading-relaxed text-charcoal">{aiSummary.text}</p>
          <p className="mt-3 text-xs text-faint">
            Written by an AI model from the findings on this page only. Not legal advice, and not a
            substitute for reading the evidence yourself.
          </p>
        </section>
      ) : context.scanType === 'deep' && aiSummary === undefined ? (
        <section className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-charcoal-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
          />
          Writing a summary of these findings…
        </section>
      ) : null}

      {/* ── 1. what needs a decision ─────────────────────────────────────── */}
      <section>
        <SectionHead title="Needs your attention" count={flagged.length} />
        {flagged.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-[14px] text-charcoal-2">
            Nothing came back as a conflict or a close match.
          </p>
        ) : (
          <div className="grid gap-3">
            {flagged.map((r) => (
              <SourceCard key={r.source} result={r} />
            ))}
          </div>
        )}
      </section>

      {/* ── 2. what could not be established ─────────────────────────────── */}
      {unverified.length > 0 ? (
        <section>
          <SectionHead title="Couldn't be checked" count={unverified.length} />
          <div className="rounded-2xl border border-unknown/30 bg-unknown-soft p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-[52ch] text-[14px] text-unknown">
                These are not evidence that the name is free. Nothing above accounts for them.
              </p>
              {onRetrySource !== undefined && retryableUnverified.length > 0 ? (
                <button
                  type="button"
                  onClick={() => retryableUnverified.forEach((r) => onRetrySource(r.source))}
                  disabled={retryableUnverified.every((r) => retryingSources?.has(r.source) ?? false)}
                  className="flex-shrink-0 rounded-lg border border-unknown/40 px-3 py-1.5 text-sm font-medium text-unknown transition hover:bg-unknown/10 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
                >
                  Try {retryableUnverified.length === 1 ? 'it' : 'them'} again
                </button>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {unverified.map((r) => (
                <li key={r.source}>
                  <Badge tone="unknown">{label(r)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── 3. everything that was fine ──────────────────────────────────── */}
      {cleared.length > 0 ? (
        <Fold
          title={`${cleared.length} ${cleared.length === 1 ? 'place is' : 'places are'} clear`}
          meta={cleared
            .slice(0, 4)
            .map(label)
            .join(', ')
            .concat(cleared.length > 4 ? ` and ${cleared.length - 4} more` : '')}
        >
          <div className="divide-y divide-line">
            {cleared.map((r) => (
              <CompactSourceRow key={r.source} result={r} />
            ))}
          </div>
        </Fold>
      ) : null}

      {/* ── 4. the arithmetic ────────────────────────────────────────────── */}
      <Fold
        title="How the score was worked out"
        meta={`${viability.groups.filter((g) => g.weight > 0).length} groups, weighted for this category`}
      >
        <ScoreBreakdown viability={viability} coverage={coverage} results={results} />
      </Fold>

      {/* ── 5. a separate job, for later ─────────────────────────────────── */}
      <Fold title="Trademark search" meta="Not included in the score">
        <TrademarkAssist context={context} />
      </Fold>

      {/* ── 6. what next ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-5 print:hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href="/"
            className="rounded-xl bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Check another name
          </Link>
          <SaveNameButton
            name={context.name}
            category={context.category}
            {...(context.description === undefined ? {} : { note: context.description })}
          />
          <Link
            href="/compare"
            className="text-[13.5px] text-charcoal-2 underline decoration-line-strong underline-offset-4 hover:text-charcoal"
          >
            Compare with another name
          </Link>
          <Link
            href="/history"
            className="text-[13.5px] text-charcoal-2 underline decoration-line-strong underline-offset-4 hover:text-charcoal"
          >
            History
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-[13.5px] text-charcoal-2 underline decoration-line-strong underline-offset-4 hover:text-charcoal"
          >
            Print or save as PDF
          </button>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-faint">
          {SCOPE_NOTICE} Scoring version {viability.scoringVersion}. Every figure above is derived
          from the evidence shown. Nothing is inferred beyond it. See the full{' '}
          <Link href="/methodology" className="text-accent underline underline-offset-2">
            methodology
          </Link>
          . Something here look wrong?{' '}
          <a
            href={`${FEEDBACK_URL}?title=${encodeURIComponent(`Report feedback (scoring ${viability.scoringVersion})`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Tell us what it got wrong
          </a>
          . Nothing about your search is attached.
        </p>
      </section>
    </div>
  )
}
