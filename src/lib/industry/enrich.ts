/**
 * Industry enrichment of scan results.
 *
 * Applied centrally in the orchestrator rather than inside each adapter. Nine
 * adapters computing relevance independently would be nine chances to do it
 * slightly differently, and severity feeds the §20 score caps — a cap that fires
 * inconsistently depending on which source found the conflict is worse than no
 * cap at all.
 *
 * Adapters stay simple: they report what they found, and this decides how much
 * it matters.
 */
import type { ScanContext } from '@/lib/core/scan'
import { isVerified, type Match, type SourceResult } from '@/lib/core/types'
import { SOURCE_GROUP } from '@/lib/scoring/weights'
import { NON_COMMERCIAL_TAG, severityFor } from '@/lib/sources/severity'
import { compareNames, containsNameAsWord, leadsWithName } from '@/lib/similarity/score'
import { classifyMatch, classifyScan, type Classification } from './classify'
import { industryRelevance } from './relevance'

/**
 * Sources whose matches carry legal weight, so a near-exact same-industry hit
 * can reach `critical`. Company registries qualify; an npm package does not.
 */
const LEGALLY_WEIGHTED_GROUPS = new Set(['web'])

function enrichMatch(ctx: ScanContext, scan: Classification, match: Match, legallyWeighted: boolean): Match {
  const relevance = industryRelevance(
    scan,
    classifyMatch({ description: match.description, categories: match.categories }),
  )

  // Recompute the blend with industry folded in, then re-derive severity from
  // the updated picture. Severity computed before we knew the industry was a
  // provisional reading; this is the real one.
  const comparable = match.comparisonName ?? match.name
  const similarity = compareNames(
    ctx.name,
    comparable,
    relevance === undefined ? {} : { industry: relevance },
  )

  // A source that already determined this match has no commercial standing knows
  // something enrichment does not. Respect it rather than recomputing over it.
  const severity = match.categories.includes(NON_COMMERCIAL_TAG)
    ? 'low'
    : severityFor(similarity, {
        active: match.active ?? true,
        legallyWeighted,
        contained: containsNameAsWord(ctx.name, comparable),
        leading: leadsWithName(ctx.name, comparable),
      })

  return { ...match, similarity, severity }
}

/**
 * Add industry relevance to every match in a result.
 *
 * Unverifiable results pass through untouched — they carry no matches by schema
 * invariant, and there is nothing to enrich.
 */
export function enrichResult(
  ctx: ScanContext,
  scan: Classification,
  result: SourceResult,
): SourceResult {
  if (!isVerified(result.status)) return result
  if (result.exactMatches.length === 0 && result.similarMatches.length === 0) return result

  const legallyWeighted = LEGALLY_WEIGHTED_GROUPS.has(SOURCE_GROUP[result.source])

  return {
    ...result,
    exactMatches: result.exactMatches.map((m) => enrichMatch(ctx, scan, m, legallyWeighted)),
    similarMatches: result.similarMatches.map((m) => enrichMatch(ctx, scan, m, legallyWeighted)),
  }
}

/** Classify the scan once per run, rather than once per match. */
export function classifyScanContext(ctx: ScanContext): Classification {
  return classifyScan(ctx.category, ctx.description)
}
