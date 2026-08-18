/**
 * PyPI check (§10).
 *
 * PyPI's JSON API is exact-name only — the old XML-RPC `search` was disabled
 * years ago and there is no hosted replacement. So "similar package detection"
 * cannot be a remote query here; Phase 6 mirrors the PEP 691 simple index into
 * the local corpus and searches it properly.
 *
 * Until then this adapter probes the highest-weight spelling variants directly.
 * That genuinely finds close typosquats, and the gap is stated in evidence
 * rather than papered over.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'
import { generateVariants } from '@/lib/similarity/variants'

const PYPI = 'https://pypi.org/pypi'

/** How many variants to probe. Each is one request against a shared quota. */
const VARIANT_PROBE_LIMIT = 8

interface PypiDoc {
  info?: {
    name: string
    summary?: string | null
    author?: string | null
    package_url?: string
    yanked?: boolean
  }
}

async function lookup(
  name: string,
  signal: AbortSignal,
): Promise<PypiDoc['info'] | undefined> {
  const { status, data } = await requestJson<PypiDoc>(
    `${PYPI}/${encodeURIComponent(name)}/json`,
    { signal, expectedStatuses: [404], retries: 1 },
  )
  return status === 404 ? undefined : data?.info
}

export const pypiAdapter: SourceAdapter = {
  id: 'pypi',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = normalize(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('pypi', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const info = await lookup(pkg, deps.signal)
      if (info === undefined) {
        evidence.push(makeEvidence('pypi', `No PyPI project named "${pkg}"`))
      } else {
        const url = info.package_url ?? `https://pypi.org/project/${info.name}/`
        exactMatches.push({
          externalId: info.name,
          name: info.name,
          categories: ['pypi'],
          active: info.yanked !== true,
          url,
          similarity: compareNames(ctx.name, info.name),
          severity: 'high',
          evidence: [makeEvidence('pypi', `Project "${info.name}" is published`, url)],
          ...(info.author === undefined || info.author === null ? {} : { owner: info.author }),
          ...(info.summary === undefined || info.summary === null
            ? {}
            : { description: info.summary }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'pypi',
        err?.code ?? 'LOOKUP_FAILED',
        'PyPI could not be reached.',
        true,
      )
    }

    // Probe close variants, skipping the exact name we already resolved.
    const variants = generateVariants(ctx.name, VARIANT_PROBE_LIMIT + 1)
      .filter((v) => v.value !== pkg)
      .slice(0, VARIANT_PROBE_LIMIT)

    const probes = await Promise.allSettled(
      variants.map(async (variant) => ({
        variant: variant.value,
        info: await lookup(variant.value, deps.signal),
      })),
    )

    for (const probe of probes) {
      if (probe.status !== 'fulfilled' || probe.value.info === undefined) continue
      const info = probe.value.info
      const similarity = compareNames(ctx.name, info.name)
      const url = info.package_url ?? `https://pypi.org/project/${info.name}/`

      similarMatches.push({
        externalId: info.name,
        name: info.name,
        categories: ['pypi'],
        active: info.yanked !== true,
        url,
        similarity,
        severity: severityFor(similarity, { active: info.yanked !== true }),
        evidence: [makeEvidence('pypi', `Similar project "${info.name}" is published`, url)],
        ...(info.summary === undefined || info.summary === null
          ? {}
          : { description: info.summary }),
      })
    }

    evidence.push(
      makeEvidence('pypi', `Probed ${variants.length} close spelling variants`),
      // Stated plainly so nobody reads a clean PyPI result as exhaustive.
      makeEvidence(
        'pypi',
        'PyPI has no public search API, so this checks the exact name and close variants rather than the full index.',
      ),
    )

    deps.log('pypi.checked', { probed: variants.length, similar: similarMatches.length })

    return buildResult({
      source: 'pypi',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
