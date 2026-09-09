import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/LegalPage'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { SourceLogo } from '@/components/SourceLogo'
import {
  isCategoryDependent,
  sourceCounts,
  activeSources,
  type SourceManifestEntry,
  type TosPosture,
} from '@/lib/core/adapter'
import { CATEGORY_LABELS } from '@/lib/core/scan'
import { SCOPE_NOTICE } from '@/lib/presentation'
import { SITE_URL } from '@/lib/site'
import { CATEGORY_WEIGHTS, GROUP_LABELS, SCORE_GROUPS, SOURCE_GROUP } from '@/lib/scoring/weights'

export const metadata = {
  title: 'How it works | NameVetta',
  description: 'How NameVetta scores a name and which sources it uses.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How it works | NameVetta',
    description: 'How NameVetta scores a name and which sources it uses.',
    url: '/how-it-works',
  },
}

/**
 * Structured data.
 *
 * `TechArticle`, not `FAQPage`. The sections below are headings, not
 * questions, and Google's guidelines require FAQ markup to describe content
 * the page actually shows in question-and-answer form. Claiming otherwise for
 * a richer search result would be exactly the kind of unearned certainty this
 * page exists to argue against.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'How NameVetta scores a name',
  description: 'How NameVetta scores a name and which sources it uses.',
  url: `${SITE_URL}/how-it-works`,
  publisher: { '@type': 'Organization', name: 'NameVetta', url: SITE_URL },
}

const TOS_LABEL: Record<TosPosture, string> = {
  official_api: 'Official API',
  open_protocol: 'Open protocol',
  search_index: 'Search index',
  manual_only: 'Manual only',
  scrape: 'Scraping (never used)',
}

const COUNTS = sourceCounts()

/**
 * When a source runs, in one phrase.
 *
 * The same four answers the status page gives, because a reader comparing the
 * two pages should not have to work out whether they mean the same thing.
 */
function whenItRuns(source: SourceManifestEntry): string {
  if (source.tosPosture === 'manual_only') return 'Never automatic'
  if (isCategoryDependent(source.id)) return 'Some categories'
  if (!source.runsOn.includes('quick')) return 'Deep Research'
  return 'Every search'
}

function costLabel(manifest: SourceManifestEntry): string {
  return manifest.metered ? 'Free, metered' : 'Free'
}

function rateLimitLabel(manifest: SourceManifestEntry): string {
  if (manifest.rateLimit === undefined) return 'No self-imposed limit'
  const { requestsPerMinute, documented } = manifest.rateLimit
  return `${requestsPerMinute}/min, ${documented ? 'documented by the provider' : 'a courtesy ceiling we set ourselves'}`
}

/**
 * How the scoring works, in the same shape as the other standing pages.
 *
 * The one table that made this page heavy was every source and its ceiling,
 * sixty rows deep. It is folded now, the way the source status table is: the
 * reader who wants to audit one source can open it, and everyone else gets
 * the six paragraphs that actually answer the question.
 *
 * Every figure is generated from the constants the scoring engine runs on, so
 * this page cannot describe a ceiling, a weight or a status the product does
 * not actually enforce.
 */
