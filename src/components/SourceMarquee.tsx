import { activeSources } from '@/lib/core/adapter'
import { SourceLogo } from '@/components/SourceLogo'

const SOURCES = activeSources()
const LABELS = SOURCES.map((source) => source.label)

/**
 * One scrolling row.
 *
 * The list is rendered twice and the track travels exactly half its own width,
 * which is what makes the loop seamless. The second copy is `aria-hidden` so a
 * screen reader is not read sixty source names twice over; the section's label
 * carries the meaning, and /status carries the real list with each source's
 * recent reliability.
 */
function Row({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className={`marquee-track ${reverse ? 'reverse' : ''}`}>
      {[0, 1].map((copy) => (
        <div key={copy} className="flex shrink-0 gap-2.5 pr-2.5" aria-hidden={copy === 1}>
          {LABELS.map((label) => (
            <span
              key={`${copy}-${label}`}
              className="flex shrink-0 items-center rounded-full border border-line bg-surface/50 px-3.5 py-1.5 text-[12.5px] whitespace-nowrap text-charcoal-2"
            >
              <SourceLogo label={label} size="sm" />
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Every source, scrolling.
 *
 * The trust signal is the list itself, generated from the manifest that
 * actually runs, so it cannot overstate what the engine does.
 *
 * The label used to read "n sources checked on every search", which was the
 * one thing this component was built not to do: seven of them only run on a
 * Deep Check, one only for the categories it matters to, and one never runs
 * automatically at all. It names the catalog now, and the status page is where
 * a reader finds out which of them a given search asks.
 */
export function SourceMarquee() {
  return (
    <section
      aria-label={`The ${SOURCES.length} research sources in NameVetta`}
      className="overflow-hidden border-y border-line py-5"
    >
      <Row />
      <div className="mt-2.5">
        <Row reverse />
      </div>
    </section>
  )
}
