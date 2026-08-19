import Link from 'next/link'
import { LegalToc } from '@/components/LegalToc'
import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST, type SourceManifestEntry, type TosPosture } from '@/lib/core/adapter'
import { CATEGORY_LABELS } from '@/lib/core/scan'
import { SOURCE_IDS } from '@/lib/core/types'
import { SCOPE_NOTICE, STATUS_PRESENTATION } from '@/lib/presentation'
import { SITE_URL } from '@/lib/site'
import { CATEGORY_WEIGHTS, GROUP_LABELS, SCORE_GROUPS, SOURCE_GROUP } from '@/lib/scoring/weights'

export const metadata = {
  title: 'Methodology | NameVetta',
  description: 'What each status means, how the score is weighted, and every source behind it.',
  alternates: { canonical: '/methodology' },
  openGraph: {
    title: 'Methodology | NameVetta',
    description: 'What each status means, how the score is weighted, and every source behind it.',
    url: '/methodology',
  },
}

/**
 * Structured data.
 *
 * `TechArticle`, not `FAQPage`. The sections below are numbered headings, not
 * questions, and Google's guidelines require FAQ markup to describe content
 * the page actually shows in question-and-answer form. Claiming otherwise for
 * a richer search result would be exactly the kind of unearned certainty this
 * page exists to argue against.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'How NameVetta scores a name',
  description:
    'What each status means, how the score is weighted, and every source behind it.',
  url: `${SITE_URL}/methodology`,
  publisher: { '@type': 'Organization', name: 'NameVetta', url: SITE_URL },
}

const SECTIONS = [
  { id: 'statuses', title: '1. The five statuses' },
  { id: 'score', title: '2. The Digital Viability Score' },
  { id: 'coverage', title: '3. Research Coverage' },
  { id: 'sources', title: '4. Every source, and its ceiling' },
  { id: 'left-out', title: '5. What we left out, and why' },
  { id: 'trademark', title: '6. Trademark Assist' },
] as const

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-semibold text-charcoal">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-[1.75] text-charcoal-2">{children}</div>
    </section>
  )
}

const TOS_LABEL: Record<TosPosture, string> = {
  official_api: 'Official API',
  open_protocol: 'Open protocol',
  search_index: 'Search index',
  manual_only: 'Manual only',
  scrape: 'Scraping (never used)',
}

function costLabel(manifest: SourceManifestEntry): string {
  if (!manifest.metered) return 'Free'
  return 'Free, metered'
}

function rateLimitLabel(manifest: SourceManifestEntry): string {
  if (manifest.rateLimit === undefined) return 'No self-imposed limit'
  const { requestsPerMinute, documented } = manifest.rateLimit
  return `${requestsPerMinute}/min, ${documented ? 'documented by the provider' : 'a courtesy ceiling we set ourselves'}`
}

export default function Page() {
  // Generated straight from the source of truth used at runtime, so this page
  // cannot describe a ceiling, a weight or a status that the product doesn't
  // actually enforce.
  const sources = SOURCE_IDS.map((id) => SOURCE_MANIFEST[id]).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  const exampleCategories = ['saas', 'restaurant', 'developer_tool', 'creator_brand'] as const

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
          Methodology
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-sm leading-[1.75] text-charcoal-2">
          Every number on a report comes from a rule stated here. No source gets extra credit for
          being one we like, and nothing is rounded up to look more reassuring than the evidence
          supports.
        </p>
        <p className="mx-auto mt-4 max-w-[640px] rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm text-accent">
          {SCOPE_NOTICE}
        </p>
      </div>

      <div className="mt-10 lg:flex lg:items-start lg:gap-12">
        <LegalToc items={SECTIONS} />
        <div className="max-w-[640px] space-y-8">
          <Section id="statuses" title="1. The five statuses">
            <p>
              There is no &ldquo;available.&rdquo; Availability is a claim we are rarely entitled
              to make, so every check resolves to one of five states instead:
            </p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-line">
                  {(Object.keys(STATUS_PRESENTATION) as (keyof typeof STATUS_PRESENTATION)[]).map(
                    (status) => (
                      <tr key={status}>
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <Badge tone={STATUS_PRESENTATION[status].tone}>
                            {STATUS_PRESENTATION[status].label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-charcoal-2">
                          {STATUS_PRESENTATION[status].detail}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p>
              A source that could not be checked is excluded from the score, not counted as clean.
              The gap shows up as lower Research Coverage instead, which is never folded into the
              score.
            </p>
          </Section>

          <Section id="score" title="2. The Digital Viability Score">
            <p>
              The score measures how usable a name is across domains, code namespaces, app
              stores, social handles and the open web. It does not cover trademarks, and it
              never absorbs a trademark finding, however the screening comes out.
            </p>
            <p>
              Sources are grouped, each group gets a weight, and the weight depends on what
              you&rsquo;re naming: a crowded npm namespace matters a great deal for a developer
              tool and almost nothing for a restaurant. Every category&rsquo;s weight table sums
              to exactly 100, checked by an automated test on every change. Four examples:
            </p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">Group</th>
                    {exampleCategories.map((cat) => (
                      <th key={cat} className="px-3 py-2 font-medium">
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
                        <td key={cat} className="px-3 py-2 tabular-nums text-charcoal-2">
                          {CATEGORY_WEIGHTS[cat][group] === 0 ? '–' : CATEGORY_WEIGHTS[cat][group]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              A group&rsquo;s subscore only counts once at least one of its sources produced a
              usable answer, and weights renormalize across the groups that did — so a Quick
              Check isn&rsquo;t punished for running fewer sources than a Deep Check; the gap is
              reported through coverage instead.
            </p>
            <p>
              One thing overrides the average outright: an exact, major, same-industry business
              found through web research caps the score at 40, no matter how clean everything
              else looks. A conflict that direct is not something an average should be allowed to
              smooth over.
            </p>
          </Section>

          <Section id="coverage" title="3. Research Coverage">
            <p>
              Coverage is how much of the intended research actually completed, weighted the same
              way the score is. It sits beside the score, always, never inside it. A high score
              with 40% coverage means &ldquo;looks fine, but we only checked part of it,&rdquo;
              and the report says exactly that.
            </p>
            <p>
              Confidence on a single source is <code>ceiling × health × freshness</code>. The
              ceiling is set per source below; health tracks a source&rsquo;s recent reliability,
              so one that keeps getting rate-limited loses confidence automatically rather than
              staying trusted until somebody notices; freshness applies a small discount to a
              cached answer versus a fresh one.
            </p>
          </Section>

          <Section id="sources" title="4. Every source, and its ceiling">
            <p>
              The ceiling is the most confidence a source can ever report, before health and
              freshness are applied. An official first-party API earns a high one; a web-derived
              inference earns far less and can never be dressed up as certainty.
            </p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Basis</th>
                    <th className="px-3 py-2 font-medium">Ceiling</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Rate limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-charcoal">
                        {s.label}
                        <span className="ml-1.5 text-xs text-faint">
                          {GROUP_LABELS[SOURCE_GROUP[s.id]]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-charcoal-2">{TOS_LABEL[s.tosPosture]}</td>
                      <td className="px-3 py-2 tabular-nums text-charcoal-2">
                        {s.baseConfidenceCeiling}
                      </td>
                      <td className="px-3 py-2 text-charcoal-2">{costLabel(s)}</td>
                      <td className="px-3 py-2 text-charcoal-2">{rateLimitLabel(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Social handles carry the lowest ceiling on the list on purpose: only YouTube offers
              a free, official handle lookup. Every other platform here is a manual link, because
              an unauthenticated profile fetch can return a login wall or a soft 404 that reads as
              &ldquo;handle is free&rdquo; when it means nothing of the kind, and that false
              green check is the exact failure mode this product exists to avoid.
            </p>
            <p>Nothing in this product scrapes. A source posture of &ldquo;scraping&rdquo; fails a test before it can ship.</p>
          </Section>

          <Section id="left-out" title="5. What we left out, and why">
            <p>
              <strong className="text-charcoal">F-Droid.</strong> Its only structured endpoint is
              the full repository index, about 56 MB, three times larger than the Homebrew index
              we already judged too big to fetch per scan. There is no lighter search API, so it
              stays out rather than being forced in.
            </p>
            <p>
              <strong className="text-charcoal">Product Hunt.</strong> It is not a core source
              unless and until we have permission for our intended public-product use, so it does
              not sit in the source list at all, rather than looking available when it isn&rsquo;t
              wired up.
            </p>
            <p>
              <strong className="text-charcoal">A US company register.</strong> SEC EDGAR covers
              SEC registrants only, not US companies generally, and no free, general-purpose US
              company register exists the way Companies House exists for the UK. This is a real
              gap, not a hidden one — it is why a US business name leans more heavily on domain
              and web evidence than a UK one does.
            </p>
          </Section>

          <Section id="trademark" title="6. Trademark Assist">
            <p>
              No automated trademark research runs today. Trademark Assist generates spelling,
              confusable and phonetic variants, suggests likely Nice classes with reasoning, and
              links to the official free registries — USPTO, TMview, WIPO — with per-registry
              instructions. You search; you record what you found.
            </p>
            <p>
              Screening status is tracked separately from the score and is never worded to sound
              like clearance, even when every jurisdiction comes back clean. Automated trademark
              search is a real possibility later, behind a documented extension point that exists
              today specifically so it can be added without restructuring anything — but it needs
              real approvals first, so it isn&rsquo;t part of the product yet.
            </p>
          </Section>

          <p className="border-t border-line pt-6 text-sm text-faint">
            See the full report format on any <Link href="/" className="text-accent underline underline-offset-2">name check</Link>,
            or the source code itself — this page is generated from the same constants the
            scoring engine runs on, not written separately from it.
          </p>
        </div>
      </div>
    </div>
  )
}
