'use client'

import Link from 'next/link'
import { SaveNameButton } from '@/components/SaveNameButton'
import { ScoreBreakdown } from '@/components/ScoreBreakdown'
import { TrademarkAssist } from '@/components/TrademarkAssist'
import { CompactSourceRow, isRetryable, SourceCard } from '@/components/SourceCard'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { CATEGORY_LABELS, type ScanContext } from '@/lib/core/scan'
import {
  DiscoveryMatchSchema,
  PlatformVerdictSchema,
  isVerified,
  type PlatformVerdict,
  type SourceId,
  type SourceResult,
} from '@/lib/core/types'
import { z } from 'zod'
import type { AiSummaryEvent, ScanSummary } from '@/lib/orchestrator/run'
import { deliberatelySkipped, resultPresentation, SCOPE_NOTICE } from '@/lib/presentation'
import { Freshness } from '@/components/ui/TimeAgo'
import { oldest } from '@/lib/relativeTime'
import { SourceLogo } from '@/components/SourceLogo'

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
    <details open={open} className="card overflow-hidden rounded-2xl">
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
      <h2 className="font-display text-[17px] font-semibold tracking-tight text-charcoal">{title}</h2>
      {count === undefined ? null : <span className="text-[12.5px] text-faint">{count}</span>}
    </div>
  )
}

const DiscoveryByPlatformSchema = z.record(z.string(), z.array(DiscoveryMatchSchema))

function manualPlatforms(results: readonly SourceResult[]): PlatformVerdict[] {
  const web = results.find((result) => result.source === 'web')
  const discoverySearched = web !== undefined && isVerified(web.status)
  const parsedDiscovery = DiscoveryByPlatformSchema.safeParse(web?.meta?.['manualDiscovery'])
  const discovery = parsedDiscovery.success ? parsedDiscovery.data : {}
  const platforms: PlatformVerdict[] = []

  for (const result of results.filter((item) => item.status === 'manual_check_recommended')) {
    const parsed = z.array(PlatformVerdictSchema).safeParse(result.meta?.['platforms'])
    const sourcePlatforms: PlatformVerdict[] = parsed.success
      ? parsed.data
      : [
          {
            name: SOURCE_MANIFEST[result.source].label,
            ...(result.evidence.find((item) => item.url !== undefined)?.url === undefined
              ? {}
              : { url: result.evidence.find((item) => item.url !== undefined)?.url }),
            status: 'manual_check_recommended',
            detail: 'Check this name on the platform.',
          },
        ]

    platforms.push(
      ...sourcePlatforms.map((platform) => ({
        ...platform,
        discovery: [...(platform.discovery ?? []), ...(discovery[platform.name] ?? [])].slice(0, 5),
        discoveryChecked: platform.discoveryChecked ?? discoverySearched,
      })),
    )
  }
  return platforms
}

