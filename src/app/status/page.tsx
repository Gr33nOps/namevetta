import {
  isCategoryDependent,
  sourceCounts,
  activeSources,
  type SourceManifestEntry,
} from '@/lib/core/adapter'
import { isDatabaseConfigured } from '@/lib/db/client'
import { publicHealthSnapshot } from '@/lib/db/health-status'
import { GROUP_LABELS, SOURCE_GROUP } from '@/lib/scoring/weights'
import { Badge } from '@/components/ui/Badge'
import { ScrollArea } from '@/components/ui/ScrollArea'
import type { Tone } from '@/lib/presentation'
import { SourceLogo } from '@/components/SourceLogo'
import { PageHeader } from '@/components/PageHeader'

export const metadata = {
  title: 'Source status | NameVetta',
  description: 'Recent reliability for each research source.',
  alternates: { canonical: '/status' },
  openGraph: {
    title: 'Source status | NameVetta',
    description: 'Recent reliability for each research source.',
    url: '/status',
  },
}

// Five minutes is often enough to be current without a database round trip on
// every single visit — this page is informational, not part of any scan.
export const revalidate = 300

const COUNTS = sourceCounts()

function toneFor(successRate: number): Tone {
  if (successRate >= 0.95) return 'ok'
  if (successRate >= 0.8) return 'warn'
  return 'danger'
}

