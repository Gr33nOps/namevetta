/**
 * Docker Hub registry check.
 *
 * Unlike npm, crates.io, RubyGems and NuGet, Docker Hub has no single flat
 * namespace — every repository lives under an account (`someuser/redis`), and
 * only the curated `library/` namespace is what `docker pull redis` resolves
 * to without qualification. That distinction matters for severity, not just
 * plumbing: an official `library/{name}` image is as unambiguous a conflict as
 * an npm package of the same name, but `someuser/{name}` is real evidence of
 * someone using the string, not evidence the *name itself* is unavailable —
 * anyone can still publish `you/{name}`. So only the `library` lookup can
 * produce an exact match; every namespaced hit, even a literal string match,
 * is scored as a similar match instead.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const API = 'https://hub.docker.com/v2'

interface RepoDoc {
  name: string
  namespace: string
  description?: string | null
}

interface SearchResult {
  repo_name: string
  short_description?: string | null
  is_official?: boolean
}

interface SearchResponse {
  results?: SearchResult[]
}

/** The part after the last `/`, which is what a search hit's name actually is. */
function repoLabel(repoName: string): string {
  const parts = repoName.split('/')
  return parts[parts.length - 1] ?? repoName
}

export const dockerHubAdapter: SourceAdapter = {
  id: 'docker_hub',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = normalize(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('docker_hub', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const { status, data } = await requestJson<RepoDoc>(
        `${API}/repositories/library/${encodeURIComponent(pkg)}/`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      if (status === 404) {
        evidence.push(makeEvidence('docker_hub', `No official image named "${pkg}"`))
      } else if (data !== undefined) {
        const url = `https://hub.docker.com/_/${data.name}`
        exactMatches.push({
          externalId: `library/${data.name}`,
          name: data.name,
          categories: ['docker-hub', 'official'],
          active: true,
          url,
          similarity: compareNames(ctx.name, data.name),
          severity: 'high',
          evidence: [makeEvidence('docker_hub', `Official image "${data.name}" is published`, url)],
          ...(data.description === null || data.description === undefined || data.description === ''
            ? {}
            : { description: data.description }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'docker_hub',
        err?.code ?? 'LOOKUP_FAILED',
        'Docker Hub could not be reached.',
        true,
      )
    }

    try {
      const { data } = await requestJson<SearchResponse>(
        `${API}/search/repositories/?query=${encodeURIComponent(pkg)}&page_size=25`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      for (const found of data?.results ?? []) {
        // The official-image hit is the exact same repository already added
        // above; skip it rather than double-counting one conflict as two.
        if (found.is_official === true && normalize(repoLabel(found.repo_name)) === pkg) continue

        const label = repoLabel(found.repo_name)
        const similarity = compareNames(ctx.name, label)
        if (similarity.overall < 65) continue

        const url = `https://hub.docker.com/r/${found.repo_name}`
        similarMatches.push({
          externalId: found.repo_name,
          name: found.repo_name,
          categories: ['docker-hub'],
          active: true,
          url,
          similarity,
          severity: severityFor(similarity),
          evidence: [makeEvidence('docker_hub', `Repository "${found.repo_name}"`, url)],
          ...(found.short_description === null ||
          found.short_description === undefined ||
          found.short_description === ''
            ? {}
            : { description: found.short_description }),
        })
      }
      evidence.push(
        makeEvidence('docker_hub', `Searched repositories for names similar to "${pkg}"`),
        makeEvidence(
          'docker_hub',
          'Only the curated `library` namespace counts as an exact conflict here. A same-named repository under an individual account does not claim the name itself.',
        ),
      )
    } catch {
      evidence.push(
        makeEvidence('docker_hub', 'Repository search did not complete; exact result above still applies'),
      )
    }

    deps.log('docker_hub.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'docker_hub',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