export default function Page() {
  const sources = activeSources().sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  /*
    Four examples on a laptop, two on a phone.

    The table is illustrative — it exists to show that the weights differ by
    category, not to be read across all twelve. Five columns at 375px ran past
    the edge of its own scroll box with nothing on screen saying so, and the
    two that survive make the point on their own.
  */
  const exampleCategories = ['saas', 'restaurant', 'developer_tool', 'creator_brand'] as const
  const narrowCategories = ['saas', 'restaurant'] as const

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <LegalPage
        title="How it works"
        updated="2026-08-18"
        lead="How scores, sources, and incomplete checks are handled."
      >
        <LegalSection title="What results mean">
          <p>
            We show exact matches, close matches, manual links, and incomplete checks separately.
          </p>
          <p>
            Incomplete checks never count as clean. They lower coverage instead. There are{' '}
            {COUNTS.catalog} research sources in NameVetta. A Quick Check asks{' '}
            {COUNTS.quick} of them; Deep Research asks all {COUNTS.deep}, including the{' '}
            {COUNTS.deepOnly} that only earn their cost on a deeper look. Of the catalog,{' '}
            {COUNTS.categoryDependent}{' '}
            {COUNTS.categoryDependent === 1 ? 'runs' : 'run'} only for relevant categories. {COUNTS.discovery}{' '}
            {COUNTS.discovery === 1 ? 'source surfaces' : 'sources surface'} public matches without
            judging availability, and {COUNTS.manual} {COUNTS.manual === 1 ? 'is' : 'are'} never
            automatic at all. A source that did not run is reported as not run.
          </p>
        </LegalSection>

        <LegalSection title="How the score works">
          <p>
            The score combines domains, code namespaces, app stores, social handles, and web
            results. It does not cover trademarks.
          </p>
          <p>
            A direct, same-industry exact match can cap the score. A clean-looking average never
            overrides evidence that strong.
          </p>
          <details className="inset overflow-hidden rounded-xl">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[14px] font-semibold text-charcoal marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span aria-hidden="true" className="text-[11px] text-faint">▸</span>
              See weights and scoring details
            </summary>
            <div className="space-y-3 border-t border-line px-4 py-4">
              <p>
                Sources are grouped, each group gets a weight, and the weight depends on what
                you&rsquo;re naming. A crowded npm namespace matters more for a developer tool than
                for a restaurant.
              </p>
              <ScrollArea label="Category weight examples" className="border-y border-line">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-faint uppercase">
                  <th className="px-3 py-2 font-medium">Group</th>
                  {exampleCategories.map((cat) => (
                    <th
                      key={cat}
                      className={`px-3 py-2 font-medium ${
                        (narrowCategories as readonly string[]).includes(cat) ? '' : 'hidden sm:table-cell'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SCORE_GROUPS.map((group) => (
                  <tr key={group}>
                    <td className="px-3 py-2 text-charcoal-2">{GROUP_LABELS[group]}</td>
                    {exampleCategories.map((cat) => (
                      <td
                        key={cat}
                        className={`px-3 py-2 tabular-nums text-charcoal-2 ${
                          (narrowCategories as readonly string[]).includes(cat)
                            ? ''
                            : 'hidden sm:table-cell'
                        }`}
                      >
                        {CATEGORY_WEIGHTS[cat][group] === 0 ? '–' : CATEGORY_WEIGHTS[cat][group]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
              </ScrollArea>
              <p className="text-xs text-faint sm:hidden">
            Two of the twelve categories shown. The rest, and the other{' '}
            {exampleCategories.length - narrowCategories.length} examples, are on a wider screen.
              </p>
              <p>
            A group&rsquo;s subscore only counts once at least one of its sources produced a usable
            answer, and weights renormalize across the groups that did. A Quick Check isn&rsquo;t
            punished for running fewer sources than a Deep Check; the gap is reported through
            coverage instead.
              </p>
            </div>
          </details>
        </LegalSection>

        <LegalSection title="Coverage and source reliability" collapsible>
          <p>
            Coverage is how much of the intended research actually completed, weighted the same way
            the score is. It sits beside the score, always, never inside it. A high score with 40%
            coverage means &ldquo;looks fine, but we only checked part of it,&rdquo; and the report
            says exactly that.
          </p>
          <p>
            Confidence on a single source is <code className="font-mono text-[13px]">ceiling</code>{' '}
            × <code className="font-mono text-[13px]">health</code> ×{' '}
            <code className="font-mono text-[13px]">freshness</code>. The ceiling is the most a
            source can ever report and is set per source; health tracks recent reliability, so one
            that keeps getting rate-limited loses confidence automatically rather than staying
            trusted until somebody notices; freshness discounts a cached answer against a fresh one.
          </p>

          <details className="inset overflow-hidden rounded-xl">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[14px] font-semibold text-charcoal marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span aria-hidden="true" className="text-[11px] text-faint">
                ▸
              </span>
              Every source and its ceiling
              <span className="ml-auto text-[12.5px] font-normal text-faint">
                {sources.length} sources
              </span>
            </summary>

            {/*
              Two layouts, not one.

              A six-column table at 412px wide overflowed its own container by
              nearly sixty pixels, and the page hid the overflow — so a phone
              silently lost the ceiling and the rate limit, which are the two
              columns the fold exists to show. Below `md` each source is a card
              instead; nothing is dropped, it is only stacked.
            */}
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {sources.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 text-[14px] font-medium text-charcoal">
                      <SourceLogo label={s.label} />
                      {s.label}
                    </p>
                    <span className="shrink-0 tabular-nums text-[13px] text-charcoal-2">
                      {s.baseConfidenceCeiling}
                      <span className="ml-1 text-xs text-faint">ceiling</span>
                    </span>
                  </div>
                  <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-charcoal-2">
                    <div className="flex gap-1.5">
                      <dt className="text-faint">Group</dt>
                      <dd>{GROUP_LABELS[SOURCE_GROUP[s.id]]}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-faint">Basis</dt>
                      <dd>{TOS_LABEL[s.tosPosture]}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-faint">Runs</dt>
                      <dd>{whenItRuns(s)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-faint">Cost</dt>
                      <dd>{costLabel(s)}</dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-xs text-faint">{rateLimitLabel(s)}</p>
                </li>
              ))}
            </ul>

            <ScrollArea
              label="Every source, its basis and its confidence ceiling"
              hint={false}
              className="hidden border-t border-line md:block"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-faint uppercase">
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Basis</th>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Ceiling</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Rate limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-charcoal">
                        <span className="inline-flex items-center gap-2">
                          <SourceLogo label={s.label} size="sm" />
                          {s.label}
                        </span>
                        <span className="ml-1.5 text-xs text-faint">
                          {GROUP_LABELS[SOURCE_GROUP[s.id]]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-charcoal-2">{TOS_LABEL[s.tosPosture]}</td>
                      <td className="px-3 py-2 text-charcoal-2">{whenItRuns(s)}</td>
                      <td className="px-3 py-2 tabular-nums text-charcoal-2">
                        {s.baseConfidenceCeiling}
                      </td>
                      <td className="px-3 py-2 text-charcoal-2">{costLabel(s)}</td>
                      <td className="px-3 py-2 text-charcoal-2">{rateLimitLabel(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </details>

          <p>
            The handful of social platforms still checked by hand carry the lowest ceiling on that
            list on purpose. An unauthenticated profile fetch can return a login wall or a soft 404
            that reads as &ldquo;handle is free&rdquo; when it means nothing of the kind, and that
            false green check is the exact failure this product exists to avoid. Nothing here
            scrapes: a source declaring that posture fails a test before it can ship.
          </p>
        </LegalSection>

        <LegalSection title="What we left out, and why" collapsible>
          <p>
            <strong className="font-medium text-charcoal">F-Droid&rsquo;s index.</strong> Its only
            structured endpoint is the full repository index, about 56 MB, three times larger than
            the Homebrew index we already judged too big to fetch per scan. There is no lighter
            search API, so it stays out rather than being forced in.
          </p>
          <p>
            <strong className="font-medium text-charcoal">A US company register.</strong> SEC EDGAR
            covers SEC registrants only, not US companies generally, and no free general-purpose US
            register exists the way Companies House does for the UK. This is a real gap, not a
            hidden one. It is why a US business name leans more heavily on domain and web evidence
            than a UK one does.
          </p>
        </LegalSection>

        <LegalSection title="Trademarks are a separate job" collapsible>
          <p className="rounded-xl border border-accent-border bg-accent-soft px-3.5 py-2.5 text-accent-ink">
            {SCOPE_NOTICE}
          </p>
          <p>
            No automated trademark research runs today. Trademark Assist generates spelling,
            confusable and phonetic variants, suggests likely Nice classes with reasoning, and links
            to the official free registries (USPTO, TMview, WIPO) with per-registry instructions.
            You search, and you record what you found.
          </p>
          <p>
            Screening status is tracked separately from the score and is never worded to sound like
            clearance, even when every jurisdiction comes back clean. Automated search is a real
            possibility later, behind an extension point that exists today so it can be added
            without restructuring anything, but it needs real approvals first.
          </p>
          <p className="border-t border-line pt-4 text-[13px] text-faint">
            See any{' '}
            <Link href="/" className="text-accent-ink underline underline-offset-2">
              name check
            </Link>{' '}
            for the full report format, or{' '}
            <Link href="/status" className="text-accent-ink underline underline-offset-2">
              source status
            </Link>{' '}
            for how each source has actually been behaving.
          </p>
        </LegalSection>
      </LegalPage>
    </>
  )
}
