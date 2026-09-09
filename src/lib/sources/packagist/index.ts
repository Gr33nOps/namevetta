/**
 * Packagist check (PHP / Composer).
 *
 * Packagist's namespace is `vendor/package`, so there is no single URL that
 * answers "is this bare name taken". Its search API is the honest way in: it
 * returns every package whose vendor or name matches, which is also what a
 * person naming a library actually wants to know.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

/** Below this a search hit is noise rather than a naming concern. */
const SIMILARITY_FLOOR = 65

interface Hit {
  name?: string
  description?: string
  url?: string
  downloads?: number
}

export const packagistAdapter: SourceAdapter = {
  id: 'packagist',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const name = normalize(ctx.name)
    if (name.length === 0) {
      return unverifiable('packagist', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    let hits: Hit[]
    try {
      const { data } = await requestJson<{ results?: Hit[] }>(
        `https://packagist.org/search.json?q=${encodeURIComponent(name)}&per_page=15`,
        { signal: deps.signal, retries: 1 },
      )
      hits = data?.results ?? []
    } catch {
      return unverifiable('packagist', 'LOOKUP_FAILED', 'Packagist could not be reached.', true)
    }

    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    for (const hit of hits) {
      if (hit.name === undefined) continue
      // "vendor/package" — the package half is what a name collides with.
      const short = hit.name.split('/').pop() ?? hit.name
      const similarity = compareNames(ctx.name, short)
      if (similarity.overall < SIMILARITY_FLOOR) continue

      const match: Match = {
        externalId: hit.name,
        name: hit.name,
        categories: ['php package'],
        similarity,
        severity: severityFor(similarity),
        evidence: [
          makeEvidence('packagist', `Package "${hit.name}" is published`, hit.url ?? undefined),
        ],
        ...(hit.url === undefined ? {} : { url: hit.url }),
        ...(hit.description === undefined ? {} : { description: hit.description }),
      }

      if (normalize(short) === name) exactMatches.push(match)
      else similarMatches.push(match)
    }

    const evidence: Evidence[] = [
      makeEvidence('packagist', `Searched Packagist and read ${hits.length} results`),
    ]
    if (exactMatches.length === 0 && similarMatches.length === 0) {
      evidence.push(makeEvidence('packagist', `Nothing on Packagist matching "${name}"`))
    }

    deps.log('packagist.checked', { hits: hits.length, similar: similarMatches.length })

    return buildResult({
      source: 'packagist',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