function ManualVerification({
  platforms,
}: {
  platforms: readonly PlatformVerdict[]
}) {
  return (
    <section>
      <SectionHead title="Manual checks" count={platforms.length} />
      <p className="mb-3 text-[14px] leading-relaxed text-charcoal-2">Check these directly.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {platforms.map((platform) => {
          const matches = platform.discovery ?? []
          return (
            <article
              key={platform.name}
              className="inset grid gap-3 rounded-xl px-4 py-3.5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                <h3 className="flex items-center gap-2 font-semibold text-charcoal">
                  <SourceLogo label={platform.name} />
                  {platform.name}
                </h3>
                {platform.name === 'Reddit Community' ? (
                  <p className="mt-1 text-xs leading-relaxed text-faint">
                    Checks the subreddit name, not a Reddit user account.
                  </p>
                ) : null}
                {matches.length > 0 ? (
                  <div className="mt-2 text-xs">
                    <p className="font-medium text-charcoal-2">Public matches · {matches.length}</p>
                    <ul className="mt-1 space-y-1">
                      {matches.map((match) => (
                        <li key={match.url}>
                          <a
                            href={match.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all font-mono text-xs text-accent-ink underline underline-offset-2"
                          >
                            {match.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : platform.discoveryChecked ? (
                  <p className="mt-1 text-xs text-faint">No matching public result surfaced. Check directly.</p>
                ) : null}
                </div>
                {platform.url === undefined ? null : (
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Public matches are clues, not availability checks. They don&rsquo;t affect the score.
      </p>
    </section>
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
  /*
    Two lists, not one.

    "Couldn't be checked" used to hold both a source that timed out and a
    source the product deliberately did not call — Google Play on a SaaS scan,
    where a shared search credit buys 2% of the score. Filing those together
    made a working product look broken and made a real outage look routine.
    Neither list scores and neither counts toward coverage; they read
    differently because they happened differently.
  */
  const skipped = results.filter(deliberatelySkipped)
  const manual = manualPlatforms(results)
  const unverified = results.filter(
    (r) => r.status === 'unable_to_verify' && !deliberatelySkipped(r),
  )
  const cleared = results.filter((r) => r.status === 'no_conflict')
  const retryableUnverified = unverified.filter(isRetryable)
  const oldestChecked = oldest(results.filter((r) => isVerified(r.status)).map((r) => r.checkedAt))
  const query = new URLSearchParams({ as: context.category })
  if (context.scanType === 'deep') query.set('deep', '1')
  if (context.includeSpecialized) query.set('broad', '1')
  const researchHref = `/n/${encodeURIComponent(context.name)}?${query.toString()}`

  const label = (r: SourceResult): string => SOURCE_MANIFEST[r.source].label
  const attention = [
    flagged.length > 0 ? `${flagged.length} ${flagged.length === 1 ? 'match' : 'matches'} to review` : undefined,
    manual.length > 0 ? `${manual.length} manual checks` : undefined,
    unverified.length > 0 ? `${unverified.length} incomplete` : undefined,
  ].filter((item): item is string => item !== undefined)

  /*
    No headline here any more. The score, the verdict and the list of every
    place checked are the panel above this, which is the same object the
    homepage search box turns into. What follows is the part a panel cannot
    hold: the evidence, and the arithmetic behind the number.

    The width and padding come from the caller for the same reason.
  */
  return (
    <div className="mt-4 w-full space-y-4">
      <section className="inset rounded-2xl px-5 py-4">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-charcoal">Next steps</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-charcoal-2">
          {attention.length === 0
            ? 'No conflicts or incomplete checks need attention.'
            : attention.join(' · ')}
        </p>
      </section>
      <p className="px-1 text-[13px] text-faint">
        {CATEGORY_LABELS[context.category]} ·{' '}
        {context.scanType === 'deep' ? 'Deep Research' : 'Quick Check'}
        {' · '}
        <Link
          href={`${researchHref}&pick=1`}
          className="text-accent-ink underline underline-offset-2"
        >
          Change category
        </Link>
        {oldestChecked === undefined ? null : (
          <>
            {' · oldest finding '}
            <Freshness iso={oldestChecked} />
          </>
        )}
      </p>

      {aiSummary?.status === 'ready' ? (
        <section className="card rounded-2xl border-accent-border bg-accent-soft p-5">
          <p className="text-[15px] leading-relaxed text-charcoal">{aiSummary.text}</p>
          <p className="mt-3 text-xs text-faint">
            Based only on findings in this report. Not legal advice.
          </p>
        </section>
      ) : context.scanType === 'deep' && aiSummary === undefined ? (
        <section className="card flex items-center gap-2 rounded-2xl px-5 py-4 text-sm text-charcoal-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent"
          />
          Summarising findings…
        </section>
      ) : null}

      {/* ── 1. what needs a decision ─────────────────────────────────────── */}
      <section id="findings">
        <SectionHead title="Review" count={flagged.length} />
        {flagged.length === 0 ? (
          <p className="card rounded-2xl px-5 py-4 text-[14px] text-charcoal-2">
            No conflicts or close matches found.
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
      {manual.length > 0 ? (
        <ManualVerification platforms={manual} />
      ) : null}

      {unverified.length > 0 ? (
        <section>
          <SectionHead title="Couldn&rsquo;t verify" count={unverified.length} />
          <div className="card rounded-2xl border-unknown/30 bg-unknown-soft p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-[52ch] text-[14px] text-unknown">
                No reliable result. This doesn&rsquo;t mean the name is free.
              </p>
              {onRetrySource !== undefined && retryableUnverified.length > 0 ? (
                <button
                  type="button"
                  onClick={() => retryableUnverified.forEach((r) => onRetrySource(r.source))}
                  disabled={retryableUnverified.every((r) => retryingSources?.has(r.source) ?? false)}
                  className="flex-shrink-0 rounded-full border border-unknown/40 px-3.5 py-1.5 text-sm font-medium text-unknown transition-colors hover:border-charcoal-2 hover:text-charcoal disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
                >
                  Try {retryableUnverified.length === 1 ? 'it' : 'them'} again
                </button>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {unverified.map((r) => (
                <li key={r.source}>
                  <Badge tone={resultPresentation(r).tone}>{label(r)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── 2b. useful elsewhere, but outside this category ───────────────── */}
      {skipped.length > 0 ? (
        <Fold title="Relevant for other uses" meta={`${skipped.length} not run`}>
          <div className="divide-y divide-line">
            {skipped.map((r) => {
              const isGooglePlay = r.source === 'play_store'
              const searchUrl = isGooglePlay
                ? `https://play.google.com/store/search?q=${encodeURIComponent(context.name)}&c=apps`
                : undefined
              return (
                <article
                  key={r.source}
                  className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="flex items-center gap-2 font-semibold text-charcoal">
                        <SourceLogo label={label(r)} />
                        {label(r)}
                      </h3>
                      {isGooglePlay ? (
                        <Badge tone="neutral" glyph={false}>Apps and games</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-[58ch] text-sm leading-relaxed text-charcoal-2">
                      {isGooglePlay
                        ? `Used for mobile apps and games, not this ${CATEGORY_LABELS[context.category]} check.`
                        : `Not used for this ${CATEGORY_LABELS[context.category]} check.`}
                    </p>
                  </div>
                  {searchUrl === undefined ? null : (
                    <a
                      href={searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex w-fit shrink-0 rounded-xl px-3.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Search Google Play ↗
                    </a>
                  )}
                </article>
              )
            })}
          </div>
        </Fold>
      ) : null}

      {/* ── 3. everything that was fine ──────────────────────────────────── */}
      {cleared.length > 0 ? (
        <Fold
          title={`${cleared.length} ${cleared.length === 1 ? 'clear check' : 'clear checks'}`}
          meta="Open the completed checks"
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
        title="How the score works"
        meta={`${viability.groups.filter((g) => g.weight > 0).length} groups, weighted for this category`}
      >
        <ScoreBreakdown viability={viability} coverage={coverage} results={results} />
      </Fold>

      {/* ── 5. a separate job, for later ─────────────────────────────────── */}
      <Fold title="Trademark search" meta="Not included in the score">
        <TrademarkAssist context={context} />
      </Fold>

      {/* ── 6. what next ─────────────────────────────────────────────────── */}
      <section className="card rounded-2xl p-5 print:hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href="/"
            className="btn-primary rounded-xl px-5 py-2.5 text-[14.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Check another name
          </Link>
          <SaveNameButton
            name={context.name}
            category={context.category}
            {...(context.description === undefined ? {} : { note: context.description })}
          />
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
          {SCOPE_NOTICE} Score version {viability.scoringVersion}. See{' '}
          <Link href="/how-it-works" className="text-accent-ink underline underline-offset-2">
            scoring details
          </Link>
          . See something wrong?{' '}
          <a
            href={`${FEEDBACK_URL}?title=${encodeURIComponent(`Report feedback (scoring ${viability.scoringVersion})`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Report it
          </a>
          . Your search details aren&rsquo;t attached.
        </p>
      </section>
    </div>
  )
}
