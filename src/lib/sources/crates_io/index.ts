/**
 * crates.io (Rust) registry check.
 *
 * Same shape as `npm`: an exact document lookup and a real search endpoint, so
 * similar names are found directly rather than by probing spelling variants.
 * The registry's crawler policy asks for an identifying User-Agent and no more
 * than one request per second — the User-Agent is already sent on every
 * outbound request by `requestJson`, and the shared per-source rate limiter
 * holds this comfortably under the pace limit.
 */
import type { AdapterDeps, SourceAdapter } from '@/lib/core/adapter'
import type { ScanContext } from '@/lib/core/scan'
import type { Evidence, Match, SourceResult } from '@/lib/core/types'
import { requestJson, SourceRequestError } from '@/lib/sources/http'
import { buildResult, makeEvidence, statusFromMatches, unverifiable } from '@/lib/sources/result'
import { severityFor } from '@/lib/sources/severity'
import { normalize } from '@/lib/similarity/normalize'
import { compareNames } from '@/lib/similarity/score'

const REGISTRY = 'https://crates.io/api/v1/crates'

/** Crate names allow hyphens and underscores; normalize drops both. */
function toCrateName(input: string): string {
  return normalize(input)
}

interface CrateDoc {
  crate?: { id: string; name: string; description?: string | null; repository?: string | null }
}

interface CrateSearch {
  crates?: { id: string; name: string; description?: string | null }[]
}

export const cratesIoAdapter: SourceAdapter = {
  id: 'crates_io',

  async run(ctx: ScanContext, deps: AdapterDeps): Promise<SourceResult> {
    const pkg = toCrateName(ctx.name)
    if (pkg.length === 0) {
      return unverifiable('crates_io', 'INVALID_NAME', 'Name contains no usable characters', false)
    }

    const evidence: Evidence[] = []
    const exactMatches: Match[] = []
    const similarMatches: Match[] = []

    try {
      const { status, data } = await requestJson<CrateDoc>(
        `${REGISTRY}/${encodeURIComponent(pkg)}`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      if (status === 404) {
        evidence.push(makeEvidence('crates_io', `Crate name "${pkg}" is unpublished`))
      } else if (data?.crate !== undefined) {
        const crate = data.crate
        const url = `https://crates.io/crates/${crate.name}`
        exactMatches.push({
          externalId: crate.name,
          name: crate.name,
          categories: ['crates.io'],
          active: true,
          url,
          similarity: compareNames(ctx.name, crate.name),
          severity: 'high',
          evidence: [makeEvidence('crates_io', `Crate "${crate.name}" is published`, url)],
          ...(crate.description === null || crate.description === undefined
            ? {}
            : { description: crate.description }),
        })
      }
    } catch (cause) {
      const err = cause instanceof SourceRequestError ? cause : undefined
      return unverifiable(
        'crates_io',
        err?.code ?? 'LOOKUP_FAILED',
        'crates.io could not be reached.',
        true,
      )
    }

    try {
      const { data } = await requestJson<CrateSearch>(
        `${REGISTRY}?q=${encodeURIComponent(pkg)}&per_page=20`,
        { signal: deps.signal, expectedStatuses: [404] },
      )

      for (const found of data?.crates ?? []) {
        if (normalize(found.name) === pkg) continue

        const similarity = compareNames(ctx.name, found.name)
        if (similarity.overall < 65) continue

        const url = `https://crates.io/crates/${found.name}`
        similarMatches.push({
          externalId: found.name,
          name: found.name,
          categories: ['crates.io'],
          active: true,
          url,
          similarity,
          severity: severityFor(similarity),
          evidence: [makeEvidence('crates_io', `Similar crate "${found.name}"`, url)],
          ...(found.description === null || found.description === undefined
            ? {}
            : { description: found.description }),
        })
      }
      evidence.push(makeEvidence('crates_io', `Searched the registry for names similar to "${pkg}"`))
    } catch {
      evidence.push(
        makeEvidence('crates_io', 'Similar-crate search did not complete; exact result above still applies'),
      )
    }

    deps.log('crates_io.checked', { exact: exactMatches.length, similar: similarMatches.length })

    return buildResult({
      source: 'crates_io',
      status: statusFromMatches(exactMatches, similarMatches),
      exactMatches,
      similarMatches,
      evidence,
    })
  },
}
