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
const DOWNLOADS_API = 'https://api.npmjs.org'

/** A registration this old, with zero downloads last month, reads as abandoned. */
const DORMANT_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000

interface NpmDoc {
  name: string
  description?: string
  time?: Record<string, string>
  'dist-tags'?: Record<string, string>
}

interface NpmDownloads {
  downloads: number
}

/**
 * Whether the exact match reads as abandoned rather than live.
 *
 * Deliberately conservative: a package is only downgraded when *both* signals
 * agree — no downloads last month *and* no publish in two years. A brand-new
 * package with zero downloads yet is not dormant, and a low-traffic package
 * that is still actively maintained is not either. Absence of a signal (the
 * downloads call failed, or the registry never returned a `time` field) never
 * counts as evidence of dormancy on its own.
 */
function isDormant(downloads: number | undefined, lastModified: string | undefined): boolean {
  if (downloads === undefined || downloads > 0) return false
  if (lastModified === undefined) return false
  const modifiedAt = Date.parse(lastModified)
  if (Number.isNaN(modifiedAt)) return false
  return Date.now() - modifiedAt > DORMANT_AGE_MS
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
        const lastModified = data.time?.modified

        // Best-effort: a failed downloads lookup must not fail the whole npm
        // check, and must not be read as evidence of dormancy either.
        let downloads: number | undefined
        try {
          const dl = await requestJson<NpmDownloads>(
            `${DOWNLOADS_API}/downloads/point/last-month/${encodeURIComponent(data.name)}`,
            { signal: deps.signal, expectedStatuses: [404] },
          )
          downloads = dl.data?.downloads
        } catch {
          downloads = undefined
        }

        const dormant = isDormant(downloads, lastModified)
        const matchEvidence: Evidence[] = [makeEvidence('npm', `Package "${data.name}" is published`, url)]
        if (dormant) {
          matchEvidence.push(
            makeEvidence(
              'npm',
              `No downloads in the last month and no publish in over two years (last: ${lastModified}). Reads as abandoned, not actively maintained.`,
            ),
          )
        } else if (downloads !== undefined) {
          matchEvidence.push(
            makeEvidence('npm', `${downloads.toLocaleString()} downloads in the last month`),
          )
        }

        exactMatches.push({
          externalId: data.name,
          name: data.name,
          categories: ['npm'],
          active: !dormant,
          url,
          similarity: compareNames(ctx.name, data.name),
          severity: dormant ? 'medium' : 'high',
          evidence: matchEvidence,
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
