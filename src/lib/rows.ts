/**
 * The results list, as a row per source.
 *
 * The report proper groups by what a reader has to decide (conflicts first,
 * unchecked next, clear folded away). This is the other view: one flat list in
 * a fixed order, filterable by the kind of place that was checked. It answers
 * "where is this name already used" at a glance, before anyone reads evidence.
 */
import { SOURCE_MANIFEST } from '@/lib/core/adapter'
import { z } from 'zod'
import {
  PlatformVerdictSchema,
  SOURCE_IDS,
  type PlatformVerdict,
  type SourceResult,
  type SourceStatus,
} from '@/lib/core/types'
import {
  deliberatelySkipped,
  resultPresentation,
  STATUS_PRESENTATION,
  UNVERIFIED_PRESENTATION,
  type Tone,
} from '@/lib/presentation'
import { SOURCE_GROUP, type ScoreGroup } from '@/lib/scoring/weights'

/**
 * The filter pills, and which scoring groups each one covers.
 *
 * Five buckets over eight scoring groups: the groups exist to weight a score
 * and split finer than a person filtering a list wants to click through.
 * `all` is not listed because it is the absence of a filter.
 */
export const ROW_FILTERS = [
  { id: 'domains', label: 'Domains', groups: ['domain'] },
  { id: 'code', label: 'Code', groups: ['github', 'packages'] },
  { id: 'social', label: 'Social', groups: ['social', 'youtube'] },
  { id: 'business', label: 'Business', groups: ['web'] },
  { id: 'stores', label: 'Stores', groups: ['app_store', 'play_store'] },
] as const satisfies readonly {
  id: string
  label: string
  groups: readonly ScoreGroup[]
}[]

export type RowFilterId = (typeof ROW_FILTERS)[number]['id']

/** Which pill a source sits under, or undefined if no pill covers its group. */
export function filterFor(result: SourceResult): RowFilterId | undefined {
  const group = SOURCE_GROUP[result.source]
  return ROW_FILTERS.find((f) => (f.groups as readonly ScoreGroup[]).includes(group))?.id
}

/**
 * Sources that speak for several platforms at once.
 *
 * Both check a handful of networks and report as one source, because the
 * weight table has one slot for social identity rather than nine. The list
 * splits them back out: a reader looking for Instagram wants a row that says
 * Instagram, not one called "Social identity" they have to open.
 *
 * A result from before the adapters published `meta.platforms` simply renders
 * as one row, the way it always did.
 */
const AGGREGATE_SOURCES: readonly string[] = ['socials', 'social_check']

function platformsOf(result: SourceResult): PlatformVerdict[] {
  if (!AGGREGATE_SOURCES.includes(result.source)) return []
  const raw = result.meta?.['platforms']
  if (!Array.isArray(raw)) return []

  const parsed = z.array(PlatformVerdictSchema).safeParse(raw)
  return parsed.success ? parsed.data : []
}

export interface Row {
  /** Unique per rendered row, so an expanded platform gets its own key. */
  key: string
  /** The status this row reports, which for a platform is its own, not its source's. */
  status: SourceStatus
  /**
   * How the row should read, reason and all.
   *
   * Carried here rather than derived by the renderer from `status` alone,
   * because the status cannot tell a deliberate skip from a timeout and the
   * list was labelling both "Unverifiable".
   */
  statusLabel: string
  tone: Tone
  source: string
  /** The source's own name, e.g. "GitHub". */
  label: string
  /** The pill it filters under, e.g. "Social". Blank when nothing covers it. */
  category: string
  /**
   * The one line of detail, set in mono because it is a literal string.
   *
   * Taken from the source's own evidence or its strongest match rather than
   * built from a template: a row that says `github.com/acme` when nothing was
   * looked up at that address would be inventing a check. Where a source
   * reported neither, the row says what actually happened instead.
   */
  detail: string
}

/**
 * How badly a status wants reading, worst first.
 *
 * The same three bands the report groups by — what needs a decision, what
 * could not be established, what was fine — so the flat list and the report
 * below it never disagree about what matters. "Unverifiable" sits above
 * "clear" because it is not evidence that the name is free, and below the
 * conflicts because it is not evidence that it is taken either.
 */
const STATUS_RANK: Record<SourceStatus, number> = {
  confirmed_conflict: 0,
  similar_found: 1,
  unable_to_verify: 2,
  manual_check_recommended: 3,
  no_conflict: 5,
}

/**
 * A deliberate skip sorts below every real answer.
 *
 * It ranks under "manual check" because a manual check is still something the
 * reader has to do, and above "clear" only because it is not a clear result.
 */
const SKIPPED_RANK = 4

