import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { SOURCE_IDS } from '@/lib/core/types'
import { isDatabaseConfigured } from '@/lib/db/client'
import { publicHealthSnapshot } from '@/lib/db/health-status'
import { GROUP_LABELS, SOURCE_GROUP } from '@/lib/scoring/weights'
import { Badge } from '@/components/ui/Badge'
import type { Tone } from '@/lib/presentation'

export const metadata = {
  title: 'Source status | NameVetta',
  description: 'Per-source reliability over the last 24 hours, including the bad numbers.',
  alternates: { canonical: '/status' },
  openGraph: {
    title: 'Source status | NameVetta',
    description: 'Per-source reliability over the last 24 hours, including the bad numbers.',
    url: '/status',
  },
}

// Five minutes is often enough to be current without a database round trip on
// every single visit — this page is informational, not part of any scan.
export const revalidate = 300

function toneFor(successRate: number): Tone {
  if (successRate >= 0.95) return 'ok'
  if (successRate >= 0.8) return 'warn'
  return 'danger'
}

export default async function Page() {
  const configured = isDatabaseConfigured()
  const snapshot = configured ? await publicHealthSnapshot() : new Map()

  const sources = [...SOURCE_IDS]
    .map((id) => SOURCE_MANIFEST[id])
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-14">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
          Source status
        </h1>
        <p className="mx-auto mt-6 max-w-[560px] text-sm leading-[1.75] text-charcoal-2">
          Real reliability for every source over the last 24 hours, published here rather than
          only used internally. A source below its usual success rate is losing confidence on the
          reports it appears in right now, automatically — this is what that looks like from the
          outside.
        </p>
      </div>

      {!configured ? (
        <p className="mx-auto mt-10 max-w-[560px] rounded-lg border border-unknown/30 bg-unknown-soft px-4 py-3 text-center text-sm text-unknown">
          This deployment has no database configured, so no history is being recorded. Every
          source still runs and reports honestly per scan — there is simply nothing to show here.
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-xs uppercase tracking-wide text-faint">
                <th scope="col" className="px-4 py-3 font-medium">Source</th>
                <th scope="col" className="px-4 py-3 font-medium">Group</th>
                <th scope="col" className="px-4 py-3 font-medium">Requests (24h)</th>
                <th scope="col" className="px-4 py-3 font-medium">Success rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sources.map((s) => {
                const health = snapshot.get(s.id)
                return (
                  <tr key={s.id}>
                    <th scope="row" className="px-4 py-3 font-normal text-charcoal">{s.label}</th>
                    <td className="px-4 py-3 text-charcoal-2">{GROUP_LABELS[SOURCE_GROUP[s.id]]}</td>
                    <td className="px-4 py-3 tabular-nums text-charcoal-2">
                      {health?.requests ?? '–'}
                    </td>
                    <td className="px-4 py-3">
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
        </div>
      )}

      <p className="mx-auto mt-6 max-w-[560px] text-center text-xs text-faint">
        &ldquo;No recent data&rdquo; means fewer than one request in the last 24 hours, not that a
        source is broken. A degraded source still returns honest results here — it never reports
        a name as clear just because it&rsquo;s struggling.
      </p>
    </div>
  )
}
