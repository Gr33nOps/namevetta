import { Badge } from '@/components/ui/Badge'
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import type { Match, SourceId, SourceResult } from '@/lib/core/types'
import { SEVERITY_PRESENTATION, STATUS_PRESENTATION } from '@/lib/presentation'
import { relativeTime } from '@/lib/relativeTime'

/** Shared retry affordance for a source stuck at `unable_to_verify`. */
export function RetryButton({
  onClick,
  retrying,
}: {
  onClick: () => void
  retrying: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={retrying}
      className="rounded-md border border-line-strong px-2 py-1 text-xs font-medium text-charcoal-2 transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60 print:hidden"
    >
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  )
}

/** Whether a result is worth offering a retry button for. */
export function isRetryable(result: SourceResult): boolean {
  return result.status === 'unable_to_verify' && (result.error?.retryable ?? false)
}

function MatchRow({ match }: { match: Match }) {
  const severity = SEVERITY_PRESENTATION[match.severity]
  return (
    <li className="rounded-lg border border-line bg-muted-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{match.name}</span>
        <Badge tone={severity.tone} glyph={false}>
          {severity.label}
        </Badge>
      </div>

      {match.owner ? <p className="mt-1 text-sm text-charcoal-2">{match.owner}</p> : null}
      {match.description ? (
        <p className="mt-1 text-sm text-charcoal-2">{match.description}</p>
      ) : null}

      {/*
        Four percentages per match, three matches to a card, is twelve numbers
        a person cannot act on. They are the workings behind the severity badge
        already shown above, so they belong behind the question they answer.
      */}
      <details className="mt-2.5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-faint marker:content-none hover:text-charcoal-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span aria-hidden="true">▸</span> Why is this similar?
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-faint">Text</dt>
            <dd className="tabular-nums">{match.similarity.text}%</dd>
          </div>
          <div>
            <dt className="text-faint">Phonetic</dt>
            <dd className="tabular-nums">{match.similarity.phonetic}%</dd>
          </div>
          <div>
            <dt className="text-faint">Visual</dt>
            <dd className="tabular-nums">{match.similarity.visual}%</dd>
          </div>
          <div>
            <dt className="text-faint">Industry</dt>
            {/* Never invent a figure we do not have. */}
            <dd className="tabular-nums">
              {match.similarity.industry === undefined ? '–' : `${match.similarity.industry}%`}
            </dd>
          </div>
        </dl>
        {match.categories.length > 0 ? (
          <p className="mt-2 text-xs text-faint">Type: {match.categories.join(', ')}</p>
        ) : null}
      </details>

      {match.url ? (
        <a
          href={match.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2 hover:text-accent"
        >
          Open source record
        </a>
      ) : null}
    </li>
  )
}

/**
 * A single-line row for a source with nothing to read: clear or unreachable.
 * The full `SourceCard` treatment is reserved for sources that need it.
 */
export function CompactSourceRow({
  result,
  onRetry,
  retrying = false,
}: {
  result: SourceResult
  /** Omitted where retry isn't wired up (there is only one call site today). */
  onRetry?: (source: SourceId) => void
  retrying?: boolean
}) {
  const manifest = SOURCE_MANIFEST[result.source]
  const status = STATUS_PRESENTATION[result.status]

  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-charcoal-2">{manifest.label}</span>
      <div className="flex items-center gap-2">
        <Badge tone={status.tone} glyph={false}>
          {status.label}
        </Badge>
        {/*
          Hidden on a phone. Twelve rows each repeating "95 confidence · just
          now" was most of the old page's width and all of its noise; the figure
          still matters to anyone auditing a result, so it stays where there is
          room for it.
        */}
        <span className="hidden text-xs text-faint sm:inline">
          {result.confidence > 0 ? `${result.confidence} confidence` : 'No confidence'} ·{' '}
          {relativeTime(result.checkedAt)}
        </span>
        {onRetry !== undefined && isRetryable(result) ? (
          <RetryButton onClick={() => onRetry(result.source)} retrying={retrying} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * One source's findings, with its evidence always available.
 *
 * Confidence is shown as a number rather than hidden behind a colour, because a
 * user comparing a 95-confidence USPTO result against a 50-confidence web
 * result should be able to see why one carries more weight than the other.
 */
export function SourceCard({ result }: { result: SourceResult }) {
  const manifest = SOURCE_MANIFEST[result.source]
  const status = STATUS_PRESENTATION[result.status]
  const matches = [...result.exactMatches, ...result.similarMatches]

  return (
    <article className="rounded-xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{manifest.label}</h3>
          <p className="mt-0.5 text-sm text-charcoal-2">{status.detail}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="hidden text-xs text-faint sm:inline">
            {result.confidence > 0 ? `${result.confidence} confidence` : 'No confidence'}
            {result.fromCache ? ' · cached' : ''} · {relativeTime(result.checkedAt)}
          </span>
        </div>
      </header>

      {result.error ? (
        <p className="mt-3 rounded-lg bg-unknown-soft px-3 py-2 text-sm text-unknown">
          {result.error.message}
          {result.error.retryable ? ' (This source can be retried.)' : ''}
        </p>
      ) : null}

      {matches.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {matches.map((m) => (
            <MatchRow key={`${m.externalId}-${m.name}`} match={m} />
          ))}
        </ul>
      ) : result.evidence.length > 0 ? (
        /*
          Not every source reports through `Match` objects. The domain check
          states its finding in evidence, which left its card saying "worth
          investigating, see the evidence below" above nothing at all, with the
          actual finding a click away. Show the first few inline: a card that
          flags a problem should say what the problem is.
        */
        <ul className="mt-3 space-y-1.5 text-sm">
          {result.evidence.slice(0, 3).map((e, i) => (
            <li key={`${e.label}-${i}`} className="text-charcoal-2">
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline underline-offset-2"
                >
                  {e.label}
                </a>
              ) : (
                e.label
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {result.evidence.length > 0 ? (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm font-medium text-accent hover:text-accent">
            View evidence ({result.evidence.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm">
            {result.evidence.map((e, i) => (
              <li key={`${e.label}-${i}`} className="text-charcoal-2">
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent underline underline-offset-2 hover:text-accent"
                  >
                    {e.label}
                  </a>
                ) : (
                  e.label
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}