/**
 * The list order: by what needs attention, then by pill, then by the manifest.
 *
 * Results arrive in whatever order the sources answer, which is a different
 * order every time and puts Google Play above .com, so something has to fix
 * the order. It used to be the pill alone, which grouped the list tidily and
 * buried the answer: on a name with three conflicts and fifty clear checks,
 * every conflict fell below fifteen rows of "CLEAR" and the first thing a
 * person saw after searching was a wall of green.
 *
 * Status leads now. The pill still groups within a band, so all the domains
 * that need a look sit together and all the clear ones do too, and the
 * manifest breaks the last tie so two runs of the same name produce the same
 * page. Filtering is unaffected: a pill narrows the list, it does not reorder
 * it.
 */
export function sortRows(results: readonly SourceResult[]): SourceResult[] {
  const statusRank = (r: SourceResult): number =>
    deliberatelySkipped(r) ? SKIPPED_RANK : STATUS_RANK[r.status]
  const pillRank = (r: SourceResult): number => {
    const id = filterFor(r)
    const i = ROW_FILTERS.findIndex((f) => f.id === id)
    return i === -1 ? ROW_FILTERS.length : i
  }
  const manifestRank = (r: SourceResult): number => SOURCE_IDS.indexOf(r.source)

  return [...results].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) || pillRank(a) - pillRank(b) || manifestRank(a) - manifestRank(b),
  )
}

/**
 * The rows one result produces: usually one, but one per platform for the
 * sources that cover several.
 */
export function rowsFor(result: SourceResult): Row[] {
  const filter = ROW_FILTERS.find((f) => f.id === filterFor(result))
  const category = filter?.label ?? ''
  const platforms = platformsOf(result)

  if (platforms.length === 0) {
    const presentation = resultPresentation(result)
    return [
      {
        key: result.source,
        status: result.status,
        statusLabel: presentation.label,
        tone: presentation.tone,
        source: result.source,
        label: SOURCE_MANIFEST[result.source].label,
        category,
        detail: detailFor(result),
      },
    ]
  }

  return platforms.map((platform) => {
    // A platform verdict carries no error code, so a manual one is classified
    // from its status and everything else reads straight off the status table.
    const presentation =
      platform.status === 'manual_check_recommended'
        ? UNVERIFIED_PRESENTATION.manual
        : STATUS_PRESENTATION[platform.status]
    return {
      key: `${result.source}:${platform.name}`,
      status: platform.status,
      statusLabel: presentation.label,
      tone: presentation.tone,
      source: result.source,
      label: platform.name,
      category,
      detail: platform.detail,
    }
  })
}

/**
 * The compact rows used in the score panel.
 *
 * Manual platforms are useful actions, not six separate failed checks, so the
 * panel summarizes them once and the report below owns the direct links.
 * Deliberate category skips are also left to their explanatory report section;
 * repeating them here made Google Play look unavailable before the reader saw
 * that it simply was not relevant to this category.
 */
export function panelRows(
  results: readonly SourceResult[],
  filter: RowFilterId | 'all',
): Row[] {
  const included = sortRows(results).filter(
    (result) => filter === 'all' || filterFor(result) === filter,
  )
  const manualCount = included
    .filter((result) => result.status === 'manual_check_recommended')
    .flatMap(rowsFor).length
  const rows: Row[] = []
  let manualAdded = false

  for (const result of included) {
    if (deliberatelySkipped(result)) continue

    if (result.status === 'manual_check_recommended') {
      if (manualAdded) continue
      manualAdded = true
      rows.push({
        key: 'manual-verification',
        status: 'manual_check_recommended',
        statusLabel: 'Verify directly',
        tone: 'neutral',
        source: 'manual-verification',
        label: 'Manual verification',
        category: 'Social',
        detail: `${manualCount} ${manualCount === 1 ? 'platform link is' : 'platform links are'} ready below`,
      })
      continue
    }

    rows.push(...rowsFor(result))
  }

  return rows
}

/**
 * How many individual platform links still need a person.
 *
 * A manual source can stand for several platforms. Counting source rows here
 * would tell a reader "2 manual checks" when the report actually asks them to
 * verify Instagram, TikTok, Reddit Community, Twitch, Threads, and Slack.
 */
export function manualVerificationCount(results: readonly SourceResult[]): number {
  return results
    .filter((result) => result.status === 'manual_check_recommended')
    .flatMap(rowsFor).length
}

function detailFor(result: SourceResult): string {
  const exact = result.exactMatches[0]
  if (exact !== undefined) return exact.name

  const evidence = result.evidence[0]
  if (evidence !== undefined) return evidence.label

  const similar = result.similarMatches[0]
  if (similar !== undefined) return similar.name

  if (result.error !== undefined) return result.error.message
  return 'Nothing found'
}
