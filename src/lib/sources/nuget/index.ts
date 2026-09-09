/**
 * NuGet (.NET) registry check.
 *
 * NuGet's package-id endpoint (`v3-flatcontainer`) confirms existence but
 * carries no metadata beyond a version list, so both the exact check and
 * similar-name search go through the same search service instead —
 * `packageid:` is an exact-match filter within it, not a fuzzy query, which is
 * what makes it usable for the existence check too.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const SEARCH = 'https://azuresearch-usnc.nuget.org/query'

interface NuGetDoc {
  id: string
  description?: string
  authors?: string[]
  projectUrl?: string
}

interface NuGetSearch {
  data?: NuGetDoc[]
}

export const nugetAdapter: SourceAdapter = {
  id: 'nuget',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = normalize(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('nuget', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const { data } = await requestJson<NuGetSearch>(
        `${SEARCH}?q=${encodeURIComponent(`packageid:${ctx.name}`)}&take=1`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      const exact = data?.data?.[0]
      if (exact === undefined) {
        evidence.push(makeEvidence('nuget', `Package id "${ctx.name}" is unpublished`))
      } else {
        const url = `https://www.nuget.org/packages/${exact.id}`
        exactMatches.push({
          externalId: exact.id,
          name: exact.id,
          categories: ['nuget'],
          active: true,
          url,
          similarity: compareNames(ctx.name, exact.id),
          severity: 'high',
          evidence: [makeEvidence('nuget', `Package "${exact.id}" is published`, url)],
          ...(exact.description === undefined || exact.description === ''
            ? {}
            : { description: exact.description }),
          ...(exact.authors === undefined || exact.authors.length === 0
            ? {}
            : { owner: exact.authors.join(', ') }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'nuget',
        err?.code ?? 'LOOKUP_FAILED',
        'NuGet could not be reached.',
        true,
      )
    }

    try {
      const { data } = await requestJson<NuGetSearch>(
        `${SEARCH}?q=${encodeURIComponent(ctx.name)}&take=20`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      for (const found of data?.data ?? []) {
        if (normalize(found.id) === pkg) continue

        const similarity = compareNames(ctx.name, found.id)
        if (similarity.overall < 65) continue

        const url = `https://www.nuget.org/packages/${found.id}`
        similarMatches.push({
          externalId: found.id,
          name: found.id,
          categories: ['nuget'],
          active: true,
          url,
          similarity,
          severity: severityFor(similarity),
          evidence: [makeEvidence('nuget', `Similar package "${found.id}"`, url)],
          ...(found.description === undefined || found.description === ''
            ? {}
            : { description: found.description }),
        })
      }
      evidence.push(makeEvidence('nuget', `Searched the registry for names similar to "${ctx.name}"`))
    } catch {
      evidence.push(
        makeEvidence('nuget', 'Similar-package search did not complete; exact result above still applies'),
      )
    }

    deps.log('nuget.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'nuget',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