/** One headline number, with what it counts under it. */
function Stat({ value, label, tone }: { value: string; label: string; tone?: 'ok' | 'warn' }) {
  const colour = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-charcoal'
  return (
    <div className="px-5 py-4">
      <p className={`font-display text-[28px] leading-none font-semibold tabular-nums ${colour}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[13px] text-charcoal-2">{label}</p>
    </div>
  )
}

/**
 * When a source runs, in one phrase.
 *
 * Three different answers used to be flattened into "checked on every search":
 * a source on the deep set only, a source that decides for itself based on
 * what is being named, and a source that never runs automatically at all.
 */
function whenItRuns(source: SourceManifestEntry): string {
  if (source.tosPosture === 'manual_only') return 'Never automatic'
  if (isCategoryDependent(source.id)) return 'Some categories'
  if (!source.runsOn.includes('quick')) return 'Deep Research'
  return 'Every search'
}

/** Whether the product asserts anything from this source without a human. */
function howItRuns(source: SourceManifestEntry): string {
  if (source.tosPosture === 'manual_only') return 'Manual'
  return source.resultMode === 'discovery' ? 'Discovery' : 'Automatic'
}

/**
 * Source status.
 *
 * The page used to open with a table of every source, which is sixty rows of
 * numbers before a reader learns whether anything is wrong. The answer to
 * that is three figures, so those come first and the table folds away
 * underneath for anyone who wants to audit a specific source.
 *
 * The table itself is two layouts, not one: a card per source below `md`, a
 * real table above it. A five-column table at 412px wide overflowed its own
 * container by sixty pixels and the page hid the overflow, so a phone silently
 * lost the success rate — the one column the page exists to publish.
 */
export default async function Page() {
  const configured = isDatabaseConfigured()
  const snapshot = configured ? await publicHealthSnapshot() : new Map()

  const sources = activeSources()
    .sort((a, b) => a.label.localeCompare(b.label))

  const reporting = sources.filter((s) => snapshot.get(s.id) !== undefined)
  const healthy = reporting.filter((s) => (snapshot.get(s.id)?.successRate ?? 0) >= 0.95)
  const struggling = reporting.filter((s) => (snapshot.get(s.id)?.successRate ?? 1) < 0.8)

  return (
    <div className="page-shell">
      <PageHeader title="Source status">Recent reliability across our research sources.</PageHeader>

      {/*
        The three counts, stated as three counts.

        "All sources checked on every search" was the single most misleading
        sentence on the site: some run only on Deep Research, some only where
        the category makes them useful, and some never run automatically.
      */}
      <div className="panel mt-8 grid overflow-hidden rounded-panel divide-y divide-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <Stat value={String(COUNTS.catalog)} label="research sources in the catalog" />
        <Stat value={String(COUNTS.quick)} label="in the Quick Check research set" />
        <Stat value={String(COUNTS.deep)} label="considered by Deep Research" />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        {COUNTS.deepOnly} Deep-only · {COUNTS.categoryDependent} category-dependent · {COUNTS.discovery}{' '}
        discovery · {COUNTS.manual} manual. Not run never means clear.
      </p>

      {!configured ? (
        <p className="card mt-8 rounded-2xl border-unknown/30 bg-unknown-soft px-5 py-4 text-sm text-unknown">
          No history database is configured, so there is no recent reliability data yet.
        </p>
      ) : (
        <div className="inset mt-8 grid overflow-hidden rounded-2xl divide-y divide-line sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          {/*
            A fresh deployment has nothing recorded yet, and "0/0" reads as
            "none of them are working" rather than "nobody has asked".
          */}
          {reporting.length === 0 ? (
            <>
              <Stat value="–" label="no sources queried in 24 hours" />
              <Stat value="–" label="data appears after the first check" />
            </>
          ) : (
            <>
              <Stat
                value={`${healthy.length}/${reporting.length}`}
                label="above 95% in the last 24 hours"
                tone="ok"
              />
              <Stat
                value={String(struggling.length)}
                label="below 80%, scored down"
                {...(struggling.length > 0 ? { tone: 'warn' as const } : {})}
              />
            </>
          )}
        </div>
      )}

      <details className="card mt-4 overflow-hidden rounded-2xl">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 text-[14.5px] font-semibold text-charcoal marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span aria-hidden="true" className="text-[11px] text-faint">
                ▸
              </span>
              All sources
              <span className="ml-auto text-[12.5px] font-normal text-faint">
                {sources.length} sources
              </span>
            </summary>

            {/* ── phones: one card per source ─────────────────────────── */}
            <ul className="divide-y divide-line border-t border-line md:hidden">
              {sources.map((s) => {
                const health = snapshot.get(s.id)
                return (
                  <li key={s.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex items-center gap-2 text-[14.5px] font-medium text-charcoal">
                        <SourceLogo label={s.label} />
                        {s.label}
                      </p>
                      {health === undefined ? (
                        <span className="shrink-0 text-xs text-faint">No recent data</span>
                      ) : (
                        <Badge tone={toneFor(health.successRate)} glyph={false}>
                          {Math.round(health.successRate * 100)}%
                        </Badge>
                      )}
                    </div>
                    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-charcoal-2">
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Group</dt>
                        <dd>{GROUP_LABELS[SOURCE_GROUP[s.id]]}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Runs</dt>
                        <dd>
                          {whenItRuns(s)} · {howItRuns(s)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Requests</dt>
                        <dd className="tabular-nums">{health?.requests ?? '–'}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Ceiling</dt>
                        <dd className="tabular-nums">{s.baseConfidenceCeiling}</dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>

            {/* ── wider screens: the table ────────────────────────────── */}
            <ScrollArea
              label="Every source, when it runs and its recent success rate"
              hint={false}
              className="hidden border-t border-line md:block"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-faint uppercase">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Source
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Group
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      When it runs
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Requests
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Success
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sources.map((s) => {
                    const health = snapshot.get(s.id)
                    return (
                      <tr key={s.id}>
                        <th scope="row" className="px-5 py-3 font-normal text-charcoal">
                          <span className="flex items-center gap-2">
                            <SourceLogo label={s.label} />
                            {s.label}
                          </span>
                        </th>
                        <td className="px-5 py-3 text-charcoal-2">
                          {GROUP_LABELS[SOURCE_GROUP[s.id]]}
                        </td>
                        <td className="px-5 py-3 text-charcoal-2">
                          {whenItRuns(s)}
                          {s.tosPosture === 'manual_only' ? null : (
                            <span className="ml-1.5 text-xs text-faint">{howItRuns(s)}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-charcoal-2">
                          {health?.requests ?? '–'}
                        </td>
                        <td className="px-5 py-3">
                          {health === undefined ? (
                            <span className="text-faint">No recent data</span>
                          ) : (
                            <Badge tone={toneFor(health.successRate)} glyph={false}>
                              {Math.round(health.successRate * 100)}%
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollArea>
      </details>

      <p className="mt-5 text-xs leading-relaxed text-faint">
        No recent data means no recent request, not a failure.
      </p>
    </div>
  )
}
