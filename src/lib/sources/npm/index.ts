/**
 * npm registry check (§9).
 *
 * The registry exposes both an exact document lookup and a search endpoint, so
 * unlike PyPI this source can find similar names directly without a local
 * corpus.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const REGISTRY = 'https://registry.npmjs.org'

interface NpmDoc {
  name: string
  description?: string
  time?: Record<string, string>
  'dist-tags'?: Record<string, string>
}

interface NpmSearch {
  objects?: {
    package: {
      name: string
      description?: string
      publisher?: { username: string }
      date?: string
      links?: { npm?: string }
    }
  }[]
}

/** npm package names are lowercase and allow hyphens; normalize drops those. */
function toPackageName(input: string): string {
  return normalize(input)
}

export const npmAdapter: SourceAdapter = {
  id: 'npm',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = toPackageName(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('npm', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const { status, data } = await requestJson<NpmDoc>(`${REGISTRY}/${encodeURIComponent(pkg)}`, {
        signal: deps.signal,
        expectedStatuses: [404],
      })

      if (status === 404) {
        evidence.push(makeEvidence('npm', `Package name "${pkg}" is unpublished`))
      } else if (data !== undefined) {
        const url = `https://www.npmjs.com/package/${data.name}`
        exactMatches.push({
          externalId: data.name,
          name: data.name,
          categories: ['npm'],
          active: true,
          url,
          similarity: compareNames(ctx.name, data.name),
          severity: 'high',
          evidence: [makeEvidence('npm', `Package "${data.name}" is published`, url)],
          ...(data.description === undefined ? {} : { description: data.description }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'npm',
        err?.code ?? 'LOOKUP_FAILED',
        'The npm registry could not be reached.',
        true,
      )
    }

    try {
      const { data } = await requestJson<NpmSearch>(
        `${REGISTRY}/-/v1/search?text=${encodeURIComponent(pkg)}&size=20`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      for (const entry of data?.objects ?? []) {
        const found = entry.package
        if (normalize(found.name) === pkg) continue

        const similarity = compareNames(ctx.name, found.name)
        if (similarity.overall < 65) continue

        const url = found.links?.npm ?? `https://www.npmjs.com/package/${found.name}`
        similarMatches.push({
          externalId: found.name,
          name: found.name,
          categories: ['npm'],
          active: true,
          url,
          similarity,
          severity: severityFor(similarity),
          evidence: [makeEvidence('npm', `Similar package "${found.name}"`, url)],
          ...(found.publisher?.username === undefined ? {} : { owner: found.publisher.username }),
          ...(found.description === undefined ? {} : { description: found.description }),
        })
      }
      evidence.push(makeEvidence('npm', `Searched the registry for names similar to "${pkg}"`))
    } catch {
      evidence.push(
        makeEvidence('npm', 'Similar-package search did not complete; exact result above still applies'),
      )
    }

    deps.log('npm.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'npm',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
